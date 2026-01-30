import type { TesseractLang } from './language_map';
import { ExtensionAction } from './types';
import type { ExtensionMessage, OcrResponse } from './types';
import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;
let currentLanguage: string = 'eng';

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: OcrResponse) => void,
  ) => {
    switch (message.action) {
      case ExtensionAction.PERFORM_OCR:
        console.debug(message.action);
        const { croppedImage: cropped, language } = message.payload;
        performRecognition(language, cropped, sendResponse);
        return true;
    }

    return false;
  },
);

async function performRecognition(
  language: TesseractLang,
  image: string | null,
  sendResponse: (response: OcrResponse) => void,
) {
  if (!image) {
    throw new Error('No saved cropped image found for retry');
  }
  let engine: Tesseract.Worker;
  try {
    engine = await getWorker(language);
  } catch (err) {
    console.error('Worker initialization error:', err);
    sendResponse({
      status: 'error',
      text: '',
      confidence: 0,
    });
    return;
  }

  currentLanguage = language;

  console.debug(`engine: ${engine}, perform recognizing`);
  try {
    const result = await engine.recognize(image);
    console.debug('result:', result);
    console.debug('data:', result.data);
    const confidence = result.data.confidence;
    const text = result.data.text.trim();

    console.debug(`OCR SUCCESS [confidence: ${confidence}%]:\n`);
    sendResponse({
      status: 'ok',
      text: text,
      confidence,
    });
  } catch (err) {
    console.error('Recognition error:', err);
    sendResponse({
      status: 'error',
      text: '',
      confidence: 0,
    });
  }
}

async function getWorker(language: string): Promise<Tesseract.Worker> {
  if (worker && currentLanguage === language) {
    console.debug('reusing old worker');
    return worker;
  }

  if (worker && currentLanguage !== language) {
    console.debug(`re-init worker from ${currentLanguage} to ${language}`);
    try {
      await worker.reinitialize(language, 1);
      return worker;
    } catch (err) {
      console.warn(`worker re-init failed: ${err}, return old worker`);
      return worker;
    }
  }

  console.debug('create new worker lang:', language);
  worker = await Tesseract.createWorker(language, 1, {
    workerBlobURL: false,
    workerPath: 'tesseract_engine/worker.min.js',
    corePath: 'tesseract_engine/',
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    logger: (_m) => {},
  });
  return worker;
}

getWorker(currentLanguage).catch((err) => console.error('Warmup failed:', err));
