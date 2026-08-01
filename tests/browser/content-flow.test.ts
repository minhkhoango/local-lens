import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';
import type { TabsConnect } from '@/types';

/**
 * End-to-end-ish coverage of `src/content.ts`: the module that owns the overlay
 * and island lifecycles, and therefore owns every way the extension can leave a
 * page stuck. It is driven exactly as the service worker drives it — through
 * the `chrome.runtime.onMessage` listener it registers on import — with the
 * ports and the CAPTURE_VISIBLE_TAB round trip standing in for the worker and
 * the offscreen document.
 *
 * The overlay and island both render into `attachShadow({ mode: 'closed' })`,
 * so patch attachShadow to hand out open roots before importing them. That
 * lets the assertions read exactly what the user sees rather than poking at
 * private fields.
 */
const realAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
  return realAttachShadow.call(this, { ...init, mode: 'open' });
};

const OVERLAY_ID = 'xr-screenshot-reader-host';
const ISLAND_ID = 'xr-floating-island-host';

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

type ContentListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean | void;

/** A `chrome.runtime.Port` the test can drive from the offscreen side. */
interface RecordedPort {
  name: string;
  posted: TabsConnect[];
  /** Deliver a message to the content script, as the offscreen document would. */
  emit(msg: TabsConnect): void;
  /** Drop the port from the other end (offscreen document went away). */
  drop(): void;
  /** Did the content script hang up on its own? */
  hungUp(): boolean;
}

let ports: RecordedPort[] = [];
let capture: {
  resolve: () => void;
  reject: (err: Error) => void;
  requests: number;
};

const shim = installChromeShim();
await import('@/content');

const contentListener = shim.runtime.onMessage.addListener.mock
  .calls[0][0] as ContentListener;

/** An opaque but real PNG, big enough for any crop rect the tests draw. */
function screenshotDataUrl(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#101010';
  ctx.fillRect(20, 20, 400, 120);
  return canvas.toDataURL('image/png');
}

/**
 * Stand in for the service worker and the offscreen document: record every
 * port, and make CAPTURE_VISIBLE_TAB a deferred round trip so tests can decide
 * when — or whether — the screenshot lands, the way a cold worker does.
 */
function installExtensionHosts(): void {
  ports = [];
  let resolveCapture: () => void = () => {};
  let rejectCapture: (err: Error) => void = () => {};
  capture = {
    resolve: () => resolveCapture(),
    reject: (err) => rejectCapture(err),
    requests: 0,
  };

  (chrome.runtime.connect as any).mockImplementation(
    ({ name }: { name: string }) => {
      const messageListeners: Array<(msg: TabsConnect) => void> = [];
      const disconnectListeners: Array<() => void> = [];
      let hungUp = false;
      const recorded: RecordedPort = {
        name,
        posted: [],
        emit: (msg) => messageListeners.forEach((l) => l(msg)),
        drop: () => disconnectListeners.forEach((l) => l()),
        hungUp: () => hungUp,
      };
      ports.push(recorded);
      return {
        name,
        postMessage: (msg: TabsConnect) => recorded.posted.push(msg),
        disconnect: () => {
          hungUp = true;
        },
        onMessage: {
          addListener: (l: (m: TabsConnect) => void) =>
            messageListeners.push(l),
        },
        onDisconnect: {
          addListener: (l: () => void) => disconnectListeners.push(l),
        },
      };
    },
  );

  (chrome.runtime.sendMessage as any).mockImplementation(
    async (msg: { action: string }) => {
      switch (msg.action) {
        case 'CAPTURE_VISIBLE_TAB': {
          capture.requests += 1;
          return new Promise<void>((res, rej) => {
            resolveCapture = () => {
              // The worker pushes the screenshot to the content script first,
              // then answers the request — same order as background.ts.
              contentListener(
                {
                  action: 'CAPTURE_RESULT',
                  payload: { imageUrl: screenshotDataUrl() },
                },
                {},
                () => {},
              );
              res();
            };
            rejectCapture = rej;
          });
        }
        case 'ENSURE_OFFSCREEN':
          return { status: 'ok' };
        case 'GET_SHORTCUT':
          return { status: 'ok', shortcut: 'Alt+Shift+S' };
        default:
          return undefined;
      }
    },
  );
}

function overlayHost(): HTMLElement | null {
  return document.getElementById(OVERLAY_ID);
}

function islandHost(): HTMLElement | null {
  return document.getElementById(ISLAND_ID);
}

function overlayBanner(): string {
  return (
    overlayHost()?.shadowRoot?.querySelector('.banner span')?.textContent ?? ''
  );
}

function islandText(selector: string): string {
  return islandHost()?.shadowRoot?.querySelector(selector)?.textContent ?? '';
}

/** Drive the worker's activation handshake for one tab. */
async function activateOverlay({ isPdf = false } = {}): Promise<void> {
  contentListener(
    { action: 'PING_CONTENT', payload: { webGpuSupported: true } },
    {},
    () => {},
  );
  contentListener(
    { action: 'ACTIVATE_OVERLAY', payload: { imageUrl: null, isPdf } },
    {},
    () => {},
  );
  await flush();
}

/** The port content.ts opened for engine setup / for the OCR run. */
function setupPort(): RecordedPort {
  return ports[0];
}
function ocrPort(): RecordedPort {
  return ports[1];
}

/** A press-drag-release over the overlay, all in one turn like a real gesture. */
function dragSelect(): void {
  const canvas = overlayHost()!.shadowRoot!.querySelector('canvas')!;
  canvas.dispatchEvent(
    new MouseEvent('mousedown', {
      clientX: 30,
      clientY: 30,
      button: 0,
      bubbles: true,
    }),
  );
  document.dispatchEvent(
    new MouseEvent('mousemove', { clientX: 230, clientY: 180 }),
  );
  document.dispatchEvent(
    new MouseEvent('mouseup', { clientX: 230, clientY: 180 }),
  );
}

describe('content script activation flow', () => {
  beforeEach(() => {
    installExtensionHosts();
  });

  afterEach(() => {
    overlayHost()?.remove();
    islandHost()?.remove();
    document.querySelectorAll('embed').forEach((e) => e.remove());
    vi.restoreAllMocks();
  });

  it('opens a setup port and keeps the page clickable until the engine is ready', async () => {
    await activateOverlay();

    expect(overlayHost(), 'the overlay should mount').not.toBeNull();
    expect(setupPort().posted[0]).toMatchObject({ action: 'SETUP_BEGIN' });
    expect(
      overlayHost()!.style.pointerEvents,
      'clicks must pass through until the engine is ready',
    ).toBe('none');

    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();
    expect(overlayHost()!.style.pointerEvents).toBe('auto');
    expect(overlayBanner()).toMatch(/click and drag/i);
  });

  // ---------------------------------------------------------------------
  // Regression: the setup port listener only understood DOWNLOAD and
  // SETUP_DONE. An engine that failed to initialize posts ERROR, which fell
  // through — so activate() never ran, the overlay stayed inert over the page
  // (dimmed, for the structured engine) and the banner said "Loading model..."
  // forever.
  // ---------------------------------------------------------------------
  it('hands control back when the engine fails to initialize', async () => {
    await activateOverlay();
    setupPort().emit({
      action: 'ERROR',
      payload: { stage: 'error', error: 'session create failed' },
    });
    await flush();

    expect(overlayHost()!.style.pointerEvents).toBe('auto');
    expect(overlayBanner()).toMatch(/failed to load/i);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(overlayHost()).toBeNull();
  });

  it('hands control back when the offscreen document disappears during setup', async () => {
    await activateOverlay();
    setupPort().drop();
    await flush();

    expect(overlayHost()!.style.pointerEvents).toBe('auto');
    expect(overlayBanner()).toMatch(/failed to load/i);
  });

  it('is dismissable with Escape while the engine is still loading', async () => {
    await activateOverlay();
    // No SETUP_DONE: the model is still downloading.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();

    expect(overlayHost()).toBeNull();
  });
});

describe('content script capture flow', () => {
  beforeEach(() => {
    installExtensionHosts();
  });

  afterEach(() => {
    overlayHost()?.remove();
    islandHost()?.remove();
    document.querySelectorAll('embed').forEach((e) => e.remove());
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------
  // Regression: the drag used to be armed only after CAPTURE_VISIBLE_TAB came
  // back, so a gesture quicker than the worker was swallowed whole — no crop,
  // no island, and an overlay left covering the page.
  // ---------------------------------------------------------------------
  it('completes a drag that outruns the screenshot round trip', async () => {
    await activateOverlay();
    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();

    dragSelect();
    await flush();

    expect(capture.requests, 'the screenshot should have been requested').toBe(
      1,
    );
    expect(
      overlayHost(),
      'the overlay should be gone after the drag',
    ).toBeNull();
    expect(
      islandHost(),
      'the island should not wait for the screenshot',
    ).toBeNull();

    // The worker finally answers; only now may the crop and the island appear.
    capture.resolve();
    await flush();

    expect(
      islandHost(),
      'the island should mount once the crop is ready',
    ).not.toBeNull();
    const thumbnail = islandHost()!.shadowRoot!.querySelector(
      'img.image',
    ) as HTMLImageElement;
    expect(
      thumbnail.src.startsWith('data:image/png'),
      'crop should be a real PNG',
    ).toBe(true);
    expect(ocrPort().posted[0]).toMatchObject({ action: 'PERFORM_OCR' });
  });

  it('shows an error in the island when the screenshot never arrives', async () => {
    await activateOverlay();
    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();

    dragSelect();
    await flush();
    capture.reject(new Error('tab capture rate limit'));
    await flush();

    expect(
      islandHost(),
      'a finished drag must always produce a visible outcome',
    ).not.toBeNull();
    expect(islandText('.textarea')).toMatch(/could not capture/i);
    expect(islandText('.status')).toMatch(/error/i);
  });

  // ---------------------------------------------------------------------
  // Regression: nothing listened for the OCR port dropping, so an offscreen
  // document that died mid-run left the island spinning on "Recognizing..."
  // with its copy button disabled, forever.
  // ---------------------------------------------------------------------
  it('reports an error when the OCR port dies mid-run', async () => {
    await activateOverlay();
    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();
    dragSelect();
    await flush();
    capture.resolve();
    await flush();

    ocrPort().emit({
      action: 'PROGRESS',
      payload: { stage: 'recognizing', text: '' },
    });
    await flush();
    expect(islandText('.status')).toMatch(/recognizing/i);

    ocrPort().drop();
    await flush();

    expect(islandText('.status')).toMatch(/error/i);
    expect(islandText('.textarea')).toMatch(/stopped unexpectedly/i);
  });

  it('hangs up the OCR port once the run finishes', async () => {
    await activateOverlay();
    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();
    dragSelect();
    await flush();
    capture.resolve();
    await flush();

    ocrPort().emit({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: { textPlain: 'hello', textHtml: 'hello' },
      },
    });
    await flush();

    expect(islandText('.status')).toMatch(/extracted|copied/i);
    expect(ocrPort().hungUp(), 'a finished port should not be left open').toBe(
      true,
    );

    // A late disconnect on an already-finished run must not overwrite the result.
    ocrPort().drop();
    await flush();
    expect(islandText('.status')).not.toMatch(/error/i);
  });
});

// -----------------------------------------------------------------------
// Regression: PDF handling hung entirely off the worker's URL sniff
// (`pathname.endsWith('.pdf')`), which misses every PDF served without the
// extension — arxiv.org/pdf/2401.12345, Content-Disposition downloads. On
// those, mouse and key events stay inside Chrome's viewer plugin, so neither
// click-outside nor Escape ever reached the island and it could not be closed.
// -----------------------------------------------------------------------
describe('content script PDF detection', () => {
  beforeEach(() => {
    installExtensionHosts();
  });

  afterEach(() => {
    overlayHost()?.remove();
    islandHost()?.remove();
    document.querySelectorAll('embed').forEach((e) => e.remove());
    vi.restoreAllMocks();
  });

  async function islandOverPdfViewer(pdfEmbed: boolean): Promise<void> {
    if (pdfEmbed) {
      const embed = document.createElement('embed');
      embed.setAttribute('type', 'application/pdf');
      document.body.appendChild(embed);
    }
    // The worker says "not a PDF" — the URL gave it nothing to go on.
    await activateOverlay({ isPdf: false });
    setupPort().emit({ action: 'SETUP_DONE' });
    await flush();
    dragSelect();
    await flush();
    capture.resolve();
    await flush();
  }

  it('recognises the viewer from the DOM when the URL did not say .pdf', async () => {
    await islandOverPdfViewer(true);
    expect(islandHost()).not.toBeNull();

    // The PDF plugin swallows the click, so the only signal the page gets is
    // the window losing focus. The island must act on it.
    window.dispatchEvent(new Event('blur'));
    await flush();

    expect(
      islandHost(),
      'the island must be closable on a PDF the URL did not advertise',
    ).toBeNull();
  });

  it('leaves the blur fallback off on an ordinary page', async () => {
    await islandOverPdfViewer(false);
    expect(islandHost()).not.toBeNull();

    window.dispatchEvent(new Event('blur'));
    await flush();

    expect(
      islandHost(),
      'alt-tabbing away must not discard the result',
    ).not.toBeNull();
  });
});
