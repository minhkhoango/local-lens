import { CONFIG } from './constants';
import type { EngineOption, Point } from '../types';

/**
 * Wrapper for querySelector with error handling
 * @param root Overarching parent, usually this.container
 * @param selector Class name of private els
 * @returns Single HTMLElement
 */
export function query<T extends HTMLElement>(
  root: HTMLDivElement,
  selector: string,
): T {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el as T;
}

/**
 * Wrapper for querySelectorAll with error handling
 * @param root Overarching parent, usually this.container
 * @param selector Class name, for the auto toggles
 * @returns NodeListOf toggles (HTMLDivElement)
 */
export function queryAll<T extends NodeListOf<HTMLElement>>(
  root: HTMLDivElement,
  selector: string,
): T {
  const el = root.querySelectorAll(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el as T;
}

let measurementCanvas: HTMLCanvasElement | null = null;

function getTesseractMaxWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
): number {
  const brChunks = text.split('<br>').map((chunk) => chunk.trim());
  const longestChunk = brChunks.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    '',
  );
  return ctx.measureText(longestChunk).width;
}

const TABLE_CELL_H_PAD = 20;
const TABLE_CELL_BORDER = 1;
const TABLE_BORDER = 1;
const PRE_H_PAD = 22;
const PRE_BORDER = 2;
const PRE_TAB_SIZE = 4;

function getStructuredMaxWidth(
  ctx: CanvasRenderingContext2D,
  html: string,
): number {
  const div = document.createElement('div');
  div.innerHTML = html;

  let maxWidth = 0;

  const blockEls = div.querySelectorAll(
    'p, h3, li, figcaption, blockquote, dt, dd',
  );
  blockEls.forEach((el) => {
    const width = ctx.measureText(el.textContent || '').width;
    if (width > maxWidth) maxWidth = width;
  });

  // Table rows
  const rows = div.querySelectorAll('tr');
  rows.forEach((row) => {
    const cells = row.querySelectorAll('th, td');
    const cellCount = cells.length;
    let rowWidth = 0;
    cells.forEach((cell) => {
      rowWidth +=
        ctx.measureText(cell.textContent || '').width + TABLE_CELL_H_PAD;
    });
    rowWidth +=
      Math.max(0, cellCount - 1) * TABLE_CELL_BORDER + TABLE_BORDER * 2;
    if (rowWidth > maxWidth) maxWidth = rowWidth;
  });

  // Code blocks
  const tabSpaces = ' '.repeat(PRE_TAB_SIZE);
  const codeEls = div.querySelectorAll('pre > code');
  codeEls.forEach((el) => {
    const text = el.textContent || '';
    text.split('\n').forEach((line) => {
      const expanded = line.replace(/\t/g, tabSpaces);
      const width = ctx.measureText(expanded).width + PRE_H_PAD + PRE_BORDER;
      if (width > maxWidth) maxWidth = width;
    });
  });

  return maxWidth;
}

/**
 * Take in raw OCR text output and return width of whole floatingIsland
 * Width is calculated using longest 1 line between \n and island x4 12px pad
 * @param text Output trimmed text from offline ocr
 * @returns Floating Island's width
 */
export function calculateDynamicWidth(
  engine: EngineOption,
  text: string,
): number {
  if (!text) return CONFIG.widthCollapsed;

  if (!measurementCanvas) {
    measurementCanvas = document.createElement('canvas');
  }

  const ctx = measurementCanvas.getContext('2d');
  if (!ctx) return CONFIG.maxWidthExpanded;

  ctx.font = `${CONFIG.font.sizeSmall}px ${CONFIG.font.mono}`;

  try {
    let contentWidth: number;
    if (engine === 'structured') {
      contentWidth = getStructuredMaxWidth(ctx, text);
    } else {
      contentWidth = getTesseractMaxWidth(ctx, text);
    }

    // 4x pad (dis between, border <12> textarea <12> text) + 1 backup
    const totalWidth = contentWidth + CONFIG.layoutPad * 5;

    const dynamicWidth = Math.max(
      CONFIG.widthCollapsed,
      Math.min(totalWidth, CONFIG.maxWidthExpanded),
    );
    console.debug('Dynamic width:', dynamicWidth);

    return dynamicWidth;
  } catch {
    return CONFIG.maxWidthExpanded;
  }
}

/**
 * Return updated Floating Island coordinate constrained to viewport with 2px pad.
 * @param pos Top left coordinate of the island
 * @param width Current width of island
 * @param height Current height of island (including textarea + settings)
 * @returns Updated coordinate
 */
export function clampToViewport(
  pos: Point,
  width: number,
  height: number,
): Point {
  const pad = CONFIG.boundaryPad;
  const x = Math.min(Math.max(pad, pos.x), window.innerWidth - width - pad);
  const y = Math.min(Math.max(pad, pos.y), window.innerHeight - height - pad);
  return { x, y };
}
