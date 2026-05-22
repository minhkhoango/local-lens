#!/usr/bin/env node
// Download PP-OCRv5 mobile (English) model + dict into public/paddle_engine/.
// Re-run is a no-op once files exist. Sources match ppu-paddle-ocr's DEFAULT_MODEL_URLS.

import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = join(__dirname, '..', 'public', 'paddle_engine');

const FILES = [
  {
    url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/detection/PP-OCRv5_mobile_det_infer.ort',
    name: 'PP-OCRv5_mobile_det_infer.ort',
  },
  {
    url: 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort',
    name: 'en_PP-OCRv5_mobile_rec_infer.ort',
  },
  {
    url: 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/recognition/multi/en/v5/ppocrv5_en_dict.txt',
    name: 'ppocrv5_en_dict.txt',
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

await mkdir(TARGET_DIR, { recursive: true });

for (const { url, name } of FILES) {
  const path = join(TARGET_DIR, name);
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
