import { describe, it, beforeEach, afterEach } from 'vitest';
import { page } from '@vitest/browser/context';
import { installRealisticShim, mountBackdrop, unmountBackdrop, flush } from './shim';

installRealisticShim();

const { FloatingIsland } = await import('@/island');

async function newIsland(): Promise<any> {
  (chrome.runtime.sendMessage as any).mockImplementation(async (msg: any) => {
    if (msg?.action === 'GET_SHORTCUT') {
      return { status: 'ok', shortcut: 'Shift+Alt+S' };
    }
    return undefined;
  });

  const island: any = new FloatingIsland(
    { x: 600, y: 220 },
    '',
    false,
    true,
  );
  island.mount();
  await flush();
  await flush();
  return island;
}

const SAMPLE_TEXT = [
  'How to use Local Lens',
  '',
  'Activate by clicking the extension toggle in your browser',
  'toolbar or with Shift + Alt + S. Then, click and drag over the',
  'area you want to capture.',
].join('\n');

const SAMPLE_HTML = `
<h3>How to use Local Lens</h3>
<p>Activate by clicking the extension toggle in your browser toolbar or with
<strong>Shift</strong> + <strong>Alt</strong> + <strong>S</strong>. Then, click
and drag over the area you want to capture.</p>
<table>
  <thead><tr><th>Engine</th><th>Speed</th><th>Best for</th></tr></thead>
  <tbody>
    <tr><td>Fast</td><td>~1s</td><td>plain text</td></tr>
    <tr><td>Thinking</td><td>~5s</td><td>tables, math</td></tr>
  </tbody>
</table>
`.trim();

describe('FloatingIsland UI snapshots', () => {
  beforeEach(() => {
    installRealisticShim();
    mountBackdrop();
  });

  afterEach(() => {
    unmountBackdrop();
  });

  it('initial — collapsed pill with Loading model status', async () => {
    await newIsland();
    await flush();
    await page.screenshot({ path: 'output/island-initial.png', save: true });
  });

  it('recognizing — collapsed pill with Recognizing status', async () => {
    const island = await newIsland();
    island.updateProgress({ stage: 'recognizing', text: '' });
    await flush();
    await page.screenshot({ path: 'output/island-recognizing.png', save: true });
  });

  it('done tesseract — expanded textarea with plain text', async () => {
    const island = await newIsland();
    island.toggleTextareaExpand();
    island.updateFinish({
      stage: 'done',
      output: { textPlain: SAMPLE_TEXT, textHtml: SAMPLE_TEXT },
    });
    await flush();
    await page.screenshot({ path: 'output/island-done-tesseract.png', save: true });
  });

  it('done granite — expanded textarea with rendered HTML', async () => {
    const island = await newIsland();
    island.state.settings.engine = 'granite';
    island.view.updateSettingsSelects(island.state.settings);
    island.toggleTextareaExpand();
    island.updateFinish({
      stage: 'done',
      output: { textPlain: SAMPLE_TEXT, textHtml: SAMPLE_HTML },
    });
    await flush();
    await page.screenshot({ path: 'output/island-done-granite.png', save: true });
  });

  it('settings expanded — Auto-Copy / Auto-Expand / Shortcut row', async () => {
    const island = await newIsland();
    island.state.settings.engine = 'granite';
    island.view.updateSettingsSelects(island.state.settings);
    island.toggleTextareaExpand();
    island.toggleSettingsExpand();
    island.state.status = 'downloading';
    island.view.updateDownloadModel('downloading', true, 68);
    await flush();
    await page.screenshot({ path: 'output/island-settings-expanded.png', save: true });
  });

  it('engine warning — yellow Browser may freeze banner', async () => {
    const island = await newIsland();
    island.state.settings.engine = 'granite';
    island.view.updateSettingsSelects(island.state.settings);
    island.toggleTextareaExpand();
    island.state.status = 'downloading';
    island.state.firstEngineSwitch = true;
    island.view.updateDownloadModel('downloading', true, 25);
    island.view.warnBrowserFreeze();
    await flush(150);
    await page.screenshot({ path: 'output/island-engine-warning.png', save: true });
  });

  it('error — error status with error text', async () => {
    const island = await newIsland();
    island.toggleTextareaExpand();
    island.updateError({ stage: 'error', error: 'Image too small to OCR' });
    await flush();
    await page.screenshot({ path: 'output/island-error.png', save: true });
  });
});
