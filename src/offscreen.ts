import { FILES_PATH, OCR_CONFIG } from './constants';
import type { TesseractLang } from './language_map';
import { ExtensionAction } from './types';
import type { ExtensionMessage, MessageResponse } from './types';
import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;
let currentLanguage: string = 'eng';

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.PERFORM_OCR:
        console.debug(message.action);
        const { croppedImage: cropped, language } = message.payload;
        currentLanguage = language;
        runTesseractOcr(language, cropped, sendResponse);
        return true; // Keep channel open for async response
    }

    return false;
  }
);

async function runTesseractOcr(
  language: TesseractLang,
  croppedImage: string | null,
  sendResponse: (response: MessageResponse) => void
) {
  try {
    if (!croppedImage) {
      throw new Error('No saved cropped image found for retry');
    }

    console.debug(`Retrying OCR with language: ${language}`);
    await performRecognition(croppedImage, language, sendResponse);
  } catch (err) {
    console.error('Retry error:', err);
    sendResponse({
      status: 'error',
      message: `Retry failed: ${(err as Error).message}`,
      confidence: 0,
    });
  }
}

async function performRecognition(
  image: string,
  language: string,
  sendResponse: (response: MessageResponse) => void
) {
  // Initialize or reuse Tesseract worker
  let engine: Tesseract.Worker;
  try {
    engine = await getWorker(language);
  } catch (err) {
    console.error('Worker initialization error:', err);
    sendResponse({
      status: 'error',
      message: `OCR worker initialization failed: ${(err as Error).message}`,
      confidence: 0,
      croppedImageUrl: image,
    });
    return;
  }

  console.debug(`engine: ${engine}, perform recognizing`);
  try {
    const result = await engine.recognize(image);
    const confidence = result.data.confidence;
    const text = result.data.text.trim();

    console.debug(`OCR SUCCESS [confidence: ${confidence}%]:\n`);
    sendResponse({
      status: 'ok',
      message: text,
      confidence,
      croppedImageUrl: image,
    });
  } catch (err) {
    console.error('Recognition error:', err);
    sendResponse({
      status: 'error',
      message: `OCR recognition failed: ${(err as Error).message}`,
      confidence: 0,
      croppedImageUrl: image,
    });
  }
}

/*
 * KNOWN ISSUE: "Parameter not found" warnings during language initialization
 * These are legacy parameters embedded in the .traineddata, and are harmless
 * Infected: chi_sim, chi_tra, greek, italian, japanese, korean, vietnamese
 */
async function getWorker(language: string): Promise<Tesseract.Worker> {
  if (worker && currentLanguage === language) {
    console.debug('reusing old worker');
    return worker;
  }

  if (worker && currentLanguage !== language) {
    console.debug(`re-init worker from ${currentLanguage} to ${language}`);
    try {
      await worker.reinitialize(language, OCR_CONFIG.OEM);
      currentLanguage = language;
      return worker;
    } catch (err) {
      console.warn(`worker re-init failed: ${err}, return old worker`);
      return worker;
    }
  }

  console.debug('create new worker lang:', language);
  worker = await Tesseract.createWorker(language, OCR_CONFIG.OEM, {
    workerBlobURL: false,
    workerPath: FILES_PATH.OCR_WORKER,
    corePath: FILES_PATH.OCR_CORE,
    langPath: OCR_CONFIG.LANG_PATH,
    cacheMethod: OCR_CONFIG.CACHE_METHOD,
    logger: (_m) => {},
  });

  currentLanguage = language;
  return worker;
}

// Start warming up the worker as soon as the offscreen doc loads
getWorker(currentLanguage).catch((err) => console.error('Warmup failed:', err));
