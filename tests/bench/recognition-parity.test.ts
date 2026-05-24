import { describe, it, expect, beforeAll } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

import { FastEngine, fp32ModelUrls } from '@/engine/fast';
import type { TabsConnect } from '@/types';

interface OcrResult {
  textPlain: string;
  textHtml: string;
  confidence: number | null;
}

async function runRecognize(
  engine: FastEngine,
  dataUrl: string,
): Promise<OcrResult> {
  const events: TabsConnect[] = [];
  await engine.recognize(
    { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
    (m) => events.push(m),
  );
  const finish = events.find((e) => e.action === 'FINISH');
  if (!finish) {
    const err = events.find((e) => e.action === 'ERROR');
    throw new Error(
      `no FINISH event; error: ${
        err ? JSON.stringify(err.payload) : 'none seen'
      }`,
    );
  }
  const payload = (finish as Extract<TabsConnect, { action: 'FINISH' }>)
    .payload;
  return {
    textPlain: payload.output.textPlain,
    textHtml: payload.output.textHtml,
    confidence: engine.lastConfidence,
  };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// Damerau-Levenshtein would be overkill; the standard edit distance is
// enough to flag "completely different text" vs "off by a couple chars".
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// Two recognitions of the same image should not diverge by more than ~5% of
// the longer text's length. This is a coarse parity check, not an exact
// match — quantized recognition can flip individual characters legitimately.
const MAX_DIFF_RATIO = 0.05;
const MAX_CONFIDENCE_DRIFT = 15;

describe('Recognition parity: int8 (default) vs fp32 PP-OCRv5 mobile rec', () => {
  // Default = int8 since the swap. fp32ModelUrls() is the explicit opt-in.
  let int8: FastEngine;
  let fp32: FastEngine;

  beforeAll(async () => {
    int8 = new FastEngine();
    fp32 = new FastEngine(fp32ModelUrls());
    await Promise.all([int8.load('eng'), fp32.load('eng')]);
  }, 300_000);

  for (const img of TEST_IMAGES) {
    it(
      `${img.name}: int8 output is close enough to fp32`,
      async () => {
        const dataUrl = await fetchAsDataUrl(img.url);
        const fp32Out = await runRecognize(fp32, dataUrl);
        const int8Out = await runRecognize(int8, dataUrl);

        const a = normalize(fp32Out.textPlain);
        const b = normalize(int8Out.textPlain);

        expect(a.length, 'fp32 output should be non-empty').toBeGreaterThan(0);
        expect(b.length, 'int8 output should be non-empty').toBeGreaterThan(0);

        const dist = editDistance(a, b);
        const maxLen = Math.max(a.length, b.length);
        const ratio = dist / maxLen;

        // Log the diff so the test output is useful even when it passes.
        // eslint-disable-next-line no-console
        console.log(
          `[parity] ${img.name}: dist=${dist} maxLen=${maxLen} ratio=${ratio.toFixed(
            3,
          )} fp32_conf=${fp32Out.confidence} int8_conf=${int8Out.confidence}`,
        );

        expect(
          ratio,
          `int8 vs fp32 edit distance ratio for ${img.name} exceeds ${MAX_DIFF_RATIO}`,
        ).toBeLessThanOrEqual(MAX_DIFF_RATIO);

        if (
          fp32Out.confidence !== null &&
          int8Out.confidence !== null
        ) {
          expect(
            Math.abs(fp32Out.confidence - int8Out.confidence),
            `confidence drift for ${img.name} exceeds ${MAX_CONFIDENCE_DRIFT}`,
          ).toBeLessThanOrEqual(MAX_CONFIDENCE_DRIFT);
        }
      },
      300_000,
    );
  }
});
