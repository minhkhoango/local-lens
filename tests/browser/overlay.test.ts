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

  it('Escape dismisses the overlay while setup is still pending', async () => {
    // Regression: activate() used to be the only thing that bound Escape, so a
    // structured-engine setup that never reported back left the page dimmed
    // with no way out but a reload.
    const overlay = new GhostOverlay(
      OVERLAY_CSS,
      false,
      'structured',
      () => {},
    );
    overlay.mount();
    await flush();

    expect(findOverlay(), 'overlay is up and the page is dark').not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();

    expect(findOverlay()).toBeNull();
    expect(overlay.isDestroyed).toBe(true);
  });

  it('names Escape in the structured-engine loading banner', async () => {
    const overlay = new GhostOverlay(
      OVERLAY_CSS,
      false,
      'structured',
      () => {},
    );
    overlay.mount();
    const banner = (overlay as any).notificationBanner as HTMLDivElement;
    expect(banner.querySelector('span')!.textContent).toMatch(/Esc/);
    overlay.destroy();
  });

  it('setupFailed() explains itself, then tears the overlay down', async () => {
    vi.useFakeTimers();
    try {
      const overlay = new GhostOverlay(
        OVERLAY_CSS,
        false,
        'structured',
        () => {},
      );
      overlay.mount();

      overlay.setupFailed('layout model is not a valid ONNX graph');

      const banner = (overlay as any).notificationBanner as HTMLDivElement;
      expect(banner.querySelector('span')!.textContent).toMatch(
        /Could not load/,
      );
      expect(findOverlay(), 'banner is still readable').not.toBeNull();

      vi.advanceTimersByTime(5000);
      expect(findOverlay()).toBeNull();
      expect(overlay.isDestroyed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores activate() and setupFailed() after the user dismissed it', async () => {
    const overlay = new GhostOverlay(
      OVERLAY_CSS,
      false,
      'structured',
      () => {},
    );
    overlay.mount();
    overlay.destroy();

    // A late SETUP_DONE / ERROR must not resurrect a dismissed overlay.
    overlay.activate();
    overlay.setupFailed('too late');
    await flush();

    expect(findOverlay()).toBeNull();
  });

  it('destroy() is idempotent', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast', () => {});
    overlay.mount();
    overlay.activate();
    overlay.destroy();
    expect(() => overlay.destroy()).not.toThrow();
    expect(findOverlay()).toBeNull();
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
