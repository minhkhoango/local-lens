import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  OcrResponse,
  PerformOcrPayload,
  SetOcrPayload,
  StatusResponse,
} from './types';
import { recognizeGranite, loadGranite } from './engine/granite';
import { recognizeTesseract, loadTesseract } from './engine/tesseract';

let engine: 'tesseract' | 'granite' = 'tesseract';

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: OcrResponse | StatusResponse) => void,
  ) => {
    switch (message.action) {
      case ExtensionAction.SET_OCR_ENGINE:
        console.debug(message.action);
        initEngine(message.payload);
        sendResponse({ status: 'ok' });
        return true;

      case ExtensionAction.PERFORM_OCR:
        console.debug(message.action);
        performOcr(message.payload, sendResponse);
        return true;
    }

    return false;
  },
);

async function initEngine(payload: SetOcrPayload) {
  const { engine: selectedEngine, language } = payload;
  if (selectedEngine === 'tesseract' && language) {
    loadTesseract(language).catch((err) => {
      console.error('Failed to load Tesseract engine:', err);
    });
    return;
  }
  loadGranite().catch((err) => {
    console.error('Failed to load Granite engine:', err);
  });
  engine = selectedEngine;
}

async function performOcr(
  payload: PerformOcrPayload,
  sendResponse: (response: OcrResponse) => void,
) {
  if (engine === 'tesseract') {
    await recognizeTesseract(payload, sendResponse);
    return;
  }
  await recognizeGranite(payload, sendResponse);
}
