import { CONFIG } from './constants';
import type { Point } from '../types';

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

/**
 * Take in raw OCR text output and return width of whole floatingIsland
 * Width is calculated using longest 1 line between \n and island x4 12px pad
 * @param text Output trimmed text from offline ocr
 * @returns Floating Island's width
 */
export function calculateDynamicWidth(text: string): number {
  if (!text) return CONFIG.widthCollapsed;

  const chunks = text.split('\n').map((chunk) => chunk.trim());
  const longestChunk = chunks.reduce(
    (longest, current) => (current.length > longest.length ? current : longest),
    '',
  );

  if (!measurementCanvas) {
    measurementCanvas = document.createElement('canvas');
  }

  const ctx = measurementCanvas.getContext('2d');
  if (!ctx) return CONFIG.maxWidthExpanded;

  ctx.font = `${CONFIG.font.sizeSmall}px ${CONFIG.font.mono}`;

  try {
    const metrics = ctx.measureText(longestChunk);
    // 4x pad (dis between, border <12> textarea <12> text) + 1 backup
    const totalWidth = metrics.width + CONFIG.layoutPad * 5;

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
