import { ExtensionAction } from './types';
import type {
  EngineOption,
  ExtensionMessage,
  OcrResponse,
  PerformOcrPayload,
  SetupEnginePayload,
  StatusResponse,
} from './types';
import { recognizeGranite, loadGranite } from './engine/granite';
import { recognizeTesseract, loadTesseract } from './engine/tesseract';

let engine: EngineOption = 'tesseract';

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse | OcrResponse) => void,
  ) => {
    switch (message.action) {
      case ExtensionAction.SETUP_ENGINE:
        console.debug(message.action, 'payload:', message.payload);
        initEngine(message.payload);
        sendResponse({ status: 'ok' });
        break;

      case ExtensionAction.PERFORM_OCR:
        console.debug(message.action, 'payload:', message.payload);
        performOcr(message.payload, sendResponse);
        return true;
    }

    return false;
  },
);

async function initEngine(payload: SetupEnginePayload) {
  const { engine: selectedEngine, language } = payload;
  engine = selectedEngine;
  if (selectedEngine === 'tesseract' && language) {
    loadTesseract(language).catch((err) => {
      console.error('Failed to load Tesseract engine:', err);
    });
    return;
  }
  loadGranite().catch((err) => {
    console.error('Failed to load Granite engine:', err);
  });
}

async function performOcr(
  payload: PerformOcrPayload,
  sendResponse: (response: OcrResponse) => void,
): Promise<void> {
  let ocrResult: OcrResponse;
  if (
    (payload.engine === 'auto' && engine === 'tesseract') ||
    payload.engine === 'tesseract'
  ) {
    if (!payload.language) {
      console.error('Tesseract engine requires a language', payload);
      return;
    }
    ocrResult = await recognizeTesseract(payload);
  } else if (
    (payload.engine === 'auto' && engine === 'granite') ||
    payload.engine === 'granite'
  ) {
    ocrResult = await recognizeGranite(payload);
  } else {
    console.error('Unsupported engine specified:', payload.engine);
    return;
  }
  sendResponse(ocrResult);
  return;
}
