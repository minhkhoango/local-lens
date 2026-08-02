import * as ort from 'onnxruntime-web';
import {
  TabsConnectAction,
  RuntimeMessageAction,
  toEngineOption,
} from './types';
import type {
  EngineOption,
  PerformOcrPayload,
  RuntimeMessage,
  SetupEnginePayload,
  TabsConnect,
} from './types';
import type { StructuredEngine } from './engine/structured';
import type { FastEngine } from './engine/fast';
import { OCR_PORT } from './constants';

/**
 * Ceiling on onnxruntime-web's own wasm/worker bootstrap. Generous — this
 * covers instantiating a ~26 MB wasm binary on a cold disk — but finite, so a
 * bootstrap that will never finish surfaces as an error rather than a hang.
 */
const WASM_INIT_TIMEOUT_MS = 60_000;

// Configure ORT WASM threading ONCE, at offscreen startup — before the lazy
// engine imports run and create any ORT session. `ort.env` is a shared
// singleton across the module graph, so setting it here also applies to the
// engines' own `onnxruntime-web` import.
//
// onnxruntime-web ships a threaded+JSEP wasm binary that only uses multiple
// threads (via SharedArrayBuffer) when the document is cross-origin-isolated.
//
// MV3 *does* support `cross_origin_embedder_policy` / `cross_origin_opener_policy`
// in the manifest — an earlier version of this comment claimed MV3 had removed
// them and that isolation could not be enabled here, which was never true.
// v1.5.0 set both keys deliberately ("add COOP/COEP manifest keys so the
// offscreen document is crossOriginIsolated and the guarded WASM threads can
// run"), and they apply to every extension page including this one. Measured:
//
//     with the keys    : crossOriginIsolated=true   numThreads=4
//     without them     : crossOriginIsolated=false  numThreads=1
//
// Threads are worth roughly 2.8x on the WASM inference path, which is not
// optional here: structured.ts pins PP-DocLayoutV3 and SLANet to the wasm EP
// (MaxPool/ceil is unsupported on WebGPU), and layout dominates wall time. So
// dropping to 1 thread would make the slowest path ~3x slower with no GPU
// escape hatch. Removing the manifest keys is a real performance decision —
// benchmark it, do not do it by accident.
//
// The genuine hazard is the failure mode, not the thread count: a pthread that
// never starts leaves onnxruntime-web's bootstrap pending with no reject path,
// so the first session hangs instead of throwing. `initTimeout` below is what
// turns that into an error the caller can report.
const wasmCrossOriginIsolated = self.crossOriginIsolated === true;
ort.env.wasm.numThreads = wasmCrossOriginIsolated
  ? Math.min(navigator.hardwareConcurrency ?? 4, 4)
  : 1;
// Defaults to 0, meaning "wait forever". Nothing upstream of us has a timeout
// either, so a wedged init is indistinguishable from a slow one and the whole
// setup handshake stalls with no message back to the content script.
//
// Note the timeout is one-shot: onnxruntime-web throws out of the timeout branch
// without clearing its `initializing` flag, so a retry in the same document
// reports "multiple calls to initializeWebAssembly()" rather than trying again.
// The user still gets an error either way, which is the point — but recovering
// properly would mean tearing down the offscreen document.
ort.env.wasm.initTimeout = WASM_INIT_TIMEOUT_MS;
console.debug(
  '[Offscreen] ORT WASM threading: crossOriginIsolated =',
  wasmCrossOriginIsolated,
  '| numThreads =',
  ort.env.wasm.numThreads,
);

let engine: EngineOption = 'fast';
let structuredEngine: StructuredEngine | null = null;
let fastEngine: FastEngine | null = null;

async function getStructuredEngine(): Promise<StructuredEngine> {
  if (!structuredEngine) {
    const mod = await import('./engine/structured');
    structuredEngine = new mod.StructuredEngine();
  }
  return structuredEngine;
}

async function getFastEngine(): Promise<FastEngine> {
  if (!fastEngine) {
    const mod = await import('./engine/fast');
    fastEngine = new mod.FastEngine();
  }
  return fastEngine;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender) => {
  if (message.action === RuntimeMessageAction.STOP_OFFSCREEN) {
    console.debug('[Offscreen] Received STOP_OFFSCREEN message');
    stopOcr();
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  console.debug('Content script connected to port:', port.name);
  if (port.name !== OCR_PORT) return;

  const post = port.postMessage.bind(port);
  port.onMessage.addListener((msg: TabsConnect) => {
    switch (msg.action) {
      case TabsConnectAction.SETUP_BEGIN:
        (async () => {
          try {
            await initEngine(msg.payload, post);
          } catch (err) {
            console.error('initEngine failed:', err);
            post({
              action: TabsConnectAction.ERROR,
              payload: {
                stage: 'error',
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
        })();
        break;
      case TabsConnectAction.PERFORM_OCR:
        (async () => {
          try {
            await performOcr(msg.payload, post);
          } catch (err) {
            console.error('performOcr failed:', err);
            post({
              action: TabsConnectAction.ERROR,
              payload: {
                stage: 'error',
                error: err instanceof Error ? err.message : String(err),
              },
            });
          }
        })();
        break;
    }
    return false;
  });
});

async function initEngine(
  payload: SetupEnginePayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  // Older extension versions can send engines that no longer exist (e.g.
  // 'tesseract'); coerce rather than wedge the setup flow.
  const selectedEngine = toEngineOption(payload.engine);
  console.log('Offscreen init with engine:', selectedEngine);

  engine = selectedEngine;
  if (selectedEngine === 'fast') {
    const selectedFastEngine = await getFastEngine();
    await selectedFastEngine.load(undefined, postMessage);
    postMessage({ action: TabsConnectAction.SETUP_DONE });
    return;
  }

  const selectedStructuredEngine = await getStructuredEngine();
  await selectedStructuredEngine.load(undefined, postMessage);
  postMessage({ action: TabsConnectAction.SETUP_DONE });
}

async function performOcr(
  payload: PerformOcrPayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  // Resolve 'auto' against the engine chosen at setup; coerce anything else
  // so a stale value can never make this function return without posting a
  // FINISH/ERROR (which leaves the island spinning forever).
  const selected =
    payload.engine === 'auto' ? engine : toEngineOption(payload.engine);

  if (selected === 'fast') {
    const selectedFastEngine = await getFastEngine();
    await selectedFastEngine.recognize(payload, postMessage);
    return;
  }

  const selectedStructuredEngine = await getStructuredEngine();
  await selectedStructuredEngine.recognize(payload, postMessage);
}

async function stopOcr(): Promise<void> {
  if (engine === 'fast' && fastEngine) {
    await fastEngine.stop();
    return;
  }
  if (structuredEngine) {
    await structuredEngine.stop();
  }
}
