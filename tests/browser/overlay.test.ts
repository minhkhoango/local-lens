import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';
import type { SelectionRect } from '@/types';

installChromeShim();

const { GhostOverlay } = await import('@/overlay');

const OVERLAY_CSS = ''; // styles aren't required for behavioral assertions

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

function findOverlay(): HTMLElement | null {
  return document.getElementById('xr-screenshot-reader-host');
}

/**
 * Make CAPTURE_VISIBLE_TAB hang until the returned `resolve` is called, the way
 * a cold service worker does. Returns the deferred so a test can decide when —
 * or whether — the screenshot round trip completes.
 */
function deferCaptureRoundTrip(): {
  resolve: () => void;
  reject: (err: Error) => void;
  calls: () => number;
} {
  let resolveFn: () => void = () => {};
  let rejectFn: (err: Error) => void = () => {};
  let calls = 0;
  (chrome.runtime.sendMessage as any).mockImplementation(
    () =>
      new Promise<void>((res, rej) => {
        calls += 1;
        resolveFn = () => res();
        rejectFn = rej;
      }),
  );
  return {
    resolve: () => resolveFn(),
    reject: (err) => rejectFn(err),
    calls: () => calls,
  };
}

function pressLeft(canvas: HTMLCanvasElement, x: number, y: number): void {
  canvas.dispatchEvent(
    new MouseEvent('mousedown', {
      clientX: x,
      clientY: y,
      button: 0,
      bubbles: true,
    }),
  );
}

describe('GhostOverlay', () => {
  beforeEach(() => {
    installChromeShim();
  });

  afterEach(() => {
    findOverlay()?.remove();
    uninstallChromeShim();
  });

  it('shows "Click and drag" banner text for fast engine', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast', () => {});
    overlay.mount();
    const text = ((overlay as any).notificationBanner as HTMLDivElement)
      .querySelector('span')!.textContent;
    expect(text).toMatch(/Click and drag/);
    overlay.destroy();
  });

  it('shows "Loading model" banner text for structured engine', async () => {
    const overlay = new GhostOverlay(
      OVERLAY_CSS,
      false,
      'structured',
      () => {},
    );
    overlay.mount();
    const text = ((overlay as any).notificationBanner as HTMLDivElement)
      .querySelector('span')!.textContent;
    expect(text).toMatch(/Loading model/);
    overlay.destroy();
  });

  it('emits the SelectionRect on mouseup after drag', async () => {
    const selections: SelectionRect[] = [];
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast', (r) =>
      selections.push(r),
    );
    overlay.mount();
    overlay.activate();
    await flush();

    // Find the canvas inside the closed shadow root via the overlay instance.
    const canvas = (overlay as any).canvas as HTMLCanvasElement;

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 10, clientY: 20, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 110, clientY: 220 }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 110, clientY: 220 }));
    await flush();

    expect(selections, 'onSelection should fire exactly once').toHaveLength(1);
    const rect = selections[0];
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.width).toBeCloseTo(100, 0);
    expect(rect.height).toBeCloseTo(200, 0);
    expect(rect.devicePixelRatio).toBeGreaterThan(0);
  });

  it('Escape keydown destroys overlay without emitting a selection', async () => {
    const selections: SelectionRect[] = [];
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast', (r) =>
      selections.push(r),
    );
    overlay.mount();
    overlay.activate();
    await flush();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();

    expect(findOverlay()).toBeNull();
    expect(selections).toHaveLength(0);
  });

  // ---------------------------------------------------------------------
  // Regression: the drag used to be armed only AFTER the CAPTURE_VISIBLE_TAB
  // round trip resolved (content -> worker -> captureVisibleTab -> content).
  // On a cold service worker that is 200ms+, so any release that beat it was
  // dropped: the overlay stayed mounted over the page as a full-viewport,
  // pointer-events:auto layer and the page looked frozen. `backupMode` is TRUE
  // on ordinary pages (content.ts passes `!imageUrl`), so this is the default
  // path, not an edge case.
  // ---------------------------------------------------------------------
  describe('drag vs. the screenshot round trip', () => {
    it('emits the selection for a drag that finishes before the capture lands', async () => {
      const capture = deferCaptureRoundTrip();
      const selections: SelectionRect[] = [];
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'fast', (r) =>
        selections.push(r),
      );
      overlay.mount();
      overlay.activate();
      await flush();

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      // Press, drag and release with the capture still in flight.
      pressLeft(canvas, 10, 20);
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 110, clientY: 220 }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 110, clientY: 220 }),
      );
      await flush();

      expect(capture.calls(), 'the screenshot should have been asked for').toBe(
        1,
      );
      expect(selections, 'the drag must not be lost to the round trip').toHaveLength(1);
      expect(selections[0].width).toBeCloseTo(100, 0);
      expect(selections[0].height).toBeCloseTo(200, 0);

      capture.resolve();
      await flush();
    });

    it('closes on a plain click while the capture is still in flight', async () => {
      const capture = deferCaptureRoundTrip();
      const selections: SelectionRect[] = [];
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'fast', (r) =>
        selections.push(r),
      );
      overlay.mount();
      overlay.activate();
      await flush();

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      pressLeft(canvas, 40, 40);
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 40, clientY: 40 }),
      );
      await flush();

      expect(selections).toHaveLength(0);
      expect(
        findOverlay(),
        'clicking to cancel must remove the overlay, not leave it over the page',
      ).toBeNull();

      capture.resolve();
      await flush();
    });

    it('does not resurrect a phantom drag once the capture lands', async () => {
      const capture = deferCaptureRoundTrip();
      const selections: SelectionRect[] = [];
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'fast', (r) =>
        selections.push(r),
      );
      overlay.mount();
      overlay.activate();
      await flush();

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      // Click to cancel...
      pressLeft(canvas, 40, 40);
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 40, clientY: 40 }),
      );
      await flush();

      // ...then the screenshot arrives late and the user carries on using the
      // page. Nothing the overlay left behind may still be listening: it used
      // to arm the drag here, so the box tracked the cursor with no button
      // held and the next release cropped a rectangle nobody drew.
      capture.resolve();
      await flush();
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 600, clientY: 500 }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 600, clientY: 500 }),
      );
      await flush();

      expect(selections).toHaveLength(0);
      expect(findOverlay()).toBeNull();
    });

    it('hands the pending capture to onSelection so the crop can await it', async () => {
      const capture = deferCaptureRoundTrip();
      let handed: Promise<void> | null = null;
      const overlay = new GhostOverlay(
        OVERLAY_CSS,
        true,
        'fast',
        (_rect, captureReady) => {
          handed = captureReady;
        },
      );
      overlay.mount();
      overlay.activate();
      await flush();

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      pressLeft(canvas, 10, 10);
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 200, clientY: 200 }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 200, clientY: 200 }),
      );
      await flush();

      expect(handed, 'onSelection should receive the capture promise').toBeTruthy();
      let settled = false;
      void (handed as unknown as Promise<void>).then(() => {
        settled = true;
      });
      await flush();
      expect(settled, 'must still be pending while the worker is busy').toBe(false);

      capture.resolve();
      await flush();
      expect(settled, 'resolves once the screenshot has landed').toBe(true);
    });

    it('ignores non-left mouse buttons', async () => {
      const selections: SelectionRect[] = [];
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'fast', (r) =>
        selections.push(r),
      );
      overlay.mount();
      overlay.activate();
      await flush();

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      canvas.dispatchEvent(
        new MouseEvent('mousedown', {
          clientX: 10,
          clientY: 10,
          button: 2,
          bubbles: true,
        }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 200, clientY: 200 }),
      );
      await flush();

      expect(selections).toHaveLength(0);
      expect(findOverlay(), 'a right-click should leave the overlay alone').not.toBeNull();
      overlay.destroy();
    });
  });

  // ---------------------------------------------------------------------
  // Regression: Escape used to be wired in activate(), which only runs on
  // SETUP_DONE. A model that was slow, or an engine that failed to
  // initialize, therefore left an overlay that could not be dismissed at all.
  // ---------------------------------------------------------------------
  describe('dismissal does not depend on the engine', () => {
    it('Escape closes the overlay while the model is still loading', async () => {
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'structured', () => {});
      overlay.mount();
      await flush();
      // Deliberately no activate(): setup has not finished (or never will).

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await flush();

      expect(findOverlay()).toBeNull();
    });

    it('takes keyboard focus on mount so Escape is not lost to a subframe', async () => {
      const overlay = new GhostOverlay(OVERLAY_CSS, true, 'fast', () => {});
      overlay.mount();
      await flush();

      // Key events only reach the focused frame. On a PDF tab, focus sits in
      // Chrome's viewer plugin and a top-document `window` keydown listener
      // never fires — so the overlay pulls focus to itself instead.
      expect(document.activeElement).toBe(findOverlay());
      overlay.destroy();
    });

    it('activate() can report a setup failure and still allow selection', async () => {
      const selections: SelectionRect[] = [];
      const overlay = new GhostOverlay(OVERLAY_CSS, false, 'structured', (r) =>
        selections.push(r),
      );
      overlay.mount();
      overlay.activate('Model failed to load. Press Esc to close.');
      await flush();

      const text = ((overlay as any).notificationBanner as HTMLDivElement)
        .querySelector('span')!.textContent;
      expect(text).toMatch(/failed to load/i);

      const canvas = (overlay as any).canvas as HTMLCanvasElement;
      pressLeft(canvas, 10, 20);
      document.dispatchEvent(
        new MouseEvent('mousemove', { clientX: 110, clientY: 220 }),
      );
      document.dispatchEvent(
        new MouseEvent('mouseup', { clientX: 110, clientY: 220 }),
      );
      await flush();

      expect(selections, 'the user keeps control after a setup failure').toHaveLength(1);
    });
  });

  it('does not emit a selection when drag rectangle is < 5x5', async () => {
    const selections: SelectionRect[] = [];
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast', (r) =>
      selections.push(r),
    );
    overlay.mount();
    overlay.activate();
    await flush();

    const canvas = (overlay as any).canvas as HTMLCanvasElement;
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 52, clientY: 52 }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 52, clientY: 52 }));
    await flush();

    expect(selections).toHaveLength(0);
  });
});
