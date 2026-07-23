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

// Configure ORT WASM threading ONCE, at offscreen startup — before the lazy
// engine imports run and create any ORT session. `ort.env` is a shared
// singleton across the module graph, so setting it here also applies to the
// engines' own `onnxruntime-web` import.
//
// onnxruntime-web ships a threaded+JSEP wasm binary that only uses multiple
// threads (via SharedArrayBuffer) when the document is cross-origin-isolated.
// MV3 offscreen documents are usually NOT cross-origin-isolated: MV3 removed
// the MV2 COOP/COEP manifest keys, so `self.crossOriginIsolated` is commonly
// false and this guard keeps us at 1 thread today — which is correct and safe.
// The code is ready to use threads the moment isolation is enabled (handled
// separately by adding cross-origin-isolation headers; do NOT add them here).
const wasmCrossOriginIsolated = self.crossOriginIsolated === true;
ort.env.wasm.numThreads = wasmCrossOriginIsolated
  ? Math.min(navigator.hardwareConcurrency ?? 4, 4)
  : 1;
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
