import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';

installChromeShim();

const { FloatingIsland } = await import('@/island/mount');

const flush = () => new Promise<void>((r) => setTimeout(r, 30));

async function makeIsland(
  onEngineChange: (engine: string) => Promise<void> = async () => {},
  webgpuSupported = true,
): Promise<{ island: any; host: HTMLElement; shadow: ShadowRoot }> {
  // chrome.runtime.sendMessage GET_SHORTCUT → return a stub shortcut response.
  (chrome.runtime.sendMessage as any).mockImplementation(async (msg: any) => {
    if (msg?.action === 'GET_SHORTCUT') {
      return { status: 'ok', shortcut: 'Shift+Alt+S' };
    }
    return undefined;
  });

  const island = new FloatingIsland(
    { x: 100, y: 100 },
    '',
    /* isPdf */ false,
    webgpuSupported,
    onEngineChange as any,
  );
  island.mount();
  // Wait for storage + view.init() promises to resolve.
  await flush();
  await flush();

  const host = document.getElementById('xr-floating-island-host')!;
  // The island uses a CLOSED shadow root, so host.shadowRoot is null from the
  // outside; reach it through the wrapper's own handle instead.
  const shadow = (island as any).shadow as ShadowRoot;
  return { island, host, shadow };
}

describe('FloatingIsland (DOM state)', () => {
  let installed = false;

  beforeEach(() => {
    installChromeShim();
    installed = true;
  });

  afterEach(() => {
    document.getElementById('xr-floating-island-host')?.remove();
    if (installed) uninstallChromeShim();
  });

  it('mounts host with shadow root and an island container', async () => {
    const { host } = await makeIsland();
    expect(host).toBeTruthy();
    // The View uses a CLOSED shadow root, so host.shadowRoot is null.
    // We assert mount via the host being attached.
    expect(host.isConnected).toBe(true);
  });

  it('updateProgress sets the textarea content and recognizing status', async () => {
    const { island } = await makeIsland();
    island.updateProgress({ stage: 'recognizing', text: 'partial output' });
    await flush();

    // We can't query the closed shadow root from outside, but the public
    // class state should reflect the change.
    expect((island as any).state.status).toBe('recognizing');
    expect((island as any).state.textarea).toBe('partial output');
  });

  it('updateFinish stores clipboard output and switches status to done', async () => {
    const { island } = await makeIsland();
    island.updateFinish({
      stage: 'done',
      output: { textPlain: 'hello', textHtml: 'hello' },
    });
    await flush();

    expect((island as any).state.status).toBe('done');
    expect((island as any).state.clipboardOutput.textPlain).toBe('hello');
    expect((island as any).state.clipboardOutput.textHtml).toBe('hello');
  });

  it('updateError sets status=error and stores the error message', async () => {
    const { island } = await makeIsland();
    island.updateError({ stage: 'error', error: 'boom' });
    await flush();

    expect((island as any).state.status).toBe('error');
    expect((island as any).state.textarea).toBe('boom');
  });

  it('autoCopy=true triggers navigator.clipboard.write on finish', async () => {
    const { island } = await makeIsland();
    (island as any).setSettings({ autoCopy: true });
    const spy = vi.spyOn(navigator.clipboard, 'write');

    island.updateFinish({
      stage: 'done',
      output: { textPlain: 'copy me', textHtml: '<p>copy me</p>' },
    });
    await flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  // The engine switcher used to post BG_PERFORM_OCR to the service worker,
  // which relayed it by chrome.tabs.sendMessage straight back to the content
  // script hosting this island. It now calls onEngineChange directly. Drive the
  // real <select> so the wiring, not just the handler, is under test.
  it('changing the engine <select> calls onEngineChange and enters loading', async () => {
    const requested: string[] = [];
    const { island, shadow } = await makeIsland(async (engine) => {
      requested.push(engine);
    });

    const select = shadow.querySelector(
      'select.settings-select',
    ) as HTMLSelectElement | null;
    expect(select, 'engine <select> should be rendered').toBeTruthy();
    expect(select!.value).toBe('fast');

    select!.value = 'structured';
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(requested).toEqual(['structured']);
    expect((island as any).state.settings.engine).toBe('structured');
    expect((island as any).state.status).toBe('loading-model');
  });

  // Regression: webgpuSupported and firstEngineSwitch were both written and
  // never read, and warnBrowserFreeze() had no production caller, so this
  // banner could never reach a real user despite its markup, CSS, background
  // GPU probe and persisted flag all being in place.
  it('warns about freezing on the first structured switch without WebGPU', async () => {
    // No GPU adapter → the structured pipeline is WASM-only on this machine.
    const { island, shadow } = await makeIsland(undefined, false);
    expect(
      (island as any).state.firstEngineSwitch,
      'fixture should be a first switch',
    ).toBe(true);

    const select = shadow.querySelector(
      'select.settings-select',
    ) as HTMLSelectElement;
    select.value = 'structured';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const banner = shadow.querySelector('.engine-warning');
    expect(banner, 'warning banner should be rendered').toBeTruthy();
    expect(banner!.className).toContain('show');
    expect(banner!.textContent).toContain('may freeze');
  });

  it('does not warn about freezing when a WebGPU adapter is available', async () => {
    const { shadow } = await makeIsland(undefined, true);

    const select = shadow.querySelector(
      'select.settings-select',
    ) as HTMLSelectElement;
    select.value = 'structured';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const banner = shadow.querySelector('.engine-warning');
    expect(banner!.className).toContain('hidden');
  });

  it('surfaces an error in the island when onEngineChange rejects', async () => {
    const { island, shadow } = await makeIsland(async () => {
      throw new Error('offscreen is gone');
    });

    const select = shadow.querySelector(
      'select.settings-select',
    ) as HTMLSelectElement;
    select.value = 'structured';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect((island as any).state.status).toBe('error');
    expect((island as any).state.textarea).toBe('offscreen is gone');
  });
});
