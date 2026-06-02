// SLANet_plus table structure recognition on top of onnxruntime-web.
//
// Neither ppu-paddle-ocr nor ppu-doclayout implements table structure
// recognition, so this wraps the ONNX model directly (mirroring how the other
// engines drive `ort`). One forward pass yields both the HTML structure token
// sequence and a per-cell bounding box; cell text is filled in separately by
// the existing PaddleOCR recognizer (see structured.ts / match.ts).
//
// Pre/post-processing follows PaddleOCR release/2.7 (ResizeTableImage max_len
// 488, ImageNet normalize, top-left pad to 488x488, TableLabelDecode greedy
// decode). The two outputs are resolved by tensor shape, not by name, since the
// exported model may use generic output names.

import * as ort from 'onnxruntime-web';
import { buildStructureDict, type StructureDict } from './dict';

const INPUT_SIZE = 488;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
/** PaddleOCR caps the structure sequence at 500 steps. */
const MAX_STEPS = 500;

export interface TableStructureModelUrls {
  /** SLANet_plus.onnx URL. */
  model: string;
  /** table_structure_dict.txt URL. */
  dictionary: string;
}

export interface TableStructureOptions {
  executionProviders?: ('webgpu' | 'wasm')[];
}

export interface TableStructureResult {
  /** Inner structure tokens, e.g. ['<thead>','<tr>','<td></td>',…]. */
  structureTokens: string[];
  /** One [x1,y1,x2,y2] (crop px) per cell token, in document order. */
  cellBoxes: number[][];
  /** Mean per-step argmax probability. */
  confidence: number;
}

/** Narrow a tensor's data to Float32Array, throwing on any other dtype. */
function asFloat32(tensor: ort.Tensor): Float32Array {
  const { data } = tensor;
  if (tensor.type !== 'float32' || !(data instanceof Float32Array)) {
    throw new Error(`table: expected float32 tensor, got ${tensor.type}`);
  }
  return data;
}

/** Map a normalized [0,1] cell box (relative to original crop) to crop px. */
function scaleBbox(
  b: ArrayLike<number>,
  srcW: number,
  srcH: number,
): [number, number, number, number] {
  // Mirrors TableLabelDecode._bbox_decode: x *= w, y *= h. SLANet_plus emits 4
  // coords (x1,y1,x2,y2); the 8-coord SLANet polygon is reduced to its extent.
  if (b.length >= 8) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < b.length; i += 2) {
      minX = Math.min(minX, b[i]);
      maxX = Math.max(maxX, b[i]);
      minY = Math.min(minY, b[i + 1]);
      maxY = Math.max(maxY, b[i + 1]);
    }
    return [minX * srcW, minY * srcH, maxX * srcW, maxY * srcH];
  }
  return [b[0] * srcW, b[1] * srcH, b[2] * srcW, b[3] * srcH];
}

/**
 * Greedy decode of SLANet outputs into structure tokens + cell boxes.
 * Mirrors PaddleOCR's TableLabelDecode: argmax per step, stop at <eos>, skip
 * special tokens, and emit a cell box for every td-bearing token. Exported as a
 * pure function for testing.
 */
export function decodeStructure(
  probs: ArrayLike<number>,
  steps: number,
  vocab: number,
  locData: ArrayLike<number>,
  locStride: number,
  dict: StructureDict,
  srcW: number,
  srcH: number,
): TableStructureResult {
  const structureTokens: string[] = [];
  const cellBoxes: number[][] = [];
  let confSum = 0;
  let confCount = 0;

  const limit = Math.min(steps, MAX_STEPS);
  for (let t = 0; t < limit; t++) {
    const base = t * vocab;
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let j = 0; j < vocab; j++) {
      const v = probs[base + j];
      if (v > bestVal) {
        bestVal = v;
        bestIdx = j;
      }
    }

    if (t > 0 && bestIdx === dict.endIdx) break;
    if (dict.ignoredIdxSet.has(bestIdx)) continue;

    structureTokens.push(dict.list[bestIdx]);
    confSum += bestVal;
    confCount++;

    if (dict.tdIdxSet.has(bestIdx)) {
      const off = t * locStride;
      const slice: number[] = [];
      for (let k = 0; k < locStride; k++) slice.push(locData[off + k]);
      cellBoxes.push(scaleBbox(slice, srcW, srcH));
    }
  }

  return {
    structureTokens,
    cellBoxes,
    confidence: confCount > 0 ? confSum / confCount : 0,
  };
}

export class TableStructureService {
  private session: ort.InferenceSession | null = null;
  private dict: StructureDict | null = null;
  private urls: TableStructureModelUrls;
  private opts: TableStructureOptions | undefined;

  constructor(urls: TableStructureModelUrls, opts?: TableStructureOptions) {
    this.urls = urls;
    this.opts = opts;
  }

  public async initialize(): Promise<void> {
    if (this.session && this.dict) return;

    const dictText = await (await fetch(this.urls.dictionary)).text();
    this.dict = buildStructureDict(dictText);

    this.session = await ort.InferenceSession.create(this.urls.model, {
      // SLANet has attention/RNN ops; default to WASM (same caution as the
      // layout model) unless the caller forces a provider.
      executionProviders: this.opts?.executionProviders ?? ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }

  public dispose(): void {
    this.session?.release?.();
    this.session = null;
  }

  /** Preprocess a crop into a [1,3,488,488] float32 tensor. */
  private preprocess(src: OffscreenCanvas): {
    tensor: ort.Tensor;
    srcW: number;
    srcH: number;
  } {
    const srcW = src.width;
    const srcH = src.height;
    const ratio = INPUT_SIZE / Math.max(srcW, srcH);
    const rw = Math.floor(srcW * ratio);
    const rh = Math.floor(srcH * ratio);

    const padded = new OffscreenCanvas(INPUT_SIZE, INPUT_SIZE);
    const ctx = padded.getContext('2d');
    if (!ctx) throw new Error('table: failed to get 2d context');
    // Content goes top-left; the rest stays transparent black (becomes 0).
    ctx.drawImage(src, 0, 0, srcW, srcH, 0, 0, rw, rh);
    const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

    const plane = INPUT_SIZE * INPUT_SIZE;
    const out = new Float32Array(3 * plane);
    for (let y = 0; y < INPUT_SIZE; y++) {
      for (let x = 0; x < INPUT_SIZE; x++) {
        const inside = x < rw && y < rh;
        const p = (y * INPUT_SIZE + x) * 4;
        const o = y * INPUT_SIZE + x;
        for (let c = 0; c < 3; c++) {
          // Padding is literal 0 (applied after normalize), per PaddleOCR.
          out[c * plane + o] = inside
            ? (data[p + c] / 255 - MEAN[c]) / STD[c]
            : 0;
        }
      }
    }

    return {
      tensor: new ort.Tensor('float32', out, [1, 3, INPUT_SIZE, INPUT_SIZE]),
      srcW,
      srcH,
    };
  }

  public async recognize(src: OffscreenCanvas): Promise<TableStructureResult> {
    if (!this.session || !this.dict) {
      throw new Error('TableStructureService not initialized');
    }
    const dict = this.dict;
    const { tensor, srcW, srcH } = this.preprocess(src);

    const feeds: Record<string, ort.Tensor> = {
      [this.session.inputNames[0]]: tensor,
    };
    const results = await this.session.run(feeds);

    // Resolve outputs by shape: rank-3, last dim == vocab -> structure logits;
    // rank-3, small last dim (4 or 8) -> cell bbox regression.
    const outputs = Object.values(results);
    const vocab = dict.list.length;
    let structure: ort.Tensor | null = null;
    let loc: ort.Tensor | null = null;
    for (const t of outputs) {
      const last = t.dims[t.dims.length - 1];
      if (last === vocab) structure = t;
      else if (last === 4 || last === 8) loc = t;
    }
    if (!structure || !loc) {
      throw new Error(
        `table: unexpected SLANet outputs ${outputs
          .map((t) => `[${t.dims.join(',')}]`)
          .join(' ')} (vocab=${vocab})`,
      );
    }

    const probs = asFloat32(structure);
    const locData = asFloat32(loc);
    const steps = structure.dims[1];
    const locStride = loc.dims[loc.dims.length - 1];

    return decodeStructure(
      probs,
      steps,
      vocab,
      locData,
      locStride,
      dict,
      srcW,
      srcH,
    );
  }
}
