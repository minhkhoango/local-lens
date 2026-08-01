/**
 * REPRO 3 — the COOP/COEP manifest keys 1.5.0 added.
 *
 * v1.5.0 added to public/manifest.json (absent in 0bcd00e^):
 *     "cross_origin_embedder_policy": { "value": "require-corp" },
 *     "cross_origin_opener_policy":   { "value": "same-origin"  }
 *
 * src/offscreen.ts:23-33 asserts the opposite of what these do:
 *
 *     // MV3 offscreen documents are usually NOT cross-origin-isolated: MV3
 *     // removed the MV2 COOP/COEP manifest keys, so `self.crossOriginIsolated`
 *     // is commonly false and this guard keeps us at 1 thread today ...
 *     // (handled separately by adding cross-origin-isolation headers;
 *     //  do NOT add them here).
 *
 * ...while the same commit added them. If the keys take effect, then
 *     ort.env.wasm.numThreads = min(hardwareConcurrency, 4)
 * and onnxruntime-web spawns pthread workers that never ran in 1.4.x.
 *
 * The manifest keys apply to every extension page, so loading offscreen.html
 * directly in a tab reports the same isolation state the offscreen document
 * gets — and offscreen.ts:34-39 conveniently logs its own verdict on load.
 *
 * We probe the shipped manifest against the same build with the two keys
 * stripped, to prove the keys are what flips it.
 */
import { buildExtension, launch, log } from './lib.mjs';

async function probe(label, stripCoopCoep) {
  const { context, extensionId } = await launch(buildExtension({ stripCoopCoep }));

  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  await page.goto(`chrome-extension://${extensionId}/offscreen.html`);
  await page.waitForTimeout(4000);

  const state = await page.evaluate(() => ({
    crossOriginIsolated: self.crossOriginIsolated === true,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency,
  }));

  // Recompute what src/offscreen.ts:31-33 derives from this.
  const numThreads = state.crossOriginIsolated
    ? Math.min(state.hardwareConcurrency ?? 4, 4)
    : 1;

  log('');
  log('='.repeat(64));
  log(label);
  log('='.repeat(64));
  log(`  self.crossOriginIsolated   = ${state.crossOriginIsolated}`);
  log(`  SharedArrayBuffer present  = ${state.hasSharedArrayBuffer}`);
  log(`  navigator.hardwareConcurrency = ${state.hardwareConcurrency}`);
  log(`  => ort.env.wasm.numThreads = ${numThreads}   (src/offscreen.ts:31-33)`);
  const ortLine = consoleLines.find((l) => l.includes('ORT WASM threading'));
  if (ortLine) log(`  offscreen.ts logged: ${ortLine}`);

  await context.close();
  return { ...state, numThreads };
}

const shipped = await probe('SHIPPED 1.5.0 manifest (COOP/COEP present)', false);
const stripped = await probe('SAME BUILD, COOP/COEP stripped (= 1.4.x behavior)', true);

log('');
log('#'.repeat(64));
log('VERDICT');
log('#'.repeat(64));
log(`1.5.0 as shipped : crossOriginIsolated=${shipped.crossOriginIsolated}  numThreads=${shipped.numThreads}`);
log(`without the keys : crossOriginIsolated=${stripped.crossOriginIsolated}  numThreads=${stripped.numThreads}`);
log(
  shipped.numThreads !== stripped.numThreads
    ? '>>> The keys DO take effect and DO change the thread count.\n>>> The comment in src/offscreen.ts:23-33 is factually wrong.'
    : '>>> No difference — the keys had no effect in this browser.',
);
