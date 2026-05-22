import * as ort from 'onnxruntime-web';
import { PaddleOcrService, isWebGpuAvailable } from 'ppu-paddle-ocr/web';
import type { PerformOcrPayload, TabsConnect } from '../types';
import type { OcrEngine } from './types';

export interface PaddleModelUrls {
  detection: string;
  recognition: string;
  charactersDictionary: string;
  /** Directory containing onnxruntime-web .wasm/.mjs assets. Optional in tests. */
  wasmPaths?: string;
}

function defaultModelUrls(): PaddleModelUrls {
  const base = chrome.runtime.getURL('paddle_engine/');
  return {
    detection: base + 'PP-OCRv5_mobile_det_infer.ort',
    recognition: base + 'en_PP-OCRv5_mobile_rec_infer.ort',
    charactersDictionary: base + 'ppocrv5_en_dict.txt',
    wasmPaths: base,
  };
}

export class PaddleFastEngine implements OcrEngine {
  private service: PaddleOcrService | null = null;
  private loadingPromise: Promise<void> | null = null;
  // Tesseract reported 0–100; we rescale Paddle's 0–1 to match.
  public lastConfidence: number | null = null;
  private modelUrls: PaddleModelUrls;

  constructor(modelUrls?: PaddleModelUrls) {
    this.modelUrls = modelUrls ?? defaultModelUrls();
  }

  public async load(
    arg?: unknown,
    postMessage?: (message: TabsConnect) => void,
  ): Promise<void> {
    void arg;
    if (this.service) {
      console.debug('reusing paddle service');
      return;
    }
    if (this.loadingPromise) {
      console.debug('paddle is currently loading, awaiting existing promise');
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = (async () => {
      if (this.modelUrls.wasmPaths) {
        ort.env.wasm.wasmPaths = this.modelUrls.wasmPaths;
      }

      const webGpu = await isWebGpuAvailable();
      console.debug('paddle: webGpu available =', webGpu);

      const service = new PaddleOcrService({
        model: {
          detection: this.modelUrls.detection,
          recognition: this.modelUrls.recognition,
          charactersDictionary: this.modelUrls.charactersDictionary,
        },
        session: {
          executionProviders: webGpu ? ['webgpu', 'wasm'] : ['wasm'],
          graphOptimizationLevel: 'all',
        },
      });

      postMessage?.({
        action: 'PROGRESS',
        payload: { stage: 'loading-model', text: '' },
      });

      await service.initialize();
      this.service = service;
    })();

    try {
      await this.loadingPromise;
    } catch (err) {
      this.service = null;
      throw err;
    } finally {
      this.loadingPromise = null;
    }
  }

  public async recognize(
    payload: PerformOcrPayload,
    postMessage: (message: TabsConnect) => void,
  ): Promise<void> {
    const { croppedImage } = payload;
    if (!croppedImage) {
      throw new Error('No cropped image found for recognize');
    }

    try {
      await this.load(undefined, postMessage);
    } catch (err) {
      console.error('Paddle load error:', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_fast_err_init'),
        },
      });
      return;
    }
    if (!this.service) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: chrome.i18n.getMessage('engine_fast_err_init'),
        },
      });
      return;
    }

    postMessage({
      action: 'PROGRESS',
      payload: { stage: 'recognizing', text: '' },
    });

    let result;
    try {
      const buf = await (await fetch(croppedImage)).arrayBuffer();
      result = await this.service.recognize(buf, { flatten: false });
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

    const confidence01 = result?.confidence ?? 0;
    this.lastConfidence = Math.round(confidence01 * 100);
    const textPlain = (result?.text ?? '').trim();
    const textHtml = textPlain.replace(/\n/g, '<br>');

    console.debug(`OCR SUCCESS [confidence: ${this.lastConfidence}%]`);
    postMessage({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: { textPlain, textHtml },
      },
    });
  }

  public async stop(): Promise<void> {
    if (!this.service) return;
    try {
      await this.service.destroy();
    } catch {}
    this.service = null;
  }
}
