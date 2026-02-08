import { RuntimeMessageAction, TabsConnectAction } from './types';
import type {
  EngineOption,
  RuntimeMessage,
  PerformOcrPayload,
  SetupEnginePayload,
  StatusResponse,
  TabsConnect,
} from './types';
import { recognizeGranite, loadGranite } from './engine/granite';
import { recognizeTesseract, loadTesseract } from './engine/tesseract';
import { OCR_PORT } from './constants';

let engine: EngineOption = 'tesseract';

void notifyOffscreenReady();

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: StatusResponse) => void,
  ) => {
    switch (message.action) {
      case RuntimeMessageAction.SETUP_ENGINE:
        console.debug(message.action, 'payload:', message.payload);
        initEngine(message.payload);
        sendResponse({ status: 'ok' });
        break;
    }

    return false;
  },
);

chrome.runtime.onConnect.addListener((port) => {
  console.debug('Content script connected to port:', port.name);
  if (port.name !== OCR_PORT) return;

  port.onMessage.addListener(async (msg: TabsConnect) => {
    if (msg.action !== TabsConnectAction.PERFORM_OCR) return;
    await performOcr(msg.payload, port);
  });
});

async function initEngine(payload: SetupEnginePayload) {
  const { engine: selectedEngine, language } = payload;
  console.log('Offscreen init with lang:', language, 'engine:', selectedEngine);
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

async function notifyOffscreenReady(): Promise<void> {
  try {
    await chrome.runtime.sendMessage<RuntimeMessage>({
      action: RuntimeMessageAction.OFFSCREEN_READY,
    });
  } catch (err) {
    console.debug('Failed to notify OFFSCREEN_READY:', err);
  }
}

async function performOcr(
  payload: PerformOcrPayload,
  port: chrome.runtime.Port,
): Promise<void> {
  if (
    (payload.engine === 'auto' && engine === 'tesseract') ||
    payload.engine === 'tesseract'
  ) {
    if (!payload.language) {
      console.error('Tesseract engine requires a language', payload);
      return;
    }
    await recognizeTesseract(payload, port.postMessage.bind(port));
  } else if (
    (payload.engine === 'auto' && engine === 'granite') ||
    payload.engine === 'granite'
  ) {
    await recognizeGranite(payload, port.postMessage.bind(port));
  } else {
    console.error('Unsupported engine specified:', payload.engine);
    return;
  }
  return;
}
