import type { PerformOcrPayload, TabsConnect } from '../types';
import Tesseract from 'tesseract.js';

export class TesseractEngine {
  private worker: Tesseract.Worker | null = null;
  private currentLanguage: string = 'eng';

  public async load(language: string): Promise<void> {
    if (this.worker && this.currentLanguage === language) {
      console.debug('reusing old worker');
      return;
    }

    if (this.worker && this.currentLanguage !== language) {
      console.debug(
        `re-init worker from ${this.currentLanguage} to ${language}`,
      );
      try {
        await this.worker.reinitialize(language, 1);
        return;
      } catch (err) {
        console.warn(`worker re-init failed: ${err}, return old worker`);
        return;
      }
    }

    console.debug('create new worker lang:', language);
    this.worker = await Tesseract.createWorker(language, 1, {
      workerBlobURL: false,
      workerPath: 'tesseract_engine/worker.min.js',
      corePath: 'tesseract_engine/',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    });
  }

  public async recognize(
    payload: PerformOcrPayload,
    postMessage: (message: TabsConnect) => void,
  ): Promise<void> {
    const { croppedImage, language } = payload;
    if (!croppedImage || !language) {
      throw new Error('No saved cropped image or language found for retry');
    }

    await this.load(language);
    if (!this.worker) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_fast_err_init'),
        },
      });
      return;
    }

    this.currentLanguage = language;
    postMessage({
      action: 'PROGRESS',
      payload: { stage: 'recognizing', text: '' },
    });

    let result: Tesseract.RecognizeResult;
    try {
      result = await this.worker.recognize(croppedImage);
    } catch (err) {
      console.error('Recognition error:', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_fast_err_recognize'),
        },
      });
      return;
    }

    const confidence = result.data.confidence;
    const textPlain = result.data.text.trim();
    const textHtml = textPlain.replace(/\n/g, '<br>');

    console.debug(`OCR SUCCESS [confidence: ${confidence}%]:\n`);
    postMessage({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: {
          textPlain: textPlain,
          textHtml: textHtml,
        },
      },
    });
  }

  public async stop(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.worker.terminate();
      this.worker = null;
    } catch {}
  }
}
