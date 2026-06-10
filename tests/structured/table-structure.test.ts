import { describe, it, expect, beforeAll } from 'vitest';
import * as ort from 'onnxruntime-web';
import { installChromeShim } from '../setup/chrome-shim';

installChromeShim();

import { TableStructureService } from '@/engine/table/structure';
import { buildTableHtml, type OcrLine } from '@/engine/table/match';

const TD_TOKENS = new Set(['<td></td>', '<td>', '<td']);

const CELLS = [
  ['Name', 'Age', 'City'],
  ['Alice', '30', 'NYC'],
  ['Bob', '25', 'LA'],
];

/**
 * Draw a clean ruled grid (the easy case for SLANet) onto an OffscreenCanvas.
 * Also returns the drawn text with its exact boxes, standing in for the OCR
 * lines the structured engine would feed to buildTableHtml.
 */
function drawTable(): { canvas: OffscreenCanvas; lines: OcrLine[] } {
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

  ctx.fillStyle = '#000000';
  ctx.font = '20px sans-serif';
  ctx.textBaseline = 'middle';
  const lines: OcrLine[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const text = CELLS[r][c];
      const x = c * cw + 12;
      const y = r * ch + ch / 2;
      ctx.fillText(text, x, y);
      const w = ctx.measureText(text).width;
      lines.push({ text, box: [x, y - 10, x + w, y + 10] });
    }
  }
  return { canvas, lines };
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
    await service.initialize();
  }, 300_000);

  it('recognizes structure tokens and one box per cell token', async () => {
    // recognize() resolves the structure output by matching its last dim to
    // the dict size, so a bundled model/dict vocab mismatch fails loudly here.
    const result = await service.recognize(drawTable().canvas);

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
    const { canvas } = drawTable();
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

  it('reconstructs a 3x3 HTML table with the text in the right cells', async () => {
    // End-to-end through the same path structured.ts uses: SLANet structure +
    // cell boxes, then buildTableHtml with the (here: ground-truth) OCR lines.
    // This validates the bbox scale convention — if cell boxes were scaled
    // wrong, the text would land in the wrong cells or be dropped entirely.
    const { canvas, lines } = drawTable();
    const struct = await service.recognize(canvas);
    const html = buildTableHtml(struct.structureTokens, struct.cellBoxes, lines);

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const grid = [...doc.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('td, th')].map((td) => td.textContent?.trim()),
    );

    expect(grid).toEqual(CELLS);
  }, 300_000);
});
