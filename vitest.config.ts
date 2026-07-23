import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { playwright } from '@vitest/browser-playwright';

/**
 * One config, four projects. Select with `--project <name>`:
 *
 *   unit        happy-dom, no browser process — pure logic (parsers, table code)
 *   browser     headless Chromium — anything touching DOM, canvas, or real ONNX
 *   structured  headless Chromium — PP-DocLayoutV3 + SLANet_plus, long timeouts
 *   snapshots   headless Chromium — writes UI screenshots to tests/ui-snapshots/output
 *   bench       headless Chromium — engine timing runs, very long timeouts
 *
 * Projects do NOT inherit root-level `test` options, so each one is explicit.
 * That is deliberate: the previous split across four config files needed
 * mergeConfig array-surgery to stay correct, and silently ran the wrong tests
 * when it drifted.
 */

const alias = {
  '@': resolve(__dirname, 'src'),
  'ppu-ocv/canvas': 'ppu-ocv/canvas-web',
};

/**
 * Serve the onnxruntime-web runtime under /paddle_engine/*, next to the ONNX
 * model + dict files Vite picks up from public/paddle_engine/. Returns a fresh
 * plugin instance per project because Vite plugins carry per-build state.
 */
function ortRuntimeAssets() {
  return viteStaticCopy({
    targets: [
      {
        src: [
          'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm',
          'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs',
          'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
          'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
        ],
        dest: 'paddle_engine',
      },
    ],
  });
}

/**
 * Enable the WebGPU path on a REAL GPU where one exists, and fall back cleanly
 * to Chromium's SwiftShader software adapter otherwise (the engines already
 * degrade WebGPU -> WASM on their own).
 *
 * NOTE: do NOT add `--use-vulkan=swiftshader` — that FORCES software Vulkan and
 * hides real-GPU regressions. `--ignore-gpu-blocklist` + ANGLE/Vulkan lets a
 * hardware adapter through when present without blocking the software fallback.
 */
const WEBGPU_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=vulkan',
  '--ignore-gpu-blocklist',
];

/**
 * Vitest derives one nested project per browser instance, and those derived
 * names share a namespace with the top-level project names. So the instance
 * name IS the project identity here — browser projects deliberately do not also
 * set `test.name`, or the two would collide.
 */
const chromium = (name: string, args: string[] = []) => ({
  enabled: true as const,
  provider: playwright(args.length ? { launchOptions: { args } } : {}),
  headless: true,
  instances: [{ browser: 'chromium', name }],
});

export default defineConfig({
  test: {
    /**
     * Vitest 4 leaks file handles when browser mode runs under `projects`, so
     * close() never resolves and every browser run pays the full teardown
     * timeout after the suite has already passed. Verified against 4.1.7 and
     * 4.1.10, and against an otherwise-identical flat (project-less) config,
     * which exits cleanly — so this is the `projects` wrapper, not our setup.
     *
     * Tests have finished and the exit code is unaffected by the time this
     * fires; capping it just stops us waiting 10s for a teardown that cannot
     * complete. Drop this line once upstream closes the handles.
     */
    teardownTimeout: 1_000,
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          // happy-dom, not a real browser: these modules are pure logic, but
          // several of them emit HTML and the tests parse it back to assert on
          // structure rather than on string formatting.
          environment: 'happy-dom',
        },
      },
      {
        resolve: { alias },
        plugins: [ortRuntimeAssets()],
        test: {
          include: ['tests/browser/**/*.test.ts'],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          browser: chromium('browser'),
        },
      },
      {
        resolve: { alias },
        plugins: [ortRuntimeAssets()],
        test: {
          include: ['tests/structured/**/*.test.ts'],
          // Bundles a ~130 MB PP-DocLayoutV3 ONNX model plus the PP-OCRv6
          // detector + recognizer, so it needs far more headroom than `browser`.
          testTimeout: 180_000,
          hookTimeout: 180_000,
          browser: chromium('structured', WEBGPU_ARGS),
        },
      },
      {
        resolve: { alias },
        test: {
          include: ['tests/ui-snapshots/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          browser: {
            ...chromium('snapshots'),
            viewport: { width: 1280, height: 800 },
          },
        },
      },
      {
        resolve: { alias },
        plugins: [ortRuntimeAssets()],
        test: {
          include: ['tests/bench/**/*.test.ts'],
          // First inference triggers kernel compilation in onnxruntime-web; the
          // bench files warm up per (engine, image) pair first. The ceiling
          // accommodates the structured engine's per-region OCR loop.
          testTimeout: 600_000,
          hookTimeout: 600_000,
          browser: chromium('bench', WEBGPU_ARGS),
        },
      },
    ],
  },
});
