/**
 * Shared harness for the v1.5.0 uninstall-bug reproductions.
 *
 * These scripts drive the REAL built extension in a real headed Chromium, the
 * way `tests/e2e/helpers/extension.ts` does, but they reproduce the paths that
 * harness never takes: PDF pages, `isPdf: true`, engine-setup failure, and the
 * offscreen document's cross-origin-isolation state.
 *
 * They are deliberately plain Node scripts rather than Playwright specs: each
 * one is a self-contained demonstration you can run and watch, and several need
 * their own browser profile and manifest variant per case.
 */
import { chromium } from 'playwright';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ISLAND_HOST = '#xr-floating-island-host';
export const OVERLAY_HOST = '#xr-screenshot-reader-host';

/** Playwright's bundled Chromium; override with REPRO_CHROME. */
export const CHROME =
  process.env.REPRO_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** The built extension under test. Point this at a 1.5.0 `dist/`. */
export const DIST = resolve(process.env.DIST_DIR ?? join(process.cwd(), 'dist'));

export const log = (...a) => console.log('[repro]', ...a);

/**
 * Copy `dist/` to a throwaway dir and apply manifest mutations.
 *
 * `host_permissions: ['<all_urls>']` mirrors what tests/e2e/helpers/extension.ts
 * already does: CDP automation cannot mint the interactive `activeTab` grant, so
 * the permission source differs but the OCR pipeline is byte-identical.
 */
export function buildExtension({
  stripCoopCoep = false,
  corruptLayoutModel = false,
  distDir = DIST,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'll-ext-'));
  cpSync(distDir, dir, { recursive: true });

  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  if (stripCoopCoep) {
    delete manifest.cross_origin_embedder_policy;
    delete manifest.cross_origin_opener_policy;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (corruptLayoutModel) {
    // Stands in for any real-world setup failure: partial install, disk error,
    // or an allocation failure loading the 124 MiB fp32 layout model.
    writeFileSync(
      join(dir, 'structured_engine', 'PP-DocLayoutV3.onnx'),
      'NOT-A-REAL-ONNX-GRAPH',
    );
  }
  return dir;
}

/** Launch a headed persistent context with the extension loaded. */
export async function launch(extDir, { windowSize } = {}) {
  const args = [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  if (windowSize) args.push(`--window-size=${windowSize.width},${windowSize.height}`);

  const context = await chromium.launchPersistentContext(
    mkdtempSync(join(tmpdir(), 'll-prof-')),
    {
      headless: false,
      executablePath: CHROME,
      viewport: windowSize ? null : undefined,
      args,
      permissions: ['clipboard-read', 'clipboard-write'],
    },
  );

  const serviceWorker =
    context.serviceWorkers().find((w) => w.url().includes('background')) ??
    (await context.waitForEvent('serviceworker', { timeout: 20_000 }));

  return { context, serviceWorker, extensionId: new URL(serviceWorker.url()).host };
}

/** Persist island settings the way the island's own <select>/toggles do. */
export async function setSettings(serviceWorker, settings) {
  await serviceWorker.evaluate(async (s) => {
    await chrome.storage.local.set({ islandSettings: s });
  }, settings);
}

/**
 * Reproduce `background.ts` activateOverlay() for a tab.
 *
 * NOTE the `isPdf` parameter. tests/e2e/helpers/extension.ts:408 hardcodes this
 * to `false`, which is precisely why the shipped suite never exercised the PDF
 * branch of `EventsController` (src/island/behavior.ts:106).
 */
export async function activateOverlay(serviceWorker, tabId, isPdf) {
  return await serviceWorker.evaluate(
    async ({ id, pdf }) => {
      const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')],
      });
      if (existing.length === 0) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['BLOBS'],
          justification: 'Local Lens repro',
        });
      }
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
      await new Promise((r) => setTimeout(r, 150));
      await chrome.tabs.sendMessage(id, {
        action: 'PING_CONTENT',
        payload: { webGpuSupported: false },
      });
      const resp = await chrome.tabs.sendMessage(id, {
        action: 'ACTIVATE_OVERLAY',
        payload: { imageUrl: null, isPdf: pdf },
      });
      return JSON.stringify(resp);
    },
    { id: tabId, pdf: isPdf },
  );
}

export async function activeTabId(serviceWorker) {
  return await serviceWorker.evaluate(async () => {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    return t?.id ?? null;
  });
}

export async function offscreenCount(serviceWorker) {
  return await serviceWorker.evaluate(async () => {
    const c = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')],
    });
    return c.length;
  });
}

export const hostPresent = (page, selector) =>
  page.evaluate((s) => !!document.querySelector(s), selector);

export async function waitForHost(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await hostPresent(page, selector)) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

/** Drag-select a rectangle, retrying until the island mounts. */
export async function dragUntilIsland(page, box, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    await page.mouse.move(box.x1, box.y1);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.move(box.x2, box.y2, { steps: 12 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    if (await waitForHost(page, ISLAND_HOST, 5_000)) return true;
    log(`  drag attempt ${i} — overlay not active yet (engine loading), retrying`);
  }
  return false;
}

/** What `background.ts:202` classifyUrl() would decide for a URL. */
export function classifyUrlIsPdf(url) {
  return new URL(url).pathname.toLowerCase().endsWith('.pdf');
}
