import { describe, it, beforeEach, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { installRealisticShim, mountBackdrop, unmountBackdrop, flush } from './shim';
import overlayCss from '@/styles/overlay.css?raw';

installRealisticShim();

const { GhostOverlay } = await import('@/overlay');

describe('GhostOverlay UI snapshots', () => {
  beforeEach(() => {
    installRealisticShim();
    mountBackdrop();
  });

  afterEach(() => {
    unmountBackdrop();
  });

  it('fast banner — Click and drag to extract text', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'fast');
    overlay.mount();
    overlay.activate();
    await flush();
    await page.screenshot({ path: 'output/overlay-fast.png', save: true });
  });

  it('structured banner — Loading model...', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'structured');
    overlay.mount();
    await flush();
    await page.screenshot({ path: 'output/overlay-structured.png', save: true });
  });

  it('dragging — selection rectangle through dim backdrop', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'fast');
    overlay.mount();
    overlay.activate();

    // Simulate mid-drag without dispatching real events, since the canvas
    // sits in a closed shadow root. Drive the private state directly.
    overlay.startPos = { x: 300, y: 200 };
    overlay.currentPos = { x: 720, y: 520 };
    overlay.isDragging = true;
    overlay.bgAlpha = 0.4;
    overlay.draw();
    overlay.notificationBanner.remove();

    await flush();
    await page.screenshot({ path: 'output/overlay-dragging.png', save: true });
  });
});
