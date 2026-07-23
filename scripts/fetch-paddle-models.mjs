#!/usr/bin/env node
// Download model weights for the bundled engines.
//   - PP-OCRv6 tiny (det + rec + dict)                 -> public/paddle_engine/
//   - PP-DocLayoutV3 (layout) + SLANet_plus (table)    -> public/structured_engine/
// Re-run is a no-op once files exist.
//
// Recognition/detection models are fp32 .onnx (not .ort): the onnxruntime-web
// WebGPU execution provider mis-partitions .ort graphs back onto WASM
// (microsoft/onnxruntime#24475), so .onnx is required for the det/rec sessions
// to actually run on the GPU. PP-OCRv6's recognizer is SVTR/CTC (no recurrent
// ops), so it stays GPU-resident.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PADDLE_DIR = join(__dirname, '..', 'public', 'paddle_engine');
const STRUCTURED_DIR = join(__dirname, '..', 'public', 'structured_engine');

const MODELS_BASE =
  'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';
const RAW_BASE =
  'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';

const FILES = [
  {
    dir: PADDLE_DIR,
    url: `${MODELS_BASE}/detection/PP-OCRv6_tiny_det.onnx`,
    name: 'PP-OCRv6_tiny_det.onnx',
  },
  {
    dir: PADDLE_DIR,
    url: `${MODELS_BASE}/recognition/PP-OCRv6_tiny_rec.onnx`,
    name: 'PP-OCRv6_tiny_rec.onnx',
  },
  {
    dir: PADDLE_DIR,
    url: `${RAW_BASE}/recognition/ppocrv6_tiny_dict.txt`,
    name: 'ppocrv6_tiny_dict.txt',
  },
  {
    dir: STRUCTURED_DIR,
    url: `${MODELS_BASE}/layout/PP-DocLayoutV3.onnx`,
    name: 'PP-DocLayoutV3.onnx',
  },
  {
    dir: STRUCTURED_DIR,
    // PPU's own table/SLANet_plus.onnx export fails onnxruntime-web shape
    // inference ([ShapeInferenceError] inferred=1 declared=0); the official
    // PaddlePaddle export loads cleanly and embeds the same vocabulary as the
    // table_structure_dict below.
    url: 'https://huggingface.co/PaddlePaddle/SLANet_plus_onnx/resolve/main/inference.onnx',
    name: 'SLANet_plus.onnx',
  },
  {
    dir: STRUCTURED_DIR,
    // SLANet_plus is trained on the extended *_ch vocabulary (48 tokens,
    // colspan/rowspan up to 20) — token-for-token identical to the character
    // dict embedded in the model's inference.yml.
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/release/2.7/ppocr/utils/dict/table_structure_dict_ch.txt',
    name: 'table_structure_dict.txt',
  },
];

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

for (const dir of new Set(FILES.map((f) => f.dir))) {
  await mkdir(dir, { recursive: true });
}

for (const { dir, url, name } of FILES) {
  const path = join(dir, name);
  if (await exists(path)) {
    console.log(`[skip] ${name} already present`);
    continue;
  }
  console.log(`[fetch] ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  console.log(`[done] ${name} (${buf.length.toLocaleString()} bytes)`);
}
