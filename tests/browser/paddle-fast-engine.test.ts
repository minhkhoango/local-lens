import { describe, it, expect, beforeAll } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

// Engine source needs `chrome.i18n.getMessage` / `chrome.runtime.getURL`
// available before it runs.
installChromeShim();

import { PaddleFastEngine } from '@/engine/paddle-fast';
import type { TabsConnect } from '@/types';

// Expected substrings imported as raw text via Vite's ?raw query.
const expectedRaw = import.meta.glob('../expected/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function expectedForImage(key: string): string[] {
  for (const [path, content] of Object.entries(expectedRaw)) {
    if (path.includes(key)) {
      return content
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return [];
}

// Paddle confidence is 0–1; the engine rescales to 0–100 to match Tesseract's surface.
const MIN_CONFIDENCE = 30;

describe('PaddleFastEngine (real ONNX runtime, headless Chromium)', () => {
  let engine: PaddleFastEngine;

  beforeAll(async () => {
    engine = new PaddleFastEngine();
    await engine.load('eng');
  }, 120_000);

  for (const img of TEST_IMAGES) {
    it(
      `recognizes ${img.name} with expected substrings`,
      async () => {
        const dataUrl = await fetchAsDataUrl(img.url);
        const events: TabsConnect[] = [];
        const post = (m: TabsConnect) => events.push(m);

        await engine.recognize(
          { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
          post,
        );

        const finish = events.find((e) => e.action === 'FINISH');
        const errors = events.filter((e) => e.action === 'ERROR');
        const progress = events.find(
          (e) =>
            e.action === 'PROGRESS' &&
            (e.payload as { stage?: string }).stage === 'recognizing',
        );

        expect(errors).toHaveLength(0);
        expect(progress, 'progress event should fire').toBeDefined();
        expect(finish, 'finish event should fire').toBeDefined();

        const out = (finish as Extract<TabsConnect, { action: 'FINISH' }>)
          .payload.output;
        expect(out.textPlain.length).toBeGreaterThan(0);
        expect(out.textHtml.length).toBeGreaterThan(0);

        const text = out.textPlain.toLowerCase();
        const expected = expectedForImage(img.expectedKey);
        expect(
          expected.length,
          `expected substrings file for ${img.expectedKey}`,
        ).toBeGreaterThan(0);
        for (const phrase of expected) {
          expect(
            text,
            `expected substring "${phrase}" in OCR output of ${img.name}`,
          ).toContain(phrase.toLowerCase());
        }

        expect(engine.lastConfidence).not.toBeNull();
        expect(engine.lastConfidence!).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      },
      120_000,
    );
  }
});

// These regression tests cover the silent-hang failure mode: concurrent load+recognize
// from offscreen.ts (which previously raced) and unreachable model URLs (which
// previously left the UI stuck at "Loading model..." instead of surfacing an error).
describe('PaddleFastEngine resilience', () => {
  function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout: ${label} after ${ms}ms`)), ms),
      ),
    ]);
  }

  it(
    'load() called concurrently with recognize() dedupes and finishes without hang',
    async () => {
      const engine = new PaddleFastEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await withTimeout(
        Promise.all([
          engine.load('eng', post),
          engine.recognize(
            { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
            post,
          ),
        ]),
        120_000,
        'concurrent load+recognize',
      );

      const errors = events.filter((e) => e.action === 'ERROR');
      const finish = events.find((e) => e.action === 'FINISH');
      expect(errors).toHaveLength(0);
      expect(finish, 'recognize should still complete').toBeDefined();
    },
    150_000,
  );

  it(
    'emits a loading-model progress event before recognizing',
    async () => {
      const engine = new PaddleFastEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.recognize(
        { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
        post,
      );

      const stages = events
        .filter((e) => e.action === 'PROGRESS')
        .map((e) => (e.payload as { stage?: string }).stage);
      expect(stages).toContain('loading-model');
      const firstLoading = stages.indexOf('loading-model');
      const firstRecog = stages.indexOf('recognizing');
      expect(firstLoading).toBeGreaterThanOrEqual(0);
      expect(firstRecog).toBeGreaterThan(firstLoading);
    },
    120_000,
  );

  it(
    'surfaces an ERROR (does not hang) when model URLs 404',
    async () => {
      const engine = new PaddleFastEngine({
        detection: '/__missing__/det.ort',
        recognition: '/__missing__/rec.ort',
        charactersDictionary: '/__missing__/dict.txt',
      });
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await withTimeout(
        engine.recognize(
          { croppedImage: dataUrl, language: 'eng', engine: 'tesseract' },
          post,
        ),
        30_000,
        'recognize with bad URLs',
      );

      const errors = events.filter((e) => e.action === 'ERROR');
      const finish = events.find((e) => e.action === 'FINISH');
      expect(finish, 'should not produce FINISH on bad URLs').toBeUndefined();
      expect(errors.length, 'should surface at least one ERROR event').toBeGreaterThanOrEqual(1);
    },
    45_000,
  );
});
