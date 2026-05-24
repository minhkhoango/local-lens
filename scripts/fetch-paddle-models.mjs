#!/usr/bin/env node
// Download model weights for the bundled engines.
//   - PP-OCRv5 mobile (English) det + int8 rec + dict -> public/paddle_engine/
//   - PP-DocLayoutV3 (layout analysis)                 -> public/structured_engine/
// Re-run is a no-op once files exist.
//
// Pass `--include-fp32-rec` to additionally fetch the fp32 recognition model
// used only by tests/bench/* for the int8-vs-fp32 comparison.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PADDLE_DIR = join(__dirname, '..', 'public', 'paddle_engine');
const STRUCTURED_DIR = join(__dirname, '..', 'public', 'structured_engine');

const BASE_FILES = [
  {
    dir: PADDLE_DIR,
    url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/detection/PP-OCRv5_mobile_det_infer.ort',
    name: 'PP-OCRv5_mobile_det_infer.ort',
  },
  {
    dir: PADDLE_DIR,
    url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer_int8.ort',
    name: 'en_PP-OCRv5_mobile_rec_infer_int8.ort',
  },
  {
    dir: PADDLE_DIR,
    url: 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/multi/en/v5/ppocrv5_en_dict.txt',
    name: 'ppocrv5_en_dict.txt',
  },
  {
    dir: STRUCTURED_DIR,
    url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/layout/PP-DocLayoutV3.onnx',
    name: 'PP-DocLayoutV3.onnx',
  },
];

const FP32_REC_FILE = {
  dir: PADDLE_DIR,
  url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort',
  name: 'en_PP-OCRv5_mobile_rec_infer.ort',
};

const includeFp32 = process.argv.includes('--include-fp32-rec');
const FILES = includeFp32 ? [...BASE_FILES, FP32_REC_FILE] : BASE_FILES;

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
