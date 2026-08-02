/**
 * Guards on `public/manifest.json` — specifically, the keys that change how the
 * OCR engine runs without touching a single line of engine code.
 *
 * `cross_origin_embedder_policy` and `cross_origin_opener_policy` apply to every
 * extension page, so they decide whether the offscreen document is
 * cross-origin-isolated — which decides whether onnxruntime-web runs WASM
 * inference on 4 threads or 1. v1.5.0 set them deliberately for exactly that
 * reason, while a stale comment in src/offscreen.ts asserted the opposite was
 * even possible.
 *
 * So the invariant worth pinning is not "isolation is off" but "nobody changes
 * this without knowing what it costs": dropping the keys makes the wasm-pinned
 * layout model — the dominant cost of the structured engine — roughly 2.8x
 * slower, with no WebGPU fallback available for those graphs.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'public/manifest.json'), 'utf8'),
) as Record<string, unknown>;
const offscreenSource = readFileSync(resolve(root, 'src/offscreen.ts'), 'utf8');

const WHY_ISOLATION =
  'Removing this key makes extension pages non-isolated, which drops ' +
  'onnxruntime-web to single-threaded WASM in the offscreen document (~2.8x ' +
  'slower on the wasm-pinned layout model). If that is intended, benchmark it ' +
  'with `npm run test:bench` and update this test.';

describe('manifest cross-origin isolation', () => {
  it.each([
    ['cross_origin_embedder_policy', 'require-corp'],
    ['cross_origin_opener_policy', 'same-origin'],
  ])('declares %s so the offscreen document stays isolated', (key, value) => {
    expect(manifest[key], WHY_ISOLATION).toEqual({ value });
  });

  it('keeps the wasm-unsafe-eval CSP the engines need', () => {
    const csp = manifest.content_security_policy as { extension_pages: string };
    expect(csp.extension_pages).toContain("'wasm-unsafe-eval'");
  });
});

describe('offscreen ORT bootstrap', () => {
  /**
   * Read the value assigned to `ort.env.wasm.initTimeout`, following one level
   * of `const` indirection. Asserting on the source text alone is too weak: the
   * assignment names a constant, so a regex against this line would happily
   * pass with that constant set to 0 — the exact value that means "hang
   * forever".
   */
  function resolvedInitTimeout(): number | null {
    const assignment = offscreenSource.match(
      /^\s*ort\.env\.wasm\.initTimeout\s*=\s*([A-Za-z0-9_]+)\s*;/m,
    );
    if (!assignment) return null;
    const literal = Number(assignment[1].replace(/_/g, ''));
    if (Number.isFinite(literal)) return literal;

    const constant = offscreenSource.match(
      new RegExp(`const\\s+${assignment[1]}\\s*=\\s*([0-9_]+)\\s*;`),
    );
    return constant ? Number(constant[1].replace(/_/g, '')) : null;
  }

  // onnxruntime-web's pthread bootstrap has no reject path, so the default
  // initTimeout of 0 ("wait forever") turns a failed wasm/worker start into a
  // permanent silent hang rather than an error anyone can report.
  it('bounds ORT wasm init instead of waiting forever', () => {
    const timeout = resolvedInitTimeout();
    expect(timeout, 'ort.env.wasm.initTimeout must be assigned').not.toBeNull();
    expect(
      timeout,
      'initTimeout must be a positive number of milliseconds; 0 means "wait forever"',
    ).toBeGreaterThan(0);
  });

  it('only asks for threads when the page is actually isolated', () => {
    expect(offscreenSource).toMatch(/self\.crossOriginIsolated === true/);
  });
});
