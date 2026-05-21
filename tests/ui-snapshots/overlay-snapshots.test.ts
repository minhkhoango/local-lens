import { describe, it, beforeEach, afterEach } from 'vitest';
import { page } from '@vitest/browser/context';
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

  it('tesseract banner — Click and drag to extract text', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'tesseract');
    overlay.mount();
    overlay.activate();
    await flush();
    await page.screenshot({ path: 'output/overlay-tesseract.png', save: true });
  });

  it('granite banner — Loading model...', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'granite');
    overlay.mount();
    await flush();
    await page.screenshot({ path: 'output/overlay-granite.png', save: true });
  });

  it('dragging — selection rectangle through dim backdrop', async () => {
    const overlay: any = new GhostOverlay(overlayCss, false, 'tesseract');
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
