/**
 * REPRO 2 — island dismissal on a PDF page.
 *
 * The island's three dismissal paths all live on the TOP-LEVEL document
 * (src/island/behavior.ts:100-107):
 *
 *     document.addEventListener('mousedown', this.handleClickOutside);
 *     window.addEventListener('keydown', this.handleKeyDown);          // Escape
 *     if (this.isPdf) window.addEventListener('blur', this.handleWindowBlur);
 *
 * Chrome renders a PDF as an <embed> hosting the plugin in a separate process.
 * Mouse and key events inside it never reach the top-level document, so
 * click-outside and Escape are both dead once the user touches the PDF. The
 * `isPdf` blur listener is the only remaining fallback.
 *
 * But `isPdf` comes from src/background.ts:202:
 *
 *     const isPdf = newUrl.pathname.toLowerCase().endsWith('.pdf');
 *
 * — a filename-suffix sniff. A PDF served from an extensionless endpoint
 * (/report, /download?id=…, a Content-Disposition response) classifies as
 * isPdf === false, so the blur fallback is never attached and the island has
 * ZERO working dismissal paths.
 *
 * This script serves identical PDF bytes at two URLs to isolate exactly that:
 *   A) /report   -> isPdf false -> no blur fallback
 *   B) /doc.pdf  -> isPdf true  -> blur fallback attached
 */
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  ISLAND_HOST,
  OVERLAY_HOST,
  activateOverlay,
  activeTabId,
  buildExtension,
  classifyUrlIsPdf,
  dragUntilIsland,
  hostPresent,
  launch,
  log,
  setSettings,
  waitForHost,
} from './lib.mjs';

const PORT = Number(process.env.REPRO_PORT ?? 5310);
const pdfBytes = readFileSync(join(import.meta.dirname, 'fixtures', 'sample.pdf'));

const server = createServer((req, res) => {
  if (req.url.startsWith('/report') || req.url.startsWith('/doc.pdf')) {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    res.end(pdfBytes);
  } else {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
log(`fixture server on http://127.0.0.1:${PORT}`);

const { context, serviceWorker } = await launch(buildExtension());
await setSettings(serviceWorker, { engine: 'fast', autoCopy: true, autoExpand: false });

async function runCase({ label, url, dragBox }) {
  log('');
  log('='.repeat(72));
  log(`CASE: ${label}`);
  log('='.repeat(72));

  const page = await context.newPage();
  await page.goto(url);
  await page.waitForTimeout(2500);
  await page.bringToFront();

  const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const isPdf = classifyUrlIsPdf(url);
  log(`url = ${url}`);
  log(`classifyUrl -> isPdf = ${isPdf}  (blur fallback ${isPdf ? 'ATTACHED' : 'NOT attached'})`);

  log('activate ->', await activateOverlay(serviceWorker, await activeTabId(serviceWorker), isPdf));
  log('overlay mounted:', await waitForHost(page, OVERLAY_HOST, 20_000));

  const islandUp = await dragUntilIsland(page, dragBox);
  log('island mounted:', islandUp);
  if (!islandUp) {
    await page.close();
    return { label, islandUp: false };
  }
  await page.waitForTimeout(7000); // let the OCR settle, as a user would

  const gestures = [];
  const tryGesture = async (name, fn) => {
    await fn();
    await page.waitForTimeout(1000);
    const still = await hostPresent(page, ISLAND_HOST);
    gestures.push({ name, still });
    log(`  "${name}" -> island still present: ${still}`);
  };

  await tryGesture('click page top-left', () => page.mouse.click(40, 90));
  await tryGesture('click page centre', () =>
    page.mouse.click(Math.round(viewport.w / 2), Math.round(viewport.h / 2)),
  );
  await tryGesture('press Escape', () => page.keyboard.press('Escape'));
  await tryGesture('scroll', () => page.mouse.wheel(0, 500));

  const stuck = await hostPresent(page, ISLAND_HOST);
  log(`RESULT: island ${stuck ? '*** STILL PRESENT ***' : 'was dismissed'}`);
  await page.close();
  return { label, islandUp, stuck, gestures };
}

const results = [];
results.push(
  await runCase({
    label: 'A — PDF at an EXTENSIONLESS url (/report) => isPdf=false, no blur fallback',
    url: `http://127.0.0.1:${PORT}/report`,
    dragBox: { x1: 120, y1: 140, x2: 700, y2: 380 },
  }),
);
results.push(
  await runCase({
    label: 'B — control: identical bytes at /doc.pdf => isPdf=true',
    url: `http://127.0.0.1:${PORT}/doc.pdf`,
    dragBox: { x1: 120, y1: 140, x2: 700, y2: 380 },
  }),
);

log('');
log('#'.repeat(72));
log('SUMMARY — which gestures dismiss the island on a PDF page');
log('#'.repeat(72));
for (const r of results) {
  log(r.label);
  for (const g of r.gestures ?? []) {
    log(`   ${g.name.padEnd(22)} island still present = ${g.still}`);
  }
}
log('');
log('Note: click-outside never dismisses on a PDF in either case — mouse events');
log('inside the plugin do not reach the top-level document. Case B survives only');
log('because focusing the plugin fires window "blur", which case A never gets.');

await context.close();
server.close();
