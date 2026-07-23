import { describe, it, beforeAll } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

import {
  StructuredEngine,
  type StructuredModelUrls,
} from '@/engine/structured';
import type { TabsConnect } from '@/types';

// Structured engine end-to-end timing: layout (WASM-only, 124 MB model) plus
// per-region paddle recognition. Layout dominates the wall time. Only the
// smallest fixture is included by default to keep runs reasonable.

async function runRecognize(
  engine: StructuredEngine,
  dataUrl: string,
): Promise<void> {
  const events: TabsConnect[] = [];
  await engine.recognize(
    { croppedImage: dataUrl, engine: 'structured' },
    (m) => events.push(m),
  );
  const finish = events.find((e) => e.action === 'FINISH');
  if (!finish) {
    const err = events.find((e) => e.action === 'ERROR');
    throw new Error(
      `structured recognize() produced no FINISH: ${
        err ? JSON.stringify(err.payload) : 'no error event'
      }`,
    );
  }
}

interface Condition {
  label: string;
  modelUrls?: StructuredModelUrls;
}

interface Stat {
  mean: number;
  min: number;
  max: number;
}

const CONDITIONS: Condition[] = [{ label: 'default' }];

const ITERATIONS = 2;
const BENCH_IMAGES = [TEST_IMAGES[0]];

describe('StructuredEngine timing (real ONNX runtime)', () => {
  const results: Record<string, Record<string, Stat>> = {};

  for (const cond of CONDITIONS) {
    describe(cond.label, () => {
      let engine: StructuredEngine;
      let dataUrls: Record<string, string>;

      beforeAll(async () => {
        engine = new StructuredEngine(cond.modelUrls);
        const tLoad0 = performance.now();
        await engine.load();
        const loadMs = performance.now() - tLoad0;
        dataUrls = {};
        for (const img of BENCH_IMAGES) {
          dataUrls[img.name] = await fetchAsDataUrl(img.url);
          const t0 = performance.now();
          await runRecognize(engine, dataUrls[img.name]); // warm-up + cold-time
          const coldMs = performance.now() - t0;
          // eslint-disable-next-line no-console
          console.log(
            `[struct-cold] ${cond.label} | ${img.name} | first-call=${coldMs.toFixed(0)}ms (engine-load=${loadMs.toFixed(0)}ms)`,
          );
        }
        results[cond.label] = {};
      }, 900_000);

      for (const img of BENCH_IMAGES) {
        it(
          `${img.name}`,
          async () => {
            const samples: number[] = [];
            for (let i = 0; i < ITERATIONS; i++) {
              const t0 = performance.now();
              await runRecognize(engine, dataUrls[img.name]);
              samples.push(performance.now() - t0);
            }
            const s: Stat = {
              mean: samples.reduce((a, b) => a + b, 0) / samples.length,
              min: Math.min(...samples),
              max: Math.max(...samples),
            };
            results[cond.label][img.name] = s;
            // eslint-disable-next-line no-console
            console.log(
              `[struct-timing] ${cond.label} | ${img.name} | mean=${s.mean.toFixed(0)}ms min=${s.min.toFixed(0)}ms max=${s.max.toFixed(0)}ms n=${ITERATIONS}`,
            );
          },
          900_000,
        );
      }
    });
  }

  it('summary: all conditions × all images', () => {
    const header = ['condition', ...BENCH_IMAGES.map((i) => i.name)];
    const rows: string[][] = [header];
    for (const cond of CONDITIONS) {
      const row = [cond.label];
      for (const img of BENCH_IMAGES) {
        const s = results[cond.label]?.[img.name];
        row.push(s ? `${s.mean.toFixed(0)}ms` : '—');
      }
      rows.push(row);
    }
    const widths = header.map((_, ci) =>
      Math.max(...rows.map((r) => r[ci].length)),
    );
    // eslint-disable-next-line no-console
    console.log(
      '\n=== StructuredEngine timing summary (mean per recognize()) ===',
    );
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(r.map((c, ci) => c.padEnd(widths[ci])).join('  '));
    }
  });
});
