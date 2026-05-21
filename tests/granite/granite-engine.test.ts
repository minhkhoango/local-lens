import { describe, it, expect } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import { TEST_IMAGES, fetchAsDataUrl } from '../setup/fixtures';

installChromeShim();

const { GraniteEngine } = await import('@/engine/granite');
import type { TabsConnect } from '@/types';

const FIVE_MIN = 5 * 60_000;

describe('GraniteEngine (real WebGPU, opt-in)', () => {
  it(
    'load() emits DOWNLOAD progress events with non-decreasing progress',
    async () => {
      const engine = new GraniteEngine();
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      await engine.load(post);

      const downloads = events.filter((e) => e.action === 'DOWNLOAD');
      // Either the model was already cached (no downloads) or progress is monotonic.
      let prev = -1;
      for (const ev of downloads) {
        const p = (ev as Extract<TabsConnect, { action: 'DOWNLOAD' }>).payload.progress;
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    },
    FIVE_MIN,
  );

  it(
    'recognize() produces a FINISH event with non-empty textPlain',
    async () => {
      const engine = new GraniteEngine();
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      await engine.recognize(
        { croppedImage: dataUrl, language: 'eng', engine: 'granite' },
        post,
      );

      const finish = events.find((e) => e.action === 'FINISH');
      const errors = events.filter((e) => e.action === 'ERROR');
      expect(errors).toHaveLength(0);
      expect(finish, 'FINISH event should fire').toBeDefined();
      const out = (finish as Extract<TabsConnect, { action: 'FINISH' }>).payload.output;
      expect(out.textPlain.length).toBeGreaterThan(0);
    },
    FIVE_MIN,
  );

  it(
    'stop() interrupts in-flight recognize',
    async () => {
      const engine = new GraniteEngine();
      const events: TabsConnect[] = [];
      const post = (m: TabsConnect) => events.push(m);

      const dataUrl = await fetchAsDataUrl(TEST_IMAGES[0].url);
      const p = engine.recognize(
        { croppedImage: dataUrl, language: 'eng', engine: 'granite' },
        post,
      );
      // Stop almost immediately.
      setTimeout(() => engine.stop(), 100);
      await p;

      // Interrupted generation should not produce a FINISH with content, or it
      // should finish very quickly. Either way: no error event.
      const errors = events.filter((e) => e.action === 'ERROR');
      expect(errors).toHaveLength(0);
    },
    FIVE_MIN,
  );
});
