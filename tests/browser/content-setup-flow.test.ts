/**
 * The engine-setup handshake, driven through `content.ts` itself.
 *
 * `content.ts` had no test coverage at all, which is how a missing `case` in
 * one port listener shipped: the offscreen document posts ERROR when
 * `initEngine()` throws, the listener handled only DOWNLOAD and SETUP_DONE, and
 * the dropped message left the overlay dimming the page forever.
 *
 * The module is side-effect-only, so it is driven the way Chrome drives it —
 * through the `chrome.runtime.onMessage` listener it registers on import.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';
import { ISLAND_STORAGE } from '@/constants';
import type { StatusResponse, TabsConnect, TabsMessage } from '@/types';

type PortListener = (msg: TabsConnect) => unknown;

const OVERLAY_ID = 'xr-screenshot-reader-host';
const flush = () => new Promise<void>((r) => setTimeout(r, 20));
const findOverlay = () => document.getElementById(OVERLAY_ID);

const shim = installChromeShim();

/** Listeners registered by content.ts on import, in registration order. */
type TabsListener = (
  message: TabsMessage,
  sender: unknown,
  sendResponse: (r: StatusResponse) => void,
) => unknown;

await import('@/content');
const onTabsMessage = shim.runtime.onMessage.addListener.mock
  .calls[0][0] as TabsListener;

/**
 * Stand-in for the offscreen document's end of the OCR port. Captures whatever
 * `content.ts` registers so the test can post messages back at it.
 */
function stubPort() {
  const messageListeners: PortListener[] = [];
  const disconnectListeners: Array<() => void> = [];
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn: PortListener) => messageListeners.push(fn) },
    onDisconnect: {
      addListener: (fn: () => void) => disconnectListeners.push(fn),
    },
  };
  (globalThis as any).chrome.runtime.connect = vi.fn(() => port);
  return {
    port,
    post: (msg: TabsConnect) => messageListeners.forEach((fn) => fn(msg)),
    disconnect: () => disconnectListeners.forEach((fn) => fn()),
  };
}

/** Fire ACTIVATE_OVERLAY and wait for the overlay to mount and connect. */
async function activateOverlay(): Promise<void> {
  await new Promise<void>((resolve) => {
    onTabsMessage(
      {
        action: 'ACTIVATE_OVERLAY',
        payload: { imageUrl: null, isPdf: false },
      } as TabsMessage,
      {},
      () => resolve(),
    );
  });
  await flush();
}

describe('content.ts engine-setup handshake', () => {
  beforeEach(async () => {
    installChromeShim();
    // The structured engine is the one that paints the page 40% black on mount.
    await (globalThis as any).chrome.storage.local.set({
      [ISLAND_STORAGE]: {
        engine: 'structured',
        autoCopy: false,
        autoExpand: false,
      },
    });
  });

  afterEach(() => {
    findOverlay()?.remove();
    uninstallChromeShim();
  });

  it('starts setup with a mounted, inert overlay', async () => {
    const { port } = stubPort();
    await activateOverlay();

    expect(findOverlay()).not.toBeNull();
    expect(port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SETUP_BEGIN' }),
    );
    // Not yet interactive — activate() has not run.
    expect(getComputedStyle(findOverlay()!).pointerEvents).toBe('none');
  });

  it('SETUP_DONE activates the overlay', async () => {
    const { post } = stubPort();
    await activateOverlay();

    post({ action: 'SETUP_DONE' });
    await flush();

    expect(getComputedStyle(findOverlay()!).pointerEvents).toBe('auto');
  });

  it('ERROR releases the page instead of dimming it forever', async () => {
    const { post } = stubPort();
    await activateOverlay();

    post({
      action: 'ERROR',
      payload: { stage: 'error', error: 'failed to load PP-DocLayoutV3.onnx' },
    });
    await flush();

    // The overlay explains itself and then goes away on its own.
    await vi.waitFor(() => expect(findOverlay()).toBeNull(), { timeout: 8000 });
  });

  it('a port that dies mid-setup releases the page too', async () => {
    const { disconnect } = stubPort();
    await activateOverlay();

    // Chrome reclaimed the offscreen document: no SETUP_DONE, no ERROR.
    disconnect();
    await flush();

    await vi.waitFor(() => expect(findOverlay()).toBeNull(), { timeout: 8000 });
  });

  it('a port closing after SETUP_DONE is not a failure', async () => {
    const { post, disconnect } = stubPort();
    await activateOverlay();

    post({ action: 'SETUP_DONE' });
    await flush();
    disconnect();
    await flush();

    expect(findOverlay()).not.toBeNull();
    expect(getComputedStyle(findOverlay()!).pointerEvents).toBe('auto');
  });

  it('Escape dismisses the overlay while setup is still pending', async () => {
    stubPort();
    await activateOverlay();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();

    expect(findOverlay()).toBeNull();
  });
});
