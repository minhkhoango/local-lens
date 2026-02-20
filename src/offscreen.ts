import { TabsConnectAction } from './types';
import type {
  EngineOption,
  PerformOcrPayload,
  SetupEnginePayload,
  TabsConnect,
} from './types';
import { recognizeGranite, loadGranite } from './engine/granite';
import { recognizeTesseract, loadTesseract } from './engine/tesseract';
import { OCR_PORT } from './constants';

let engine: EngineOption = 'tesseract';

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
    await loadTesseract(language).catch((err) => {
      console.error('Failed to load Tesseract engine:', err);
    });
    return;
  }

  await loadGranite(postMessage).catch((err) => {
    console.error('Failed to load Granite engine:', err);
  });
  postMessage({ action: TabsConnectAction.SETUP_DONE });
}

async function performOcr(
  payload: PerformOcrPayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  if (
    (payload.engine === 'auto' && engine === 'tesseract') ||
    payload.engine === 'tesseract'
  ) {
    if (!payload.language) {
      console.error('Tesseract engine requires a language', payload);
      return;
    }
    await recognizeTesseract(payload, postMessage);
  } else if (
    (payload.engine === 'auto' && engine === 'granite') ||
    payload.engine === 'granite'
  ) {
    await recognizeGranite(payload, postMessage);
  } else {
    console.error('Unsupported engine specified:', payload.engine);
    return;
  }
  return;
}
