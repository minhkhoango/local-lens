import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installChromeShim, uninstallChromeShim } from '../setup/chrome-shim';

installChromeShim();

const { FloatingIsland } = await import('@/island');

const flush = () => new Promise<void>((r) => setTimeout(r, 30));

async function makeIsland(): Promise<{ island: any; host: HTMLElement }> {
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
    /* webgpuSupported */ true,
  );
  island.mount();
  // Wait for storage + view.init() promises to resolve.
  await flush();
  await flush();

  const host = document.getElementById('xr-floating-island-host')!;
  return { island, host };
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
    (island as any).state.settings.autoCopy = true;
    const spy = vi.spyOn(navigator.clipboard, 'write');

    island.updateFinish({
      stage: 'done',
      output: { textPlain: 'copy me', textHtml: '<p>copy me</p>' },
    });
    await flush();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
