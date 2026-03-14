import { TabsConnectAction, RuntimeMessageAction } from './types';
import type {
  EngineOption,
  PerformOcrPayload,
  RuntimeMessage,
  SetupEnginePayload,
  TabsConnect,
} from './types';
import { GraniteEngine } from './engine/granite';
import { TesseractEngine } from './engine/tesseract';
import { OCR_PORT } from './constants';

let engine: EngineOption = 'tesseract';
let graniteEngine: GraniteEngine = new GraniteEngine();
let tesseractEngine: TesseractEngine = new TesseractEngine();

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

  port.onMessage.addListener((msg: TabsConnect) => {
    switch (msg.action) {
      case TabsConnectAction.SETUP_BEGIN:
        (async () => {
          await initEngine(msg.payload, port.postMessage.bind(port));
        })();
        break;
      case TabsConnectAction.PERFORM_OCR:
        (async () => {
          await performOcr(msg.payload, port.postMessage.bind(port));
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
  if (selectedEngine === 'tesseract' && language) {
    postMessage({ action: TabsConnectAction.SETUP_DONE });
    await tesseractEngine.load(language);
    return;
  }

  await graniteEngine.load(postMessage);
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

  if (isTesseract && !payload.language) {
    console.error('Tesseract engine requires a language', payload);
    return;
  }

  if (isTesseract) {
    await tesseractEngine.recognize(payload, postMessage);
    return;
  }

  await graniteEngine.recognize(payload, postMessage);
}

async function stopOcr(): Promise<void> {
  if (engine === 'tesseract') {
    await tesseractEngine.stop();
    return;
  }
  graniteEngine.stop();
}
