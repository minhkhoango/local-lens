import * as ort from 'onnxruntime-web';
import { PaddleOcrService, isWebGpuAvailable } from 'ppu-paddle-ocr/web';
import type { PerformOcrPayload, TabsConnect } from '../types';
import { localize } from './i18n';
import type { OcrEngine } from './types';

export interface PaddleModelUrls {
  detection: string;
  recognition: string;
  charactersDictionary: string;
  /** Directory containing onnxruntime-web .wasm/.mjs assets. Optional in tests. */
  wasmPaths?: string;
}

export type ExecutionProvider = 'webgpu' | 'wasm';

export interface FastEngineOptions {
  /**
   * Override execution providers. Default is WebGPU-then-WASM (with WASM-only
   * fallback if WebGPU is unavailable). Used by benchmarks to force a single
   * provider.
   */
  executionProviders?: ExecutionProvider[];
}

function defaultModelUrls(): PaddleModelUrls {
  const base = chrome.runtime.getURL('paddle_engine/');
  return {
    detection: base + 'PP-OCRv5_mobile_det_infer.ort',
    // Int8 produces byte-identical OCR output to fp32 on our fixtures (see
    // tests/bench/RESULTS.md) at ~10% smaller file size, so int8 is default.
    recognition: base + 'en_PP-OCRv5_mobile_rec_infer_int8.ort',
    charactersDictionary: base + 'ppocrv5_en_dict.txt',
    wasmPaths: base,
  };
}

/** Opt-in fp32 recognition URLs, kept for benchmark comparisons. */
export function fp32ModelUrls(): PaddleModelUrls {
  return {
    ...defaultModelUrls(),
    recognition:
      chrome.runtime.getURL('paddle_engine/') +
      'en_PP-OCRv5_mobile_rec_infer.ort',
  };
}

export class FastEngine implements OcrEngine {
  private service: PaddleOcrService | null = null;
  private loadingPromise: Promise<void> | null = null;
  // Tesseract reported 0–100; we rescale Paddle's 0–1 to match.
  public lastConfidence: number | null = null;
  private modelUrls: PaddleModelUrls;
  private executionProvidersOverride: ExecutionProvider[] | undefined;

  constructor(modelUrls?: PaddleModelUrls, options?: FastEngineOptions) {
    this.modelUrls = modelUrls ?? defaultModelUrls();
    this.executionProvidersOverride = options?.executionProviders;
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

      const executionProviders =
        this.executionProvidersOverride ??
        (webGpu ? (['webgpu', 'wasm'] as const) : (['wasm'] as const));

      const service = new PaddleOcrService({
        model: {
          detection: this.modelUrls.detection,
          recognition: this.modelUrls.recognition,
          charactersDictionary: this.modelUrls.charactersDictionary,
        },
        session: {
          executionProviders: [...executionProviders],
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
          error: localize(
            'engine_fast_err_init',
            'Fast engine failed to initialize.',
          ),
        },
      });
      return;
    }
    if (!this.service) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: localize(
            'engine_fast_err_init',
            'Fast engine failed to initialize.',
          ),
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
          error: localize(
            'engine_fast_err_recognize',
            'Fast engine failed to recognize the image.',
          ),
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
