import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';

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
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast');
    overlay.mount();
    const text = ((overlay as any).notificationBanner as HTMLDivElement)
      .querySelector('span')!.textContent;
    expect(text).toMatch(/Click and drag/);
    overlay.destroy();
  });

  it('shows "Loading model" banner text for structured engine', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'structured');
    overlay.mount();
    const text = ((overlay as any).notificationBanner as HTMLDivElement)
      .querySelector('span')!.textContent;
    expect(text).toMatch(/Loading model/);
    overlay.destroy();
  });

  it('sends CAPTURE_SUCCESS with SelectionRect on mouseup after drag', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast');
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

    const calls = (chrome.runtime.sendMessage as any).mock.calls;
    const captureCall = calls.find(
      (c: any[]) => c[0]?.action === 'CAPTURE_SUCCESS',
    );
    expect(captureCall, 'CAPTURE_SUCCESS should be sent').toBeDefined();
    const payload = captureCall![0].payload;
    expect(payload.x).toBe(10);
    expect(payload.y).toBe(20);
    expect(payload.width).toBeCloseTo(100, 0);
    expect(payload.height).toBeCloseTo(200, 0);
  });

  it('Escape keydown destroys overlay without sending CAPTURE_SUCCESS', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast');
    overlay.mount();
    overlay.activate();
    await flush();

    (chrome.runtime.sendMessage as any).mockClear();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();

    expect(findOverlay()).toBeNull();
    const calls = (chrome.runtime.sendMessage as any).mock.calls;
    const captureCall = calls.find(
      (c: any[]) => c[0]?.action === 'CAPTURE_SUCCESS',
    );
    expect(captureCall).toBeUndefined();
  });

  it('does not send CAPTURE_SUCCESS when drag rectangle is < 5x5', async () => {
    const overlay = new GhostOverlay(OVERLAY_CSS, false, 'fast');
    overlay.mount();
    overlay.activate();
    await flush();

    (chrome.runtime.sendMessage as any).mockClear();

    const canvas = (overlay as any).canvas as HTMLCanvasElement;
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 52, clientY: 52 }),
    );
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 52, clientY: 52 }));
    await flush();

    const calls = (chrome.runtime.sendMessage as any).mock.calls;
    const captureCall = calls.find(
      (c: any[]) => c[0]?.action === 'CAPTURE_SUCCESS',
    );
    expect(captureCall).toBeUndefined();
  });
});
