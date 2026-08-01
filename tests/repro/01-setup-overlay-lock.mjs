/**
 * REPRO 1 — the setup-overlay lock. This is the headline v1.5.0 defect.
 *
 * src/content.ts:111-121 (handleActivateOverlay) registers a port listener that
 * handles ONLY 'DOWNLOAD' and 'SETUP_DONE':
 *
 *     case 'DOWNLOAD':   activeOverlay.loadingProgress(...); return true;
 *     case 'SETUP_DONE': activeOverlay.activate();          return false;
 *
 * But src/offscreen.ts:81-89 posts 'ERROR' on that same port whenever
 * initEngine() throws. There is no 'ERROR' case, so the failure is discarded.
 *
 * That is fatal because GhostOverlay.activate() (src/overlay.ts:137-142) is the
 * ONLY place that binds pointer events AND the Escape key:
 *
 *     this.host.style.pointerEvents = 'auto';          // overlay.ts:139
 *     this.canvas.addEventListener('mousedown', ...);  // overlay.ts:140-141
 *     window.addEventListener('keydown', this.handleKeyDown);  // overlay.ts:142
 *
 * Before SETUP_DONE the overlay has NO dismissal path at all. And for
 * engine === 'structured', mount() has already painted the whole viewport 40%
 * black (overlay.ts:112-113) with a "Loading model..." banner (overlay.ts:94)
 * at z-index 2147483647 (src/styles/overlay.css).
 *
 * Case A: healthy models  -> how long is the page dark, with what feedback?
 * Case B: setup fails     -> does the dark overlay EVER clear?
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OVERLAY_HOST,
  activateOverlay,
  activeTabId,
  buildExtension,
  launch,
  log,
  setSettings,
} from './lib.mjs';

const PAGE_HTML = `<!doctype html><meta charset=utf-8><title>ordinary page</title>
<body style="font:24px/1.6 system-ui;padding:40px;background:#fff">
<h1>A perfectly ordinary page</h1>
<p>Invoice 12345 — total 4200 USD</p>
<p>The user can still read this... unless something covers it.</p></body>`;

/** pointer-events:'auto' is the observable proof that activate() ran. */
const probeOverlay = (page) =>
  page.evaluate((sel) => {
    const h = document.querySelector(sel);
    if (!h) return { present: false, activated: false };
    const pe = getComputedStyle(h).pointerEvents;
    return { present: true, pointerEvents: pe, activated: pe === 'auto' };
  }, OVERLAY_HOST);

async function runCase({ label, corruptLayoutModel, watchMs }) {
  log('');
  log('='.repeat(72));
  log(`CASE: ${label}`);
  log('='.repeat(72));

  const { context, serviceWorker } = await launch(buildExtension({ corruptLayoutModel }));

  // The structured engine is what paints the screen dark on mount.
  await setSettings(serviceWorker, {
    engine: 'structured',
    autoCopy: true,
    autoExpand: false,
  });

  const page = await context.newPage();
  const htmlPath = join(process.cwd(), 'repro-page.html');
  writeFileSync(htmlPath, PAGE_HTML);
  await page.goto(`file://${htmlPath}`);
  await page.bringToFront();
  await page.waitForTimeout(1200);

  const started = Date.now();
  await activateOverlay(serviceWorker, await activeTabId(serviceWorker), false);

  let activatedAfterMs = null;
  let state = null;
  const deadline = Date.now() + watchMs;
  while (Date.now() < deadline) {
    state = await probeOverlay(page);
    if (state.present && state.activated) {
      activatedAfterMs = Date.now() - started;
      break;
    }
    await page.waitForTimeout(500);
  }

  log(`overlay state after ${((Date.now() - started) / 1000).toFixed(1)}s: ${JSON.stringify(state)}`);
  log(
    activatedAfterMs !== null
      ? `>>> overlay ACTIVATED after ${(activatedAfterMs / 1000).toFixed(1)}s of dark screen`
      : `>>> overlay NEVER activated within ${watchMs / 1000}s — still inert`,
  );

  // Now try to get rid of it the way a user would.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const afterEscape = await probeOverlay(page);
  await page.mouse.click(300, 300);
  await page.waitForTimeout(700);
  const afterClick = await probeOverlay(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(700);
  const afterEscape2 = await probeOverlay(page);

  log(`  after Escape       : overlay present = ${afterEscape.present}`);
  log(`  after click on page: overlay present = ${afterClick.present}`);
  log(`  after Escape again : overlay present = ${afterEscape2.present}`);

  const shot = join(process.cwd(), `overlay-${corruptLayoutModel ? 'setup-failed' : 'healthy'}.png`);
  await page.screenshot({ path: shot });
  log(`  screenshot -> ${shot}`);

  const stuck = afterEscape2.present && !afterEscape2.activated;
  log(`RESULT: ${stuck ? '*** PAGE PERMANENTLY DARKENED, NO WAY OUT ***' : 'recoverable'}`);

  await context.close();
  return { label, activatedAfterMs, stuck };
}

const results = [];
results.push(
  await runCase({
    label: 'A — structured engine, HEALTHY models (how long is the page dark?)',
    corruptLayoutModel: false,
    watchMs: 180_000,
  }),
);
results.push(
  await runCase({
    label: 'B — structured engine, setup FAILS (offscreen posts ERROR)',
    corruptLayoutModel: true,
    watchMs: 60_000,
  }),
);

log('');
log('#'.repeat(72));
log('SUMMARY');
log('#'.repeat(72));
for (const r of results) {
  const t = r.activatedAfterMs === null ? 'NEVER' : `${(r.activatedAfterMs / 1000).toFixed(1)}s`;
  log(`${r.label}`);
  log(`   overlay activated after: ${t}   permanently stuck: ${r.stuck}`);
}
