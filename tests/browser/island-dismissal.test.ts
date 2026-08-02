/**
 * How the island gets dismissed — including on the pages where it could not be.
 *
 * Chrome renders a PDF as a single <embed type="application/pdf"> whose plugin
 * runs in its own process. Mouse and key events inside it never reach the
 * top-level document, so click-outside and Escape are both dead. The `isPdf`
 * blur fallback was the only survivor, and `isPdf` came from a `.pdf` filename
 * check in background.ts — so a PDF served from an extensionless endpoint had
 * no working dismissal path at all.
 *
 * The suite never caught it: tests/e2e/helpers/extension.ts hardcodes
 * `isPdf: false` and nothing asserted that any gesture dismisses the island.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';
import type { Point } from '@/types';

installChromeShim();

const { EventsController, isPluginDocument } =
  await import('@/island/behavior');
const { FloatingIsland } = await import('@/island/mount');

const HOST_ID = 'xr-floating-island-host';
const flush = () => new Promise<void>((r) => setTimeout(r, 30));
const findHost = () => document.getElementById(HOST_ID);

/**
 * `document.contentType` is read-only and a test page is always text/html, so
 * the plugin-document branch is exercised through the injected-document seam
 * rather than by faking the real one.
 */
const pdfDoc: Pick<Document, 'contentType'> = {
  contentType: 'application/pdf',
};
const htmlDoc: Pick<Document, 'contentType'> = { contentType: 'text/html' };

function makeController(
  isPdf: boolean,
  doc: Pick<Document, 'contentType'> = htmlDoc,
) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let destroyed = 0;
  const position: Point = { x: 100, y: 100 };
  const controller = new EventsController(
    host,
    isPdf,
    {
      onDestroy: () => destroyed++,
      onReposition: () => {},
      getCurrentPosition: () => position,
    },
    doc,
  );
  controller.attach();
  return {
    host,
    controller,
    destroyCount: () => destroyed,
    cleanup: () => {
      controller.destroy();
      host.remove();
    },
  };
}

async function makeIsland(isPdf: boolean) {
  (chrome.runtime.sendMessage as any).mockImplementation(async (msg: any) =>
    msg?.action === 'GET_SHORTCUT'
      ? { status: 'ok', shortcut: 'Shift+Alt+S' }
      : undefined,
  );

  const island = new FloatingIsland(
    { x: 100, y: 100 },
    '',
    isPdf,
    true,
    async () => {},
  );
  island.mount();
  await flush();
  await flush();

  return { island, shadow: (island as any).shadow as ShadowRoot };
}

describe('isPluginDocument()', () => {
  it('is false on an ordinary HTML page', () => {
    expect(isPluginDocument(htmlDoc)).toBe(false);
    // The real test-page document, which is also ordinary HTML.
    expect(isPluginDocument()).toBe(false);
  });

  it('is true when the document itself is the PDF, whatever the URL said', () => {
    expect(isPluginDocument(pdfDoc)).toBe(true);
  });

  it('ignores a PDF merely embedded in an ordinary page', () => {
    // Such a page routes mousedown and Escape to us perfectly well, so it must
    // NOT get the blur fallback — that also fires on a plain app switch, and
    // would throw away an OCR result the user had not copied yet.
    const embed = document.createElement('embed');
    embed.setAttribute('type', 'application/pdf');
    document.body.appendChild(embed);
    try {
      expect(isPluginDocument()).toBe(false);
    } finally {
      embed.remove();
    }
  });
});

describe('EventsController dismissal', () => {
  beforeEach(() => installChromeShim());
  afterEach(() => {
    uninstallChromeShim();
  });

  it('dismisses on click outside on an ordinary page', () => {
    const c = makeController(false);
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(c.destroyCount()).toBe(1);
    c.cleanup();
  });

  it('dismisses on Escape on an ordinary page', () => {
    const c = makeController(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c.destroyCount()).toBe(1);
    c.cleanup();
  });

  it('does not dismiss on a click inside the island', () => {
    const c = makeController(false);
    c.host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(c.destroyCount()).toBe(0);
    c.cleanup();
  });

  it('ignores window blur on an ordinary page', () => {
    const c = makeController(false);
    window.dispatchEvent(new Event('blur'));
    expect(c.destroyCount()).toBe(0);
    c.cleanup();
  });

  // The regression. `isPdf` is false because the URL had no .pdf suffix, but
  // the document really is the PDF viewer, so the blur fallback has to attach.
  it('attaches the blur fallback on a PDF document the URL sniff missed', () => {
    const c = makeController(/* isPdf from background.ts */ false, pdfDoc);

    expect(c.controller.treatsPageAsPdf).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(c.destroyCount()).toBe(1);
    c.cleanup();
  });

  it('still honours an explicit isPdf from the URL', () => {
    const c = makeController(true);
    expect(c.controller.treatsPageAsPdf).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(c.destroyCount()).toBe(1);
    c.cleanup();
  });

  it('detaches every listener on destroy', () => {
    const c = makeController(false, pdfDoc);
    c.controller.destroy();

    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    window.dispatchEvent(new Event('blur'));

    expect(c.destroyCount()).toBe(0);
    c.host.remove();
  });
});

describe('island close button', () => {
  beforeEach(() => installChromeShim());
  afterEach(() => {
    findHost()?.remove();
    uninstallChromeShim();
  });

  it('is rendered in the action row', async () => {
    const { shadow } = await makeIsland(false);
    const close = shadow.querySelector('.actions .close-btn');
    expect(close, 'close button should be rendered').toBeTruthy();
    expect(close!.getAttribute('aria-label')).toBe('Close');
  });

  it('dismisses the island when clicked', async () => {
    const { shadow } = await makeIsland(false);
    expect(findHost()).not.toBeNull();

    (shadow.querySelector('.close-btn') as HTMLButtonElement).click();
    await flush();

    expect(findHost()).toBeNull();
  });

  it('does not start a drag', async () => {
    const { shadow } = await makeIsland(false);
    const island = shadow.querySelector('.island') as HTMLElement;
    const before = island.style.left;

    const close = shadow.querySelector('.close-btn') as HTMLButtonElement;
    close.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 400,
        clientY: 400,
      }),
    );
    document.dispatchEvent(
      new MouseEvent('mousemove', { clientX: 600, clientY: 600 }),
    );
    await flush();

    expect(island.style.left).toBe(before);
    document.dispatchEvent(new MouseEvent('mouseup'));
  });
});
