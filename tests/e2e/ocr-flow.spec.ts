import { test, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  describeEnvironmentSkip,
  launchExtensionContext,
  probeWebGpu,
  resolveHeadless,
  runOcrCapture,
  type LaunchResult,
  type OcrCaptureResult,
  type WebGpuReport,
} from './helpers/extension';

/**
 * REAL end-to-end: load the built extension into a real browser, trigger the
 * capture the way the extension itself does, drag-select a known region, and
 * verify the recognized text surfaces — plus measure real inference wall-clock
 * (including whatever provider the host offers: WebGPU where a GPU exists, else
 * WASM). See tests/e2e/README.md for how to point this at Chrome / Brave and
 * how to read the [e2e-timing] / [e2e-webgpu] output.
 */
const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

const headless = resolveHeadless();
const skipReason = describeEnvironmentSkip(headless);

function logWebGpu(gpu: WebGpuReport): void {
  console.log(
    `[e2e-webgpu] navigator.gpu=${gpu.hasNavigatorGpu} adapter=${gpu.adapterPresent} ` +
      `vendor=${gpu.vendor ?? '-'} architecture=${gpu.architecture ?? '-'} ` +
      `fallbackAdapter=${gpu.isFallbackAdapter ?? '-'} accelerated=${gpu.accelerated} ` +
      `crossOriginIsolated=${gpu.crossOriginIsolated}` +
      (gpu.error ? ` error=${gpu.error}` : ''),
  );
  if (!gpu.accelerated) {
    console.log(
      '[e2e-webgpu] No hardware-accelerated WebGPU adapter (software/absent) — ' +
        'GPU-specific assertions are skipped; timings below reflect the software/WASM path.',
    );
  }
}

function logResult(engine: string, r: OcrCaptureResult): void {
  console.log(
    `[e2e-timing] ${engine}: dragToFinish=${r.timings.dragToFinishMs}ms ` +
      `activateToFinish=${r.timings.activateToFinishMs}ms ` +
      `overlay=${r.overlayAppeared} island=${r.islandAppeared}` +
      (r.readError ? ` readError=${r.readError}` : ''),
  );
  console.log(`[e2e-result] ${engine} plain: ${JSON.stringify(r.plain.slice(0, 200))}`);
}

test.describe('Local Lens — real extension OCR (headed persistent context)', () => {
  test.skip(!!skipReason, skipReason ?? '');
  test.describe.configure({ mode: 'serial' });

  let launched: LaunchResult | null = null;

  test.beforeEach(async () => {
    launched = await launchExtensionContext({ distDir: DIST_DIR, headless });
    console.log(`[e2e] extension id: ${launched.extensionId} (headless=${headless})`);
  });

  test.afterEach(async () => {
    await launched?.cleanup();
    launched = null;
  });

  test('fast engine extracts known text from a text page', async () => {
    const { context, serviceWorker } = launched!;
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/text-page.html', { waitUntil: 'load' });

    logWebGpu(await probeWebGpu(page));

    const result = await runOcrCapture({
      serviceWorker,
      page,
      engine: 'fast',
      targetSelector: '#target',
      timeoutMs: 120_000,
    });
    logResult('fast', result);

    expect(result.overlayAppeared, 'the drag overlay should mount').toBe(true);
    expect(result.islandAppeared, 'the floating island should mount after the drag').toBe(true);
    expect(
      result.plain.length,
      `no text reached the island${result.readError ? ` (${result.readError})` : ''}`,
    ).toBeGreaterThan(0);

    const text = result.plain.toLowerCase();
    for (const token of ['quick', 'brown', 'fox', 'jumps', '12345']) {
      expect(text, `fast-engine OCR output should contain "${token}"`).toContain(token);
    }
  });

  test('structured engine reconstructs a table from a borderless table page', async () => {
    const { context, serviceWorker } = launched!;
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('/table-page.html', { waitUntil: 'load' });

    logWebGpu(await probeWebGpu(page));

    const result = await runOcrCapture({
      serviceWorker,
      page,
      engine: 'structured',
      targetSelector: '#target',
      timeoutMs: 200_000,
    });
    logResult('structured', result);
    console.log(`[e2e-result] structured html: ${result.html.slice(0, 400)}`);

    expect(result.overlayAppeared, 'the drag overlay should mount').toBe(true);
    expect(result.islandAppeared, 'the floating island should mount after the drag').toBe(true);
    expect(
      result.plain.length + result.html.length,
      `no output reached the island${result.readError ? ` (${result.readError})` : ''}`,
    ).toBeGreaterThan(0);

    // The structured engine reconstructs a real HTML table, rendered into the
    // island's result element as markup rather than escaped text.
    const html = result.html.toLowerCase();
    expect(
      /<table/.test(html) || /<td/.test(html),
      'structured output should contain a reconstructed <table>',
    ).toBe(true);

    const text = result.plain.toLowerCase();
    for (const token of ['fruit', 'apple', 'banana', 'cherry']) {
      expect(text, `structured OCR output should contain cell "${token}"`).toContain(token);
    }
  });
});
