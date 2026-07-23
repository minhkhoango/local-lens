import { describe, it, expect } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

import { StructuredEngine } from '@/engine/structured';
import type { TabsConnect } from '@/types';

/**
 * Render a BORDERLESS table (the case SLANet + a document layout model fail on)
 * to a PNG data URL: white background, plain system font, NO rule lines, wide
 * whitespace gaps between columns so the OCR detector emits one box per cell.
 * A header row plus two data rows, using distinctive dictionary words that
 * survive OCR cleanly for tolerant substring assertions.
 */
function drawBorderlessTableDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#111111';
  ctx.font = '32px sans-serif';
  ctx.textBaseline = 'alphabetic';

  const colX = [40, 300, 500];
  const rowY = [70, 150, 230];
  const cells = [
    ['Product', 'Price', 'Stock'],
    ['Apple', '150', '220'],
    ['Mango', '300', '410'],
  ];
  for (let r = 0; r < rowY.length; r++) {
    for (let c = 0; c < colX.length; c++) {
      ctx.fillText(cells[r][c], colX[c], rowY[r]);
    }
  }
  return canvas.toDataURL('image/png');
}

describe('StructuredEngine (real ONNX runtime, headless Chromium)', () => {
  it(
    'load() emits a loading-model PROGRESS and completes',
    async () => {
      const engine = new StructuredEngine();
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.load(undefined, post);

      const errors = events.filter((e) => e.action === 'ERROR');
      const loading = events.find(
        (e) =>
          e.action === 'PROGRESS' &&
          (e.payload as { stage?: string }).stage === 'loading-model',
      );
      expect(errors).toHaveLength(0);
      expect(loading, 'loading-model PROGRESS should fire').toBeDefined();
    },
    300_000,
  );

  it(
    'recognize() returns a FINISH with semantic HTML and non-empty plain text',
    async () => {
      const engine = new StructuredEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.recognize(
        { croppedImage: dataUrl, engine: 'structured' },
        post,
      );

      const errors = events.filter((e) => e.action === 'ERROR');
      const finish = events.find((e) => e.action === 'FINISH');
      expect(errors).toHaveLength(0);
      expect(finish, 'finish event should fire').toBeDefined();

      const out = (finish as Extract<TabsConnect, { action: 'FINISH' }>)
        .payload.output;
      expect(out.textPlain.length).toBeGreaterThan(0);
      expect(out.textHtml.length).toBeGreaterThan(0);
      // At least one semantic block tag from the composer should appear.
      expect(out.textHtml).toMatch(/<(h1|h2|h3|p|ul|pre|figcaption)>/);
    },
    300_000,
  );

  it(
    'recognize() emits a <table> for a BORDERLESS table screenshot',
    async () => {
      // The exact case that degrades to <pre>/paragraphs today: a borderless
      // table the layout model tends to label `text` (so SLANet never runs).
      // The geometric fallback must still reconstruct a real <table>.
      const engine = new StructuredEngine();
      const dataUrl = drawBorderlessTableDataUrl();
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.recognize(
        { croppedImage: dataUrl, engine: 'structured' },
        post,
      );

      const errors = events.filter((e) => e.action === 'ERROR');
      const finish = events.find((e) => e.action === 'FINISH');
      expect(errors).toHaveLength(0);
      expect(finish, 'finish event should fire').toBeDefined();

      const out = (finish as Extract<TabsConnect, { action: 'FINISH' }>)
        .payload.output;
      // Hard requirement: a real table tag must be emitted.
      expect(out.textHtml).toContain('<table>');
      // Tolerant cell-content checks: a couple of unambiguous tokens should
      // appear inside the reconstructed table (allow for minor OCR noise).
      expect(out.textHtml).toMatch(/Apple/i);
      expect(out.textHtml).toMatch(/Mango/i);
    },
    300_000,
  );

  it(
    'stop() during recognize() halts without ERROR',
    async () => {
      const engine = new StructuredEngine();
      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      const running = engine.recognize(
        { croppedImage: dataUrl, engine: 'structured' },
        post,
      );
      setTimeout(() => {
        void engine.stop();
      }, 200);
      await running;

      const errors = events.filter((e) => e.action === 'ERROR');
      expect(errors).toHaveLength(0);
    },
    300_000,
  );
});
