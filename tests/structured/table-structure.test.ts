import { describe, it, expect, beforeAll } from 'vitest';
import * as ort from 'onnxruntime-web';
import { installChromeShim } from '../setup/chrome-shim';

installChromeShim();

import { TableStructureService } from '@/engine/table/structure';

const TD_TOKENS = new Set(['<td></td>', '<td>', '<td']);

/** Draw a clean ruled grid (the easy case for SLANet) onto an OffscreenCanvas. */
function drawTable(): OffscreenCanvas {
  const cols = 3;
  const rows = 3;
  const cw = 120;
  const ch = 48;
  const canvas = new OffscreenCanvas(cols * cw, rows * ch);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, canvas.height);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * ch);
    ctx.lineTo(canvas.width, r * ch);
    ctx.stroke();
  }

  const cells = [
    ['Name', 'Age', 'City'],
    ['Alice', '30', 'NYC'],
    ['Bob', '25', 'LA'],
  ];
  ctx.fillStyle = '#000000';
  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillText(cells[r][c], c * cw + 12, r * ch + ch / 2);
    }
  }
  return canvas;
}

describe('TableStructureService (real SLANet_plus ONNX, headless Chromium)', () => {
  let service: TableStructureService;

  beforeAll(async () => {
    // ORT needs to locate its WASM runtime; the structured test config serves
    // it from /paddle_engine/ (same as the other engines configure).
    ort.env.wasm.wasmPaths = chrome.runtime.getURL('paddle_engine/');
    service = new TableStructureService(
      {
        model: chrome.runtime.getURL('structured_engine/SLANet_plus.onnx'),
        dictionary: chrome.runtime.getURL(
          'structured_engine/table_structure_dict.txt',
        ),
      },
      { executionProviders: ['wasm'] },
    );
    // initialize() also asserts the model's structure vocab == dict size, so a
    // mismatch between the bundled model and dict fails loudly here.
    await service.initialize();
  }, 300_000);

  it('recognizes structure tokens and one box per cell token', async () => {
    const result = await service.recognize(drawTable());

    expect(Array.isArray(result.structureTokens)).toBe(true);
    expect(result.structureTokens.length).toBeGreaterThan(0);

    // Decode invariant: every td-bearing token yields exactly one cell box.
    const tdCount = result.structureTokens.filter((t) =>
      TD_TOKENS.has(t),
    ).length;
    expect(result.cellBoxes.length).toBe(tdCount);

    // A ruled grid should be recognized as a table with cells.
    expect(tdCount).toBeGreaterThan(0);

    // Confidence is a real probability.
    expect(Number.isFinite(result.confidence)).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  }, 300_000);

  it('returns cell boxes within the crop bounds', async () => {
    const canvas = drawTable();
    const result = await service.recognize(canvas);

    const padX = canvas.width * 0.1;
    const padY = canvas.height * 0.1;
    for (const box of result.cellBoxes) {
      expect(box).toHaveLength(4);
      const [x1, y1, x2, y2] = box;
      for (const v of box) expect(Number.isFinite(v)).toBe(true);
      // Boxes map back into (roughly) the original crop, not the 488 canvas.
      expect(x1).toBeGreaterThanOrEqual(-padX);
      expect(y1).toBeGreaterThanOrEqual(-padY);
      expect(x2).toBeLessThanOrEqual(canvas.width + padX);
      expect(y2).toBeLessThanOrEqual(canvas.height + padY);
    }
  }, 300_000);
});
