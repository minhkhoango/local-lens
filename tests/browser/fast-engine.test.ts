import { describe, it, expect, beforeAll, vi } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

// Engine source needs `chrome.runtime.getURL` available before it runs.
installChromeShim();

import { FastEngine } from '@/engine/fast';
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

// Paddle confidence is 0–1; the engine rescales to 0–100 for the surface API.
const MIN_CONFIDENCE = 30;

describe('FastEngine (real ONNX runtime, headless Chromium)', () => {
  let engine: FastEngine;

  beforeAll(async () => {
    engine = new FastEngine();
    await engine.load();
  }, 120_000);

  for (const img of TEST_IMAGES) {
    it(
      `recognizes ${img.name} with expected substrings`,
      async () => {
        const dataUrl = await fetchAsDataUrl(img.url);
        const events: TabsConnect[] = [];
        const post = (m: TabsConnect) => events.push(m);

        await engine.recognize(
          { croppedImage: dataUrl, engine: 'fast' },
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
describe('FastEngine resilience', () => {
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
      const engine = new FastEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await withTimeout(
        Promise.all([
          engine.load(undefined, post),
          engine.recognize(
            { croppedImage: dataUrl, engine: 'fast' },
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
      const engine = new FastEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.recognize(
        { croppedImage: dataUrl, engine: 'fast' },
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
      const engine = new FastEngine({
        detection: '/__missing__/det.ort',
        recognition: '/__missing__/rec.ort',
        charactersDictionary: '/__missing__/dict.txt',
      });
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await withTimeout(
        engine.recognize(
          { croppedImage: dataUrl, engine: 'fast' },
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

// The warm-stop contract: stop() must leave the loaded model in memory so the
// UI island closing/reopening does not trigger a multi-second cold reload. We
// prove the *exact same* underlying service instance survives stop() and is
// reused by a later load()/recognize() instead of being rebuilt.
describe('FastEngine warm-stop reuse', () => {
  it(
    'keeps the service warm across stop() so the next load()/recognize() reuses it',
    async () => {
      const engine = new FastEngine();
      await engine.load();

      // Reach into the private service handle to assert instance identity.
      const internals = engine as unknown as { service: object | null };
      const loadedService = internals.service;
      expect(loadedService, 'service should exist after load()').not.toBeNull();

      // Warm stop must NOT destroy or null out the service.
      await engine.stop();
      expect(
        internals.service,
        'warm stop() must NOT tear down the loaded service',
      ).toBe(loadedService);

      // A second load() must short-circuit via `if (this.service) return`
      // (which logs "reusing paddle service") rather than rebuilding sessions.
      const debugSpy = vi.spyOn(console, 'debug');
      await engine.load();
      const reused = debugSpy.mock.calls.some((args) =>
        String(args[0] ?? '').includes('reusing paddle service'),
      );
      debugSpy.mockRestore();
      expect(reused, 'load() after stop() should reuse the warm service').toBe(
        true,
      );
      expect(
        internals.service,
        'service instance preserved after a second load()',
      ).toBe(loadedService);

      // And a real recognize() still succeeds on the warm service, without
      // swapping the instance (i.e. no cold re-init happened).
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      await engine.recognize(
        { croppedImage: dataUrl, engine: 'fast' },
        (m) => events.push(m),
      );
      expect(
        internals.service,
        'service instance unchanged across recognize()',
      ).toBe(loadedService);
      expect(events.filter((e) => e.action === 'ERROR')).toHaveLength(0);
      expect(
        events.some((e) => e.action === 'FINISH'),
        'recognize() on the warm service should still FINISH',
      ).toBe(true);
    },
    120_000,
  );
});
