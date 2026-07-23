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
    // PP-OCRv6 tiny, fp32 .onnx. We ship .onnx (not .ort) because the WebGPU
    // execution provider mis-partitions .ort graphs back onto WASM
    // (onnxruntime-web #24475); PP-OCRv6's recognizer is SVTR/CTC (no LSTM), so
    // with .onnx the det+rec sessions actually run on the GPU.
    detection: base + 'PP-OCRv6_tiny_det.onnx',
    recognition: base + 'PP-OCRv6_tiny_rec.onnx',
    charactersDictionary: base + 'ppocrv6_tiny_dict.txt',
    wasmPaths: base,
  };
}

export class FastEngine implements OcrEngine {
  private service: PaddleOcrService | null = null;
  private loadingPromise: Promise<void> | null = null;
  // Paddle reports confidence as 0–1; rescale to 0–100 for the surface API.
  public lastConfidence: number | null = null;
  private modelUrls: PaddleModelUrls;
  private executionProvidersOverride: ExecutionProvider[] | undefined;
  // Mirrors StructuredEngine: a normal stop() only flips this flag and leaves
  // the model warm. recognize() resets it, so it can never block a later call.
  private stopped = false;

  constructor(modelUrls?: PaddleModelUrls, options?: FastEngineOptions) {
    this.modelUrls = modelUrls ?? defaultModelUrls();
    this.executionProvidersOverride = options?.executionProviders;
  }

  public async load(
    _arg?: unknown,
    postMessage?: (message: TabsConnect) => void,
  ): Promise<void> {
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
        // Pure-canvas preprocessing (no OpenCV.js). ppu-paddle-ocr 6.x defaults
        // to the 'opencv' engine, which would pull ppu-ocv's OpenCV wasm into
        // the bundle; 'canvas-native' keeps the extension lean and fully offline.
        processing: { engine: 'canvas-native' },
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

    // A prior warm stop() may have left this set; clear it so a fresh request
    // always proceeds (symmetry with StructuredEngine.recognize).
    this.stopped = false;

    try {
      await this.load(undefined, postMessage);
    } catch (err) {
      console.error('Paddle load error:', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Failed to initialize fast engine',
        },
      });
      return;
    }
    if (!this.service) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Failed to initialize fast engine',
        },
      });
      return;
    }

    // If stop() arrived while the model was loading, cancel cooperatively: the
    // island that requested this OCR is already tearing down (STOP_OFFSCREEN
    // fires on island close), so nothing is waiting on a terminal event. This
    // mirrors StructuredEngine's in-loop `stopped` check. recognize() reset the
    // flag on entry, so this only trips for a stop() concurrent with THIS call.
    if (this.stopped) return;

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
          error: 'Fast engine failed to recognize text',
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

  /**
   * Warm stop: mirror StructuredEngine's semantics. The UI island closing
   * (STOP_OFFSCREEN) must NOT tear down the loaded model — cold-reloading it
   * (fetch + session create + kernel compile) costs several seconds on the
   * next OCR. We keep `this.service` in memory so the `if (this.service) return`
   * guard in load() makes the next recognize() instant. `stopped` is reset by
   * recognize(), so it never blocks a subsequent request.
   */
  public async stop(): Promise<void> {
    this.stopped = true;
  }

  /**
   * Explicit teardown for genuine shutdown. Unlike stop(), this actually
   * releases the ONNX sessions; the next recognize() will cold-load again.
   * Deliberately NOT called from the normal stop path.
   */
  public async destroy(): Promise<void> {
    this.stopped = true;
    if (!this.service) return;
    try {
      await this.service.destroy();
    } catch {}
    this.service = null;
  }
}
