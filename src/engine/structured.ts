import * as ort from 'onnxruntime-web';
import { DocLayoutService } from 'ppu-doclayout/web';
import type { LayoutBox } from 'ppu-doclayout/web';
import {
  PaddleOcrService,
  isWebGpuAvailable,
  type PaddleOcrResult,
} from 'ppu-paddle-ocr/web';
import type { PerformOcrPayload, TabsConnect } from '../types';
import {
  composeStructuredHtml,
  type StructuredRegion,
} from './parser/structured-html';
import { htmlToText } from './parser/text';
import { TableStructureService } from './table/structure';
import { buildTableHtml, type OcrLine } from './table/match';
import type { OcrEngine } from './types';

export interface StructuredModelUrls {
  layoutModel: string;
  detection: string;
  recognition: string;
  charactersDictionary: string;
  /** SLANet_plus table structure recognition model. */
  tableStructureModel: string;
  /** PaddleOCR table structure vocabulary (table_structure_dict.txt). */
  tableStructureDictionary: string;
  /** Directory containing onnxruntime-web .wasm/.mjs assets. */
  wasmPaths?: string;
}

export type ExecutionProvider = 'webgpu' | 'wasm';

export interface StructuredEngineOptions {
  /**
   * Override execution providers for the Paddle OCR (det/rec) sessions only.
   * The layout model is always WASM (WebGPU EP lacks MaxPool ceil support).
   */
  executionProviders?: ExecutionProvider[];
}

function defaultModelUrls(): StructuredModelUrls {
  const paddleBase = chrome.runtime.getURL('paddle_engine/');
  const structuredBase = chrome.runtime.getURL('structured_engine/');
  return {
    layoutModel: structuredBase + 'PP-DocLayoutV3.onnx',
    detection: paddleBase + 'PP-OCRv5_mobile_det_infer.ort',
    // Int8 rec is byte-identical to fp32 on fixtures (tests/bench/RESULTS.md).
    recognition: paddleBase + 'en_PP-OCRv5_mobile_rec_infer_int8.ort',
    charactersDictionary: paddleBase + 'ppocrv5_en_dict.txt',
    tableStructureModel: structuredBase + 'SLANet_plus.onnx',
    tableStructureDictionary: structuredBase + 'table_structure_dict.txt',
    wasmPaths: paddleBase,
  };
}

/** Opt-in fp32 recognition URLs, kept for benchmark comparisons. */
export function fp32ModelUrls(): StructuredModelUrls {
  return {
    ...defaultModelUrls(),
    recognition:
      chrome.runtime.getURL('paddle_engine/') +
      'en_PP-OCRv5_mobile_rec_infer.ort',
  };
}

/** Flatten a grouped OCR result into table-cell-matchable lines. */
function extractOcrLines(ocr: PaddleOcrResult): OcrLine[] {
  const lines: OcrLine[] = [];
  for (const line of ocr.lines ?? []) {
    for (const item of line) {
      const { x, y, width, height } = item.box;
      lines.push({ text: item.text, box: [x, y, x + width, y + height] });
    }
  }
  return lines;
}

export class StructuredEngine implements OcrEngine {
  private docLayout: DocLayoutService | null = null;
  private paddleOcr: PaddleOcrService | null = null;
  private tableStructure: TableStructureService | null = null;
  private loadingPromise: Promise<void> | null = null;
  private modelUrls: StructuredModelUrls;
  private executionProvidersOverride: ExecutionProvider[] | undefined;
  private stopped = false;

  constructor(
    modelUrls?: StructuredModelUrls,
    options?: StructuredEngineOptions,
  ) {
    this.modelUrls = modelUrls ?? defaultModelUrls();
    this.executionProvidersOverride = options?.executionProviders;
  }

  public async load(
    _arg?: unknown,
    postMessage?: (message: TabsConnect) => void,
  ): Promise<void> {
    if (this.docLayout && this.paddleOcr) {
      return;
    }
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = (async () => {
      if (this.modelUrls.wasmPaths) {
        ort.env.wasm.wasmPaths = this.modelUrls.wasmPaths;
      }

      const webGpu = await isWebGpuAvailable();
      const executionProviders =
        this.executionProvidersOverride ??
        (webGpu ? (['webgpu', 'wasm'] as const) : (['wasm'] as const));
      console.debug('structured: webGpu available =', webGpu);

      postMessage?.({
        action: 'PROGRESS',
        payload: { stage: 'loading-model', text: '' },
      });

      const docLayout = new DocLayoutService({
        model: { model: this.modelUrls.layoutModel },
        session: {
          // PP-DocLayoutV3 uses MaxPool with ceil() shape computation, which
          // the onnxruntime-web WebGPU EP doesn't yet support. Force wasm.
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        },
      });
      await docLayout.initialize();
      this.docLayout = docLayout;

      const paddleOcr = new PaddleOcrService({
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
      await paddleOcr.initialize();
      this.paddleOcr = paddleOcr;

      // SLANet has attention/RNN ops the WebGPU EP may not support; keep it on
      // WASM (same constraint as the layout model) for reliability. A failure
      // here only disables table reconstruction (regions fall back to <pre>),
      // so it must not break the whole engine.
      try {
        const tableStructure = new TableStructureService(
          {
            model: this.modelUrls.tableStructureModel,
            dictionary: this.modelUrls.tableStructureDictionary,
          },
          { executionProviders: ['wasm'] },
        );
        await tableStructure.initialize();
        this.tableStructure = tableStructure;
      } catch (err) {
        console.warn('structured: table structure model unavailable', err);
        this.tableStructure = null;
      }
    })();

    try {
      await this.loadingPromise;
    } catch (err) {
      this.docLayout = null;
      this.paddleOcr = null;
      this.tableStructure?.dispose();
      this.tableStructure = null;
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

    this.stopped = false;

    try {
      await this.load(undefined, postMessage);
    } catch (err) {
      console.error('Structured engine load error:', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Failed to initialize structured engine',
        },
      });
      return;
    }

    if (!this.docLayout || !this.paddleOcr) {
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Failed to initialize structured engine',
        },
      });
      return;
    }

    postMessage({
      action: 'PROGRESS',
      payload: { stage: 'recognizing', text: '' },
    });

    let imageBitmap: ImageBitmap;
    let imageBuffer: ArrayBuffer;
    try {
      imageBuffer = await (await fetch(croppedImage)).arrayBuffer();
      const blob = new Blob([imageBuffer]);
      imageBitmap = await createImageBitmap(blob);
    } catch (err) {
      console.error('Structured engine: failed to decode image', err);
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Structured engine failed to recognize text',
        },
      });
      return;
    }

    let boxes: LayoutBox[];
    try {
      const result = await this.docLayout.analyze(imageBuffer);
      boxes = result.boxes;
    } catch (err) {
      console.error('Structured engine: layout analysis failed', err);
      imageBitmap.close();
      postMessage({
        action: 'ERROR',
        payload: {
          stage: 'error',
          error: 'Structured engine failed to recognize text',
        },
      });
      return;
    }

    const regions: StructuredRegion[] = [];
    try {
      for (const box of boxes) {
        if (this.stopped) break;
        const [x1, y1, x2, y2] = box.box;
        const w = Math.max(1, Math.round(x2 - x1));
        const h = Math.max(1, Math.round(y2 - y1));
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(imageBitmap, x1, y1, w, h, 0, 0, w, h);

        let text = '';
        let tableHtml: string | undefined;
        try {
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          const buf = await blob.arrayBuffer();
          const ocr = await this.paddleOcr.recognize(buf, { flatten: false });
          text = (ocr?.text ?? '').trim();

          // Reconstruct a real <table> from a detected table region. Any
          // failure here falls back to the plain-text <pre> rendering below.
          if (box.label === 'table' && this.tableStructure) {
            try {
              const struct = await this.tableStructure.recognize(canvas);
              if (struct.cellBoxes.length > 0) {
                tableHtml = buildTableHtml(
                  struct.structureTokens,
                  struct.cellBoxes,
                  extractOcrLines(ocr),
                );
              }
            } catch (err) {
              console.debug('structured: table structure failed', err);
            }
          }
        } catch (err) {
          console.debug('structured: OCR failed for region', box.label, err);
        }

        regions.push({ label: box.label, text, html: tableHtml });

        const partialHtml = composeStructuredHtml(regions);
        postMessage({
          action: 'PROGRESS',
          payload: {
            stage: 'recognizing',
            text: partialHtml,
          },
        });
      }
    } finally {
      imageBitmap.close();
    }

    const textHtml = composeStructuredHtml(regions);
    const textPlain = htmlToText(textHtml);

    postMessage({
      action: 'FINISH',
      payload: {
        stage: 'done',
        output: { textPlain, textHtml },
      },
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;
  }
}
