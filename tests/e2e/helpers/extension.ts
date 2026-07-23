import { chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * ============================================================================
 * Local Lens — real end-to-end harness helpers
 * ============================================================================
 *
 * This module drives the ACTUAL built extension in a real Chromium/Chrome/Brave
 * via a headed persistent context (MV3 extensions do not load in classic
 * headless). It reproduces, as faithfully as automation allows, exactly what a
 * user does: invoke the extension, drag-select a screen region, and read the
 * recognized text back out of the floating island.
 *
 * Two hard constraints shaped this design, both discovered empirically against
 * this codebase (see tests/e2e/README.md "Fidelity & limitations"):
 *
 *  1. The overlay and island render inside `attachShadow({ mode: 'closed' })`
 *     roots (src/overlay.ts, src/island/mount.ts). Their *host* elements
 *     (#xr-screenshot-reader-host / #xr-floating-island-host) are visible in the
 *     light DOM — so we can DETECT them — but the recognized text inside is not
 *     reachable from the page's main world. We read it over CDP instead:
 *     `DOM.getDocument({pierce: true})` descends into closed shadow roots, so
 *     the assertions see exactly the text the island shows the user.
 *
 *  2. The extension is gated on the `activeTab` permission, which Chromium only
 *     grants after a genuine user gesture on the action (toolbar click, the
 *     Alt+Shift+S command, or a context menu). Under CDP automation neither a
 *     synthetic `keyboard.press('Alt+Shift+S')` nor a service-worker call
 *     produces that grant, so `captureVisibleTab`/`executeScript` fail. To run
 *     unattended we load a copy of dist/ with one added line —
 *     `host_permissions: ["<all_urls>"]` — which replaces the activeTab grant.
 *     The OCR pipeline is byte-identical to production; only the permission
 *     source differs. See README for the fully-faithful xdotool alternative.
 */

export type EngineOption = 'fast' | 'structured';

/** Minimal shape of the `chrome.*` surface used inside service-worker evaluate bodies. */
interface ExtensionChrome {
  storage: { local: { set(items: Record<string, unknown>): Promise<void> } };
  tabs: {
    query(q: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number }>>;
    sendMessage(tabId: number, msg: unknown): Promise<unknown>;
  };
  runtime: {
    getURL(path: string): string;
    getContexts(filter: {
      contextTypes: string[];
      documentUrls: string[];
    }): Promise<unknown[]>;
  };
  offscreen: {
    createDocument(opts: {
      url: string;
      reasons: string[];
      justification: string;
    }): Promise<void>;
  };
  scripting: {
    executeScript(opts: {
      target: { tabId: number };
      files: string[];
    }): Promise<unknown>;
  };
}
// `chrome` only exists inside the browser/service-worker realms that Playwright
// evaluates into. Declaring it here keeps the evaluate bodies strictly typed
// without pulling @types/chrome into the Node-side test tsconfig.
declare const chrome: ExtensionChrome;

export interface LaunchOptions {
  /** Absolute path to the built extension (the `dist/` directory). */
  distDir: string;
  /**
   * 'headed' (default) opens a real window — required for the fully real GPU +
   * input path, needs a display (WSLg/X11/Wayland or xvfb-run on Linux).
   * 'new' uses Chromium's new headless (`--headless=new`), which DOES load MV3
   * extensions and needs no display, but typically exposes no WebGPU adapter.
   */
  headless?: 'headed' | 'new';
}

export interface LaunchResult {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  /** Closes the context and removes the temp user-data + patched-extension dirs. */
  cleanup: () => Promise<void>;
}

export interface WebGpuReport {
  hasNavigatorGpu: boolean;
  adapterPresent: boolean;
  crossOriginIsolated: boolean;
  vendor: string | null;
  architecture: string | null;
  device: string | null;
  isFallbackAdapter: boolean | null;
  /**
   * True only when a *real* hardware-accelerated adapter is present. SwiftShader
   * (Chromium's software WebGPU fallback) and explicit fallback adapters are
   * treated as NOT accelerated, so GPU-specific assertions can be skipped.
   */
  accelerated: boolean;
  error: string | null;
}

export interface OcrCaptureParams {
  serviceWorker: Worker;
  page: Page;
  engine: EngineOption;
  /** CSS selector (in the page) whose bounding box we drag-select over. */
  targetSelector: string;
  /** Margin in CSS px added around the target's bbox when dragging. */
  marginPx?: number;
  /** Overall budget for the whole capture (model load + OCR). */
  timeoutMs?: number;
}

export interface OcrCaptureResult {
  overlayAppeared: boolean;
  islandAppeared: boolean;
  /** innerText of the island's result element — the recognized text. */
  plain: string;
  /** innerHTML of the same element — the reconstructed <table> for structured. */
  html: string;
  readError: string | null;
  timings: {
    /** Trigger (activateOverlay) → island rendered its result. */
    activateToFinishMs: number;
    /** Drag mouse-up (OCR start) → island rendered its result. Inference wall-clock. */
    dragToFinishMs: number;
  };
}

const WEBGPU_FLAGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=vulkan',
  '--ignore-gpu-blocklist',
];

/**
 * Returns a human-readable reason to skip the e2e suite in the current
 * environment, or null if it can run. Headed mode needs a display on Linux.
 */
export function describeEnvironmentSkip(headless: 'headed' | 'new'): string | null {
  if (headless === 'new') return null;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return (
      'Headed browser needs a display. No DISPLAY/WAYLAND_DISPLAY is set. ' +
      'Run under a real desktop, `xvfb-run -a npm run test:e2e`, or set E2E_HEADLESS=new.'
    );
  }
  return null;
}

/** Resolve which headless mode to use from env (default: headed). */
export function resolveHeadless(): 'headed' | 'new' {
  return process.env.E2E_HEADLESS === 'new' ? 'new' : 'headed';
}

/**
 * Copy the built extension to a throwaway dir and add `host_permissions:
 * ["<all_urls>"]` so the OCR flow runs without the interactive activeTab grant
 * that CDP automation cannot produce. Returns the patched directory path.
 */
function createPatchedExtensionDir(distDir: string): string {
  const extDir = mkdtempSync(join(tmpdir(), 'local-lens-ext-'));
  cpSync(distDir, extDir, { recursive: true });
  const manifestPath = join(extDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const existing = Array.isArray(manifest.host_permissions)
    ? (manifest.host_permissions as string[])
    : [];
  manifest.host_permissions = Array.from(new Set([...existing, '<all_urls>']));
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return extDir;
}

/**
 * Launch a real browser with the unpacked extension loaded into a persistent
 * context, wait for the background service worker, and derive the extension id.
 *
 * Browser selection via env:
 *   - E2E_EXECUTABLE_PATH  absolute path to a browser binary (this is how you
 *                          target Brave — Playwright has no `brave` channel).
 *   - E2E_CHANNEL          'chromium' (default bundled) | 'chrome' | 'msedge'.
 */
export async function launchExtensionContext(options: LaunchOptions): Promise<LaunchResult> {
  const headless = options.headless ?? resolveHeadless();
  const distDir = resolve(options.distDir);
  const extDir = createPatchedExtensionDir(distDir);
  const userDataDir = mkdtempSync(join(tmpdir(), 'local-lens-e2e-'));

  const args = [
    `--disable-extensions-except=${extDir}`,
    `--load-extension=${extDir}`,
    ...WEBGPU_FLAGS,
    '--no-first-run',
    '--no-default-browser-check',
  ];
  // Chromium's new headless still loads MV3 extensions; the classic headless
  // (Playwright's `headless: true`) does not, so we always pass headless: false
  // and opt into new headless via the flag instead.
  if (headless === 'new') args.push('--headless=new');

  const executablePath = process.env.E2E_EXECUTABLE_PATH || undefined;
  const channel =
    !executablePath && process.env.E2E_CHANNEL && process.env.E2E_CHANNEL !== 'chromium'
      ? process.env.E2E_CHANNEL
      : undefined;

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args,
    channel,
    executablePath,
    // Grant clipboard so the island's auto-copy path still runs for real. The
    // assertions read the island directly (see readIslandResult), so a clipboard
    // failure no longer fails the suite — but the copy is part of the flow.
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  const cleanup = async (): Promise<void> => {
    try {
      await context.close();
    } finally {
      rmSync(userDataDir, { recursive: true, force: true });
      rmSync(extDir, { recursive: true, force: true });
    }
  };

  try {
    const serviceWorker = await waitForBackgroundWorker(context);
    const extensionId = new URL(serviceWorker.url()).host;
    return { context, serviceWorker, extensionId, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Wait for the extension's background service worker (URL contains `background`). */
async function waitForBackgroundWorker(context: BrowserContext): Promise<Worker> {
  const isBackground = (w: Worker): boolean => w.url().includes('background');
  const existing = context.serviceWorkers().find(isBackground);
  if (existing) return existing;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const worker = await context
      .waitForEvent('serviceworker', { timeout: Math.max(1, deadline - Date.now()) })
      .catch(() => null);
    if (worker && isBackground(worker)) return worker;
    const found = context.serviceWorkers().find(isBackground);
    if (found) return found;
  }
  throw new Error('Extension background service worker did not register within 20s.');
}

/**
 * Query WebGPU from the page and classify whether real GPU acceleration is
 * available. Also reports `self.crossOriginIsolated` (governs WASM threading).
 * NOTE: the OCR engines run in the offscreen document, but the page's adapter is
 * a faithful proxy for "does this browser+host expose accelerated WebGPU".
 */
export async function probeWebGpu(page: Page): Promise<WebGpuReport> {
  const raw = await page.evaluate(async () => {
    const report = {
      hasNavigatorGpu: typeof navigator !== 'undefined' && !!navigator.gpu,
      crossOriginIsolated: self.crossOriginIsolated === true,
      adapterPresent: false,
      vendor: null as string | null,
      architecture: null as string | null,
      device: null as string | null,
      isFallbackAdapter: null as boolean | null,
      error: null as string | null,
    };
    if (!navigator.gpu) return report;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return report;
      report.adapterPresent = true;
      const info = adapter.info;
      if (info) {
        report.vendor = info.vendor ?? null;
        report.architecture = info.architecture ?? null;
        report.device = info.device ?? null;
      }
      // `isFallbackAdapter` lived on GPUAdapter in older WebGPU and moved into
      // GPUAdapterInfo in newer spec revisions — read whichever is present.
      const onAdapter = (adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter;
      const onInfo = (info as { isFallbackAdapter?: boolean } | undefined)?.isFallbackAdapter;
      report.isFallbackAdapter = onAdapter ?? onInfo ?? null;
    } catch (e) {
      report.error = e instanceof Error ? e.message : String(e);
    }
    return report;
  });

  const arch = (raw.architecture ?? '').toLowerCase();
  const vendor = (raw.vendor ?? '').toLowerCase();
  const isSoftware =
    arch.includes('swiftshader') ||
    arch.includes('llvmpipe') ||
    vendor.includes('swiftshader') ||
    raw.isFallbackAdapter === true;
  const accelerated = raw.adapterPresent && !isSoftware;

  return { ...raw, accelerated };
}

/**
 * The heart of the harness. Sets the engine deterministically, triggers the
 * real capture flow, performs the drag-selection over `targetSelector`, and
 * reads the recognized text back off the clipboard (via the island's auto-copy).
 * Returns the recognized plain/html text plus wall-clock timings.
 *
 * Faithfulness: every message the content script, overlay, offscreen engine and
 * island receive is identical to a real toolbar-click activation. The only
 * differences from a literal user are (a) the trigger originates from a
 * service-worker reproduction of background.ts `activateOverlay` rather than
 * `chrome.action.onClicked`, and (b) auto-copy is the read-out channel (forced
 * on) because the island's text lives in a closed shadow root.
 */
export async function runOcrCapture(params: OcrCaptureParams): Promise<OcrCaptureResult> {
  const { serviceWorker, page, engine, targetSelector } = params;
  const margin = params.marginPx ?? 10;
  const timeoutMs = params.timeoutMs ?? 150_000;
  const deadline = Date.now() + timeoutMs;

  // 1) Deterministic engine + force auto-copy/expand so the result reaches the
  //    clipboard (our only readable channel through the closed shadow root).
  await serviceWorker.evaluate(async (selectedEngine: EngineOption) => {
    await chrome.storage.local.set({
      islandSettings: { engine: selectedEngine, autoCopy: true, autoExpand: true },
    });
  }, engine);

  await page.bringToFront();
  // A real pointer gesture focuses the document, which the island's auto-copy
  // needs (clipboard writes silently no-op on an unfocused document).
  await page.mouse.click(2, 2).catch(() => {});
  const tabId = await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  });
  if (tabId == null) throw new Error('Could not resolve the active tab id from the service worker.');

  // 2) Trigger: reproduce background.ts `activateOverlay(tabId, null, false)`
  //    exactly — ensure the offscreen doc, inject content.js, PING_CONTENT,
  //    then ACTIVATE_OVERLAY. The content script cannot tell this apart from a
  //    real toolbar click.
  const activateStart = Date.now();
  const driveLog = await serviceWorker.evaluate(
    async ({ id, webGpuSupported }: { id: number; webGpuSupported: boolean }) => {
      const log: string[] = [];
      const existing = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL('offscreen.html')],
      });
      if (existing.length === 0) {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['BLOBS'],
          justification: 'Local Lens e2e OCR',
        });
        log.push('offscreen:created');
      } else {
        log.push('offscreen:exists');
      }
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
      log.push('content:injected');
      await new Promise((r) => setTimeout(r, 150));
      await chrome.tabs.sendMessage(id, {
        action: 'PING_CONTENT',
        payload: { webGpuSupported },
      });
      const resp = await chrome.tabs.sendMessage(id, {
        action: 'ACTIVATE_OVERLAY',
        payload: { imageUrl: null, isPdf: false },
      });
      log.push('activate:' + JSON.stringify(resp));
      return log.join(' | ');
    },
    { id: tabId, webGpuSupported: true },
  );
  console.log(`[e2e-trigger] ${engine}: ${driveLog}`);

  const overlayAppeared = await waitForHost(page, '#xr-screenshot-reader-host', deadline);

  // 3) Drag-select over the target's bbox. The overlay only becomes clickable
  //    after the engine's SETUP_DONE (for `structured`, model load takes several
  //    seconds), and until then pointer events pass through the overlay host to
  //    the page harmlessly. So we retry the drag until the island appears.
  const bbox = await locateTarget(page, targetSelector, margin);
  let dragEndedAt = 0;
  let islandAppeared = false;
  for (let attempt = 0; !islandAppeared && Date.now() < deadline; attempt++) {
    await performDrag(page, bbox);
    dragEndedAt = Date.now();
    islandAppeared = await waitForHost(page, '#xr-floating-island-host', Math.min(deadline, dragEndedAt + 4_000));
    if (!islandAppeared) {
      console.log(`[e2e-trigger] ${engine}: drag attempt ${attempt} — overlay not active yet (model loading), retrying`);
      await page.waitForTimeout(1_500);
    }
  }

  // 4) Read the recognized text straight out of the island's closed shadow root.
  const clip = await readIslandResult(page, deadline);
  const finishAt = Date.now();

  return {
    overlayAppeared,
    islandAppeared,
    plain: clip.plain,
    html: clip.html,
    readError: clip.error,
    timings: {
      activateToFinishMs: finishAt - activateStart,
      dragToFinishMs: dragEndedAt > 0 ? finishAt - dragEndedAt : -1,
    },
  };
}

/** Poll for a light-DOM host element (shadow roots are closed, hosts are not). */
async function waitForHost(page: Page, selector: string, deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    const present = await page.evaluate((sel) => !!document.querySelector(sel), selector);
    if (present) return true;
    await page.waitForTimeout(200);
  }
  return false;
}

interface DragBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Compute a drag rectangle enclosing the target element (+ margin), clamped to the viewport. */
async function locateTarget(page: Page, selector: string, margin: number): Promise<DragBox> {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`Target "${selector}" has no bounding box (not visible?).`);
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  return {
    x1: Math.max(2, box.x - margin),
    y1: Math.max(2, box.y - margin),
    x2: Math.min(viewport.width - 2, box.x + box.width + margin),
    y2: Math.min(viewport.height - 2, box.y + box.height + margin),
  };
}

/**
 * A single drag-select gesture. The 800ms hold after mouse-down lets the
 * overlay's backup-mode `captureVisibleTab` round-trip (background → content)
 * complete before mouse-up crops that screenshot — mirroring a real, unhurried
 * drag. Without it the crop can race an empty screenshot.
 */
async function performDrag(page: Page, box: DragBox): Promise<void> {
  await page.mouse.move(box.x1, box.y1);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.move((box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, { steps: 10 });
  await page.mouse.move(box.x2, box.y2, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}

interface IslandResult {
  plain: string;
  html: string;
  error: string | null;
}

/** Subset of the CDP `DOM.Node` shape this module walks. */
interface CdpNode {
  nodeId: number;
  nodeName: string;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
  contentDocument?: CdpNode;
}

/** CDP returns attributes as a flat [name, value, name, value, ...] array. */
function cdpAttr(node: CdpNode, name: string): string | undefined {
  const a = node.attributes;
  if (!a) return undefined;
  for (let i = 0; i + 1 < a.length; i += 2) {
    if (a[i] === name) return a[i + 1];
  }
  return undefined;
}

/** Depth-first search through children, shadow roots (open OR closed) and frames. */
function findCdpNode(
  node: CdpNode,
  match: (n: CdpNode) => boolean,
): CdpNode | null {
  if (match(node)) return node;
  const descendants = [
    ...(node.children ?? []),
    ...(node.shadowRoots ?? []),
    ...(node.contentDocument ? [node.contentDocument] : []),
  ];
  for (const child of descendants) {
    const hit = findCdpNode(child, match);
    if (hit) return hit;
  }
  return null;
}

/**
 * Poll until the island renders a result, reading it straight out of the CLOSED
 * shadow root via CDP.
 *
 * `DOM.getDocument({pierce: true})` walks shadow roots regardless of mode, so
 * this reads exactly what the user sees in the island. That replaces reading the
 * result back off the OS clipboard (via the island's auto-copy): the clipboard
 * is shared with the host, and on a bridged one (WSL, VMs, clipboard managers)
 * foreign content — a URL, a screenshot bitmap — gets pushed in mid-run and was
 * then reported as recognized text, failing the suite with whatever the host
 * happened to have copied. No amount of sentinel-stamping fixes that, because
 * the foreign write lands *after* the baseline is taken.
 *
 * Auto-copy stays enabled for the capture so the copy path still runs; it is
 * simply no longer the channel the assertions depend on.
 */
async function readIslandResult(
  page: Page,
  deadline: number,
): Promise<IslandResult> {
  const cdp = await page.context().newCDPSession(page);
  let last: IslandResult = {
    plain: '',
    html: '',
    error: 'the island never rendered a result',
  };
  try {
    while (Date.now() < deadline) {
      try {
        const { root } = (await cdp.send('DOM.getDocument', {
          depth: -1,
          pierce: true,
        })) as { root: CdpNode };

        const host = findCdpNode(
          root,
          (n) => cdpAttr(n, 'id') === 'xr-floating-island-host',
        );
        const textarea =
          host &&
          findCdpNode(host, (n) =>
            (cdpAttr(n, 'class') ?? '').split(/\s+/).includes('textarea'),
          );

        if (textarea) {
          const { object } = await cdp.send('DOM.resolveNode', {
            nodeId: textarea.nodeId,
          });
          if (object.objectId) {
            const { result } = await cdp.send('Runtime.callFunctionOn', {
              objectId: object.objectId,
              returnByValue: true,
              functionDeclaration: `function () {
                return {
                  plain: this.innerText ?? this.textContent ?? '',
                  html: this.innerHTML ?? '',
                };
              }`,
            });
            const value = result.value as { plain: string; html: string };
            if (value.plain.trim() || value.html.trim()) {
              return { plain: value.plain, html: value.html, error: null };
            }
            last = { ...value, error: 'the island result stayed empty' };
          }
        }
      } catch (e) {
        last.error = e instanceof Error ? e.message : String(e);
      }
      await page.waitForTimeout(300);
    }
  } finally {
    await cdp.detach().catch(() => {});
  }
  return last;
}
