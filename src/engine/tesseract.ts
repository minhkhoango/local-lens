import type { PerformOcrPayload, TabsConnect } from '../types';
import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;
let currentLanguage: string = 'eng';

export async function recognizeTesseract(
  payload: PerformOcrPayload,
  postMessage: (message: TabsConnect) => void,
): Promise<void> {
  const { croppedImage, language } = payload;
  if (!croppedImage || !language) {
    throw new Error('No saved cropped image or language found for retry');
  }

  try {
    await loadTesseract(language);
    if (!worker) {
      throw new Error('Failed to load Tesseract worker');
    }
  } catch (err) {
    postMessage({
      action: 'ERROR',
      payload: {
        stage: 'error',
        error: 'Failed to initialize Tesseract worker',
      },
    });
    throw err;
  }

  currentLanguage = language;

  console.debug(`perform recognizing`);
  postMessage({
    action: 'PROGRESS',
    payload: { stage: 'recognizing', text: '' },
  });
  try {
    const result = await worker.recognize(croppedImage);
    console.debug('result:', result);
    console.debug('data:', result.data);
    const confidence = result.data.confidence;
    const text = result.data.text.trim();

    console.debug(`OCR SUCCESS [confidence: ${confidence}%]:\n`);
    postMessage({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: {
          textPlain: text,
          textHtml: text,
        },
      },
    });
  } catch (err) {
    console.error('Recognition error:', err);
    postMessage({
      action: 'ERROR',
      payload: {
        stage: 'error',
        error: `Tesseract recognition failed: ${err}`,
      },
    });
  }
}

export async function loadTesseract(language: string): Promise<void> {
  if (worker && currentLanguage === language) {
    console.debug('reusing old worker');
    return;
  }

  if (worker && currentLanguage !== language) {
    console.debug(`re-init worker from ${currentLanguage} to ${language}`);
    try {
      await worker.reinitialize(language, 1);
    } catch (err) {
      console.warn(`worker re-init failed: ${err}, return old worker`);
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
}
