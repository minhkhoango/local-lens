/**
 * Guards on `public/manifest.json` — specifically, the keys that change how the
 * OCR engine runs without touching a single line of engine code.
 *
 * v1.5.0 added `cross_origin_embedder_policy` and `cross_origin_opener_policy`
 * to the manifest. Those keys apply to every extension page, so the offscreen
 * document became cross-origin-isolated, `self.crossOriginIsolated` flipped to
 * true, and this line in src/offscreen.ts went from 1 thread to 4:
 *
 *     ort.env.wasm.numThreads = wasmCrossOriginIsolated
 *       ? Math.min(navigator.hardwareConcurrency ?? 4, 4)
 *       : 1;
 *
 * Nothing in the diff said so, the comment above that line asserted the
 * opposite, and no test or bench ran against the threaded path. This file is
 * the missing link: enabling isolation is a real change to inference, and it
 * should have to be made on purpose.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'public/manifest.json'), 'utf8'),
) as Record<string, unknown>;
const offscreenSource = readFileSync(resolve(root, 'src/offscreen.ts'), 'utf8');

describe('manifest cross-origin isolation', () => {
  it.each(['cross_origin_embedder_policy', 'cross_origin_opener_policy'])(
    'does not declare %s',
    (key) => {
      expect(
        manifest[key],
        `Declaring ${key} makes extension pages cross-origin-isolated, which ` +
          'switches onnxruntime-web to multi-threaded WASM in the offscreen ' +
          'document. If that is intended, benchmark it and update this test.',
      ).toBeUndefined();
    },
  );

  it('keeps the wasm-unsafe-eval CSP the engines need', () => {
    const csp = manifest.content_security_policy as { extension_pages: string };
    expect(csp.extension_pages).toContain("'wasm-unsafe-eval'");
  });
});

describe('offscreen ORT bootstrap', () => {
  // onnxruntime-web's worker-ready promise has no reject path, so the default
  // initTimeout of 0 ("wait forever") turns a failed wasm/pthread bootstrap
  // into a permanent silent hang rather than an error anyone can report.
  it('bounds ORT wasm init instead of waiting forever', () => {
    expect(offscreenSource).toMatch(/ort\.env\.wasm\.initTimeout\s*=/);
    expect(
      offscreenSource,
      'initTimeout must be a positive number of milliseconds',
    ).not.toMatch(/ort\.env\.wasm\.initTimeout\s*=\s*0\b/);
  });

  it('only asks for threads when the page is actually isolated', () => {
    expect(offscreenSource).toMatch(/self\.crossOriginIsolated === true/);
  });
});
