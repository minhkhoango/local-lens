import { describe, it, expect } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

import { StructuredEngine } from '@/engine/structured';
import type { TabsConnect } from '@/types';

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
