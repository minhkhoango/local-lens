import { TabsConnectAction, RuntimeMessageAction } from './types';
import type {
  EngineOption,
  PerformOcrPayload,
  RuntimeMessage,
  SetupEnginePayload,
  TabsConnect,
} from './types';
import type { GraniteEngine } from './engine/granite';
import type { PaddleFastEngine } from './engine/paddle-fast';
import { OCR_PORT } from './constants';

let engine: EngineOption = 'tesseract';
let graniteEngine: GraniteEngine | null = null;
let paddleFastEngine: PaddleFastEngine | null = null;

async function getGraniteEngine(): Promise<GraniteEngine> {
  if (!graniteEngine) {
    const mod = await import('./engine/granite');
    graniteEngine = new mod.GraniteEngine();
  }
  return graniteEngine;
}

async function getPaddleFastEngine(): Promise<PaddleFastEngine> {
  if (!paddleFastEngine) {
    const mod = await import('./engine/paddle-fast');
    paddleFastEngine = new mod.PaddleFastEngine();
  }
  return paddleFastEngine;
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
  const { engine: selectedEngine, language } = payload;
  console.log('Offscreen init with lang:', language, 'engine:', selectedEngine);

  engine = selectedEngine;
  if (selectedEngine === 'tesseract') {
    const selectedPaddleFastEngine = await getPaddleFastEngine();
    await selectedPaddleFastEngine.load(language, postMessage);
    postMessage({ action: TabsConnectAction.SETUP_DONE });
    return;
  }

  const selectedGraniteEngine = await getGraniteEngine();
  await selectedGraniteEngine.load(postMessage);
  postMessage({ action: TabsConnectAction.SETUP_DONE });
}

async function performOcr(
  payload: PerformOcrPayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  const isTesseract =
    payload.engine === 'tesseract' ||
    (payload.engine === 'auto' && engine === 'tesseract');
  const isGranite =
    payload.engine === 'granite' ||
    (payload.engine === 'auto' && engine === 'granite');
  const isUnsupported = !isTesseract && !isGranite;

  if (isUnsupported) {
    console.error('Unsupported engine specified:', payload.engine);
    return;
  }

  if (isTesseract) {
    const selectedPaddleFastEngine = await getPaddleFastEngine();
    await selectedPaddleFastEngine.recognize(payload, postMessage);
    return;
  }

  const selectedGraniteEngine = await getGraniteEngine();
  await selectedGraniteEngine.recognize(payload, postMessage);
}

async function stopOcr(): Promise<void> {
  if (engine === 'tesseract' && paddleFastEngine) {
    await paddleFastEngine.stop();
    return;
  }
  if (graniteEngine) {
    graniteEngine.stop();
  }
}
