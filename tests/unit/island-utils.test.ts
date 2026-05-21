import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installChromeShim } from '../setup/chrome-shim';

installChromeShim();

const utilsMod = await import('@/island/utils');
const { calculateDynamicWidth, clampToViewport } = utilsMod;
const { CONFIG } = await import('@/island/constants');

describe('clampToViewport', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  });

  it('clamps to top-left padding', () => {
    const p = clampToViewport({ x: -50, y: -10 }, 200, 100);
    expect(p).toEqual({ x: CONFIG.boundaryPad, y: CONFIG.boundaryPad });
  });

  it('clamps to bottom-right minus size and padding', () => {
    const p = clampToViewport({ x: 9999, y: 9999 }, 200, 100);
    expect(p.x).toBe(1000 - 200 - CONFIG.boundaryPad);
    expect(p.y).toBe(800 - 100 - CONFIG.boundaryPad);
  });

  it('leaves in-bounds positions alone', () => {
    const p = clampToViewport({ x: 100, y: 50 }, 200, 100);
    expect(p).toEqual({ x: 100, y: 50 });
  });
});

describe('calculateDynamicWidth', () => {
  beforeEach(() => {
    // Make measureText deterministic: width = char count.
    const proto = HTMLCanvasElement.prototype as any;
    const orig = proto.getContext;
    proto.getContext = function (kind: string) {
      if (kind !== '2d') return orig.call(this, kind);
      return {
        font: '',
        measureText(s: string) {
          return { width: s.length };
        },
      } as unknown as CanvasRenderingContext2D;
    };
  });

  it('returns widthCollapsed for empty text', () => {
    expect(calculateDynamicWidth('tesseract', '')).toBe(CONFIG.widthCollapsed);
  });

  it('tesseract path picks the longest <br>-separated chunk', () => {
    const text = 'short<br>this is the longest line<br>mid';
    const w = calculateDynamicWidth('tesseract', text);
    // contentWidth = 'this is the longest line'.length = 24
    const expected = Math.min(
      CONFIG.maxWidthExpanded,
      Math.max(CONFIG.widthCollapsed, 24 + CONFIG.layoutPad * 5),
    );
    expect(w).toBe(expected);
  });

  it('tesseract path caps at maxWidthExpanded', () => {
    const longLine = 'x'.repeat(2000);
    const w = calculateDynamicWidth('tesseract', longLine);
    expect(w).toBe(CONFIG.maxWidthExpanded);
  });

  it('granite path measures block-level elements (<p>, <h3>, <li>)', () => {
    const html = '<p>short</p><h3>this is a longer heading line</h3>';
    const w = calculateDynamicWidth('granite', html);
    // longest textContent is "this is a longer heading line".length = 29
    const expected = Math.min(
      CONFIG.maxWidthExpanded,
      Math.max(CONFIG.widthCollapsed, 29 + CONFIG.layoutPad * 5),
    );
    expect(w).toBe(expected);
  });

  it('granite path measures pre>code line-by-line and applies padding', () => {
    const html = '<pre><code>a\nbbbbbbbbbb</code></pre>';
    const w = calculateDynamicWidth('granite', html);
    // longest line length = 10, plus PRE_H_PAD(22) + PRE_BORDER(2) = 34
    const expected = Math.min(
      CONFIG.maxWidthExpanded,
      Math.max(CONFIG.widthCollapsed, 34 + CONFIG.layoutPad * 5),
    );
    expect(w).toBe(expected);
  });

  it('granite path measures table rows with cell padding', () => {
    const html =
      '<table><tbody><tr><th>aaa</th><th>bbbb</th></tr></tbody></table>';
    const w = calculateDynamicWidth('granite', html);
    // rowWidth = 3 + 20 + 4 + 20 + 1 + 2 = 50
    const expected = Math.min(
      CONFIG.maxWidthExpanded,
      Math.max(CONFIG.widthCollapsed, 50 + CONFIG.layoutPad * 5),
    );
    expect(w).toBe(expected);
  });
});
