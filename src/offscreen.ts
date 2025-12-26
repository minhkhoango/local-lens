import { FILES, OCR } from './constants';
import { ExtensionAction } from './types';
import type { ExtensionMessage, MessageResponse, SelectionRect } from './types';
import Tesseract from 'tesseract.js';

// Initialize worker once
let worker: Tesseract.Worker | null = null;

chrome.runtime.onMessage.addListener(
  async (
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
        await runTesseractOcr(imageDataUrl, rect, sendResponse);
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
      });
      return;
    }

    // Initialize or reuse Tesseract worker
    let engine: Tesseract.Worker;
    try {
      engine = await getWorker();
    } catch (err) {
      console.error('[Offscreen] Worker initialization error:', err);
      sendResponse({
        status: 'error',
        message: `OCR worker initialization failed: ${(err as Error).message}`,
      });
      return;
    }

    // Perform OCR recognition
    const result = await engine.recognize(cropped);
    const text = result.data.text.trim();
    const confidence = result.data.confidence;

    console.log(`OCR SUCCESS [confidence: ${confidence}%]:\n`, text);
    sendResponse({ status: 'ok', message: text });
  } catch (err) {
    console.error('[Offscreen] OCR recognition error:', err);
    sendResponse({
      status: 'error',
      message: `OCR recognition failed: ${(err as Error).message}`,
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

  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.drawImage(
    img, // source image
    // 1-4: what to copy
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    // where & how to draw it
    0,
    0,
    rect.width,
    rect.height
  );

  return canvas.toDataURL(OCR.CROP_MIME);
}

async function getWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;

  worker = await Tesseract.createWorker(OCR.LANG, OCR.OEM, {
    workerBlobURL: false,
    workerPath: FILES.OCR_WORKER,
    corePath: FILES.OCR_CORE,
    cacheMethod: OCR.CACHE_METHOD,
    logger: (m) => {
      if (m.status === OCR.PROGRESS_STATUS)
        console.log(`[OCR] ${Math.floor(m.progress * 100)}%`);
    },
  });

  return worker;
}
