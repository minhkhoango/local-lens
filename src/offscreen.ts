import { TabsConnectAction, RuntimeMessageAction } from './types';
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

let engine: EngineOption = 'tesseract';
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
  const { engine: selectedEngine, language } = payload;
  console.log('Offscreen init with lang:', language, 'engine:', selectedEngine);

  engine = selectedEngine;
  if (selectedEngine === 'tesseract') {
    const selectedFastEngine = await getFastEngine();
    await selectedFastEngine.load(language, postMessage);
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
  const isTesseract =
    payload.engine === 'tesseract' ||
    (payload.engine === 'auto' && engine === 'tesseract');
  const isStructured =
    payload.engine === 'structured' ||
    (payload.engine === 'auto' && engine === 'structured');
  const isUnsupported = !isTesseract && !isStructured;

  if (isUnsupported) {
    console.error('Unsupported engine specified:', payload.engine);
    return;
  }

  if (isTesseract) {
    const selectedFastEngine = await getFastEngine();
    await selectedFastEngine.recognize(payload, postMessage);
    return;
  }

  const selectedStructuredEngine = await getStructuredEngine();
  await selectedStructuredEngine.recognize(payload, postMessage);
}

async function stopOcr(): Promise<void> {
  if (engine === 'tesseract' && fastEngine) {
    await fastEngine.stop();
    return;
  }
  if (structuredEngine) {
    await structuredEngine.stop();
  }
}
