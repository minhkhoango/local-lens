import { FILES_PATH, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type { ExtensionMessage, MessageResponse, SelectionRect } from './types';
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
      case ExtensionAction.PING_OFFSCREEN:
        console.debug(message.action);
        sendResponse({ status: 'ok', message: 'pong' });
        return false;

      case ExtensionAction.PERFORM_OCR:
        console.debug(message.action);
        const { imageDataUrl, rect, language } = message.payload;
        currentLanguage = language;
        runTesseractOcr(imageDataUrl, rect, language, sendResponse);
        return true; // Keep channel open for async response

      case ExtensionAction.UPDATE_LANGUAGE:
        console.debug(message.action);
        const { language: retryLanguage, croppedImage } = message.payload;
        retryTesseractOcr(retryLanguage, croppedImage, sendResponse);
        return true; // Keep channel open for async response
    }

    return false;
  }
);

async function runTesseractOcr(
  imageDataUrl: string,
  rect: SelectionRect,
  language: string,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  // Calculate cursor position from selection rect (bottom-right corner)
  const cursorPosition = {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  };

  try {
    console.debug(`Processing ${rect.width}x${rect.height} region`);

    // Crop the image to the selected region
    let cropped: string;
    try {
      cropped = await cropImage(imageDataUrl, rect);
    } catch (err) {
      console.error('Image cropping error:', err);
      sendResponse({
        status: 'error',
        message: `Image cropping failed: ${(err as Error).message}`,
        confidence: 0,
        croppedImageUrl: '',
      });
      return;
    }

    console.debug('sending cropped img -> bg -> content');
    chrome.runtime.sendMessage<ExtensionMessage>({
      action: ExtensionAction.CROP_READY,
      payload: {
        croppedImageUrl: cropped,
        cursorPosition,
      },
    });

    console.debug('running OCR');
    await performRecognition(cropped, language, sendResponse);
  } catch (err) {
    console.error('OCR recognition error:', err);
    sendResponse({
      status: 'error',
      message: `OCR recognition failed: ${(err as Error).message}`,
      confidence: 0,
      croppedImageUrl: '',
    });
  }
}

async function retryTesseractOcr(
  language: string,
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

async function cropImage(
  dataUrl: string,
  rect: SelectionRect
): Promise<string> {
  const img = new Image();

  // wait for image to load from dataUrl
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context failed');
  }

  // Scale coordinates from CSS pxl to native
  const dpr = rect.devicePixelRatio || 1;
  const scaledX = rect.x * dpr;
  const scaledY = rect.y * dpr;
  const scaledWidth = rect.width * dpr;
  const scaledHeight = rect.height * dpr;

  canvas.width = scaledWidth;
  canvas.height = scaledHeight;

  ctx.drawImage(
    img, // source image
    // 1-4: what to copy (in native/scaled pixels)
    scaledX,
    scaledY,
    scaledWidth,
    scaledHeight,
    // where & how to draw it (also in scaled pixels)
    0,
    0,
    scaledWidth,
    scaledHeight
  );

  return canvas.toDataURL(OCR_CONFIG.CROP_MIME);
}

// Start warming up the worker as soon as the offscreen doc loads
getWorker(currentLanguage).catch((err) => console.error('Warmup failed:', err));
