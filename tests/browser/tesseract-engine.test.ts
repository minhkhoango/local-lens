import { describe, it, expect, beforeAll } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

// Tesseract source needs `chrome.i18n.getMessage` available before it runs.
installChromeShim();

import { TesseractEngine } from '@/engine/tesseract';
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

const MIN_CONFIDENCE = 30;

describe('TesseractEngine (real WASM, headless Chromium)', () => {
  let engine: TesseractEngine;

  beforeAll(async () => {
    engine = new TesseractEngine();
    await engine.load('eng');
  }, 60_000);

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
        expect(expected.length, `expected substrings file for ${img.expectedKey}`).toBeGreaterThan(0);
        for (const phrase of expected) {
          expect(
            text,
            `expected substring "${phrase}" in OCR output of ${img.name}`,
          ).toContain(phrase.toLowerCase());
        }

        expect(engine.lastConfidence).not.toBeNull();
        expect(engine.lastConfidence!).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
      },
      90_000,
    );
  }
});
