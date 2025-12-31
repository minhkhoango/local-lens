import { FILES_PATH, OCR_CONFIG } from './constants';
import { ExtensionAction } from './types';
import type {
  ExtensionMessage,
  MessageResponse,
  SelectionRect,
  CropReadyPayload,
} from './types';
import Tesseract from 'tesseract.js';

// Initialize worker once
let worker: Tesseract.Worker | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ) => {
    switch (message.action) {
      case ExtensionAction.PING_OFFSCREEN:
        sendResponse({ status: 'ok', message: 'pong' });
        break;

      case ExtensionAction.PERFORM_OCR:
        const { imageDataUrl, rect } = message.payload;
        runTesseractOcr(imageDataUrl, rect, sendResponse);
        break;
    }

    return true; // Keep channel open
  }
);

async function runTesseractOcr(
  imageDataUrl: string,
  rect: SelectionRect,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  // Calculate cursor position from selection rect (bottom-right corner)
  const cursorPosition = {
    x: rect.x + rect.width,
    y: rect.y + rect.height,
  };

  try {
    console.log(`[Offscreen] Processing ${rect.width}x${rect.height} region`);

    // Crop the image to the selected region
    let cropped: string;
    try {
      cropped = await cropImage(imageDataUrl, rect);
    } catch (err) {
      console.error('[Offscreen] Image cropping error:', err);
      sendResponse({
        status: 'error',
        message: `Image cropping failed: ${(err as Error).message}`,
        confidence: 0,
        croppedImageUrl: '',
      });
      return;
    }

    // Send CROP_READY message to background (which will forward to content script)
    const cropReadyPayload: CropReadyPayload = {
      croppedImageUrl: cropped,
      cursorPosition,
    };
    chrome.runtime.sendMessage<ExtensionMessage>({
      action: ExtensionAction.CROP_READY,
      payload: cropReadyPayload,
    });

    // Initialize or reuse Tesseract worker
    let engine: Tesseract.Worker;
    try {
      engine = await getWorker();
    } catch (err) {
      console.error('[Offscreen] Worker initialization error:', err);
      sendResponse({
        status: 'error',
        message: `OCR worker initialization failed: ${(err as Error).message}`,
        confidence: 0,
        croppedImageUrl: cropped,
      });
      return;
    }

    // Perform OCR recognition
    const result = await engine.recognize(cropped);
    const text = result.data.text.trim();
    const confidence = result.data.confidence;

    console.log(`OCR SUCCESS [confidence: ${confidence}%]:\n`, text);
    sendResponse({
      status: 'ok',
      message: text,
      confidence,
      croppedImageUrl: cropped,
    });
  } catch (err) {
    console.error('[Offscreen] OCR recognition error:', err);
    sendResponse({
      status: 'error',
      message: `OCR recognition failed: ${(err as Error).message}`,
      confidence: 0,
      croppedImageUrl: '',
    });
  }
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

async function getWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;

  worker = await Tesseract.createWorker(OCR_CONFIG.LANG, OCR_CONFIG.OEM, {
    workerBlobURL: false,
    workerPath: FILES_PATH.OCR_WORKER,
    corePath: FILES_PATH.OCR_CORE,
    cacheMethod: OCR_CONFIG.CACHE_METHOD,
  });

  return worker;
}

// Start warming up the worker as soon as the offscreen doc loads
getWorker().catch((err) => console.error('Warmup failed:', err));
