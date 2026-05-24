import { describe, it, beforeAll } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

import {
  FastEngine,
  fp32ModelUrls,
  type ExecutionProvider,
  type PaddleModelUrls,
} from '@/engine/fast';
import type { TabsConnect } from '@/types';

// Plain-test timing harness: Vitest's experimental bench() was producing NaN
// in browser mode (no per-iteration data). performance.now() + iteration loop
// gives us the same headline number the user asked for ("inference speed in
// seconds") without depending on experimental tooling.

async function runRecognize(
  engine: FastEngine,
  dataUrl: string,
): Promise<void> {
  const events: TabsConnect[] = [];
  await engine.recognize(
    { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
    (m) => events.push(m),
  );
  const finish = events.find((e) => e.action === 'FINISH');
  if (!finish) {
    const err = events.find((e) => e.action === 'ERROR');
    throw new Error(
      `recognize() produced no FINISH: ${
        err ? JSON.stringify(err.payload) : 'no error event'
      }`,
    );
  }
}

interface Condition {
  label: string;
  modelUrls?: PaddleModelUrls;
  executionProviders: ExecutionProvider[];
}

interface Stat {
  mean: number;
  min: number;
  max: number;
  samples: number[];
}

function stat(samples: number[]): Stat {
  return {
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    min: Math.min(...samples),
    max: Math.max(...samples),
    samples,
  };
}

const ITERATIONS = 3;

// Run the WebGPU path too. The session may still fall back to WASM internally
// (Conv kernel missing in swiftshader), but we let the engine's own fallback
// path produce a number rather than skipping. In a real browser with a real
// GPU, WebGPU will exercise; here we surface that the path is effectively
// WASM-only and report the timing as such.
// Default model URLs are int8 since the swap. fp32 is the explicit opt-in.
const CONDITIONS: Condition[] = [
  { label: 'fp32 + WASM', modelUrls: fp32ModelUrls(), executionProviders: ['wasm'] },
  { label: 'int8 + WASM (default)', executionProviders: ['wasm'] },
  { label: 'fp32 + WebGPU (fallback to WASM ok)', modelUrls: fp32ModelUrls(), executionProviders: ['webgpu', 'wasm'] },
  { label: 'int8 + WebGPU (fallback to WASM ok) (default)', executionProviders: ['webgpu', 'wasm'] },
];

describe('FastEngine timing (real ONNX runtime)', () => {
  // Per-condition results stored at module scope so the final summary block
  // can print a single side-by-side table.
  const results: Record<string, Record<string, Stat>> = {};

  for (const cond of CONDITIONS) {
    describe(cond.label, () => {
      let engine: FastEngine;
      let dataUrls: Record<string, string>;

      beforeAll(async () => {
        engine = new FastEngine(cond.modelUrls, {
          executionProviders: cond.executionProviders,
        });
        const tLoad0 = performance.now();
        await engine.load('eng');
        const loadMs = performance.now() - tLoad0;
        dataUrls = {};
        for (const img of TEST_IMAGES) {
          dataUrls[img.name] = await fetchAsDataUrl(img.url);
          // Time the warm-up call too: this is the COLD-start latency the
          // user sees on their first OCR after the engine loads.
          const t0 = performance.now();
          await runRecognize(engine, dataUrls[img.name]);
          const coldMs = performance.now() - t0;
          // eslint-disable-next-line no-console
          console.log(
            `[fast-cold] ${cond.label} | ${img.name} | first-call=${coldMs.toFixed(0)}ms (engine-load=${loadMs.toFixed(0)}ms)`,
          );
        }
        results[cond.label] = {};
      }, 600_000);

      for (const img of TEST_IMAGES) {
        it(
          `${img.name}`,
          async () => {
            const samples: number[] = [];
            for (let i = 0; i < ITERATIONS; i++) {
              const t0 = performance.now();
              await runRecognize(engine, dataUrls[img.name]);
              samples.push(performance.now() - t0);
            }
            const s = stat(samples);
            results[cond.label][img.name] = s;
            // eslint-disable-next-line no-console
            console.log(
              `[fast-timing] ${cond.label} | ${img.name} | mean=${s.mean.toFixed(0)}ms min=${s.min.toFixed(0)}ms max=${s.max.toFixed(0)}ms n=${ITERATIONS}`,
            );
          },
          600_000,
        );
      }
    });
  }

  it('summary: all conditions × all images', () => {
    const header = ['condition', ...TEST_IMAGES.map((i) => i.name)];
    const rows: string[][] = [header];
    for (const cond of CONDITIONS) {
      const row = [cond.label];
      for (const img of TEST_IMAGES) {
        const s = results[cond.label]?.[img.name];
        row.push(s ? `${s.mean.toFixed(0)}ms` : '—');
      }
      rows.push(row);
    }
    const widths = header.map((_, ci) =>
      Math.max(...rows.map((r) => r[ci].length)),
    );
    // eslint-disable-next-line no-console
    console.log('\n=== FastEngine timing summary (mean per recognize()) ===');
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(r.map((c, ci) => c.padEnd(widths[ci])).join('  '));
    }
  });
});
