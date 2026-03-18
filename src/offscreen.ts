import { TabsConnectAction, RuntimeMessageAction } from './types';
import type {
  EngineOption,
  PerformOcrPayload,
  RuntimeMessage,
  SetupEnginePayload,
  TabsConnect,
} from './types';
import type { GraniteEngine } from './engine/granite';
import type { TesseractEngine } from './engine/tesseract';
import { OCR_PORT } from './constants';

let engine: EngineOption = 'tesseract';
let graniteEngine: GraniteEngine | null = null;
let tesseractEngine: TesseractEngine | null = null;

async function getGraniteEngine(): Promise<GraniteEngine> {
  if (!graniteEngine) {
    const mod = await import('./engine/granite');
    graniteEngine = new mod.GraniteEngine();
  }
  return graniteEngine;
}

async function getTesseractEngine(): Promise<TesseractEngine> {
  if (!tesseractEngine) {
    const mod = await import('./engine/tesseract');
    tesseractEngine = new mod.TesseractEngine();
  }
  return tesseractEngine;
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
    const selectedTesseractEngine = await getTesseractEngine();
    postMessage({ action: TabsConnectAction.SETUP_DONE });
    await selectedTesseractEngine.load(language);
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

  if (isTesseract && !payload.language) {
    console.error('Tesseract engine requires a language', payload);
    return;
  }

  if (isTesseract) {
    const selectedTesseractEngine = await getTesseractEngine();
    await selectedTesseractEngine.recognize(payload, postMessage);
    return;
  }

  const selectedGraniteEngine = await getGraniteEngine();
  await selectedGraniteEngine.recognize(payload, postMessage);
}

async function stopOcr(): Promise<void> {
  if (engine === 'tesseract' && tesseractEngine) {
    await tesseractEngine.stop();
    return;
  }
  if (graniteEngine) {
    graniteEngine.stop();
  }
}
