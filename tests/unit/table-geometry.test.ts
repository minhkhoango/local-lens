import { describe, it, expect } from 'vitest';
import { geometricTableHtml } from '@/engine/table/geometry';
import type { OcrLine } from '@/engine/table/match';

/** Parse a reconstructed <table> into a grid of trimmed cell texts. */
function parseGrid(html: string): (string | undefined)[][] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('td, th')].map((td) => td.textContent?.trim()),
  );
}

/**
 * Build word-level OcrLines for a grid, mimicking what the OCR detector emits
 * for a BORDERLESS table: one box per cell, columns aligned by left edge, rows
 * aligned by vertical center. `cells[r][c]` may be '' for an empty cell.
 */
function gridLines(
  cells: string[][],
  colX: number[],
  rowY: number[],
  h = 20,
): OcrLine[] {
  const lines: OcrLine[] = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const text = cells[r][c];
      if (!text) continue;
      const x1 = colX[c];
      const y1 = rowY[r];
      lines.push({ text, box: [x1, y1, x1 + 8 * text.length, y1 + h] });
    }
  }
  return lines;
}

describe('geometricTableHtml', () => {
  it('reconstructs a 3x3 borderless grid (header + 2 data rows)', () => {
    const cells = [
      ['Name', 'Age', 'City'],
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'LA'],
    ];
    // Well-separated columns (gaps >> line height) and rows.
    const lines = gridLines(cells, [10, 150, 300], [10, 50, 90]);

    const html = geometricTableHtml(lines);
    expect(html).not.toBeNull();
    expect(parseGrid(html as string)).toEqual(cells);
  });

  it('reconstructs a borderless 4x2 zebra-style table', () => {
    const cells = [
      ['Item', 'Price'],
      ['Coffee', '$4.50'],
      ['Tea', '$3.00'],
      ['Cake', '$6.25'],
    ];
    const lines = gridLines(cells, [20, 200], [10, 40, 70, 100], 18);

    const html = geometricTableHtml(lines);
    expect(html).not.toBeNull();
    expect(parseGrid(html as string)).toEqual(cells);
  });

  it('drops no OCR text — every input token appears in the output', () => {
    const cells = [
      ['Region', 'Sales', 'Growth'],
      ['North', '1200', '12%'],
      ['South', '980', '8%'],
      ['West', '1500', '19%'],
    ];
    const lines = gridLines(cells, [10, 180, 340], [10, 45, 80, 115]);

    const html = geometricTableHtml(lines);
    expect(html).not.toBeNull();
    for (const line of lines) {
      expect(html as string).toContain(line.text);
    }
    // And the grid comes back exactly, cell for cell.
    expect(parseGrid(html as string)).toEqual(cells);
  });

  it('joins multiple lines that land in the same cell', () => {
    // Two stacked words in the top-left cell must be merged, not split.
    const lines: OcrLine[] = [
      { text: 'First', box: [10, 8, 60, 26] },
      { text: 'Name', box: [10, 28, 55, 46] },
      { text: 'Age', box: [200, 18, 235, 36] },
      { text: 'Alice', box: [10, 80, 60, 98] },
      { text: '30', box: [200, 80, 225, 98] },
    ];
    const html = geometricTableHtml(lines);
    expect(html).not.toBeNull();
    const grid = parseGrid(html as string);
    expect(grid[0][0]).toBe('First Name');
    expect(grid[0][1]).toBe('Age');
    expect(grid[1]).toEqual(['Alice', '30']);
  });

  it('HTML-escapes cell text', () => {
    const lines: OcrLine[] = [
      { text: '<b>a</b>', box: [10, 10, 90, 30] },
      { text: 'x', box: [200, 10, 215, 30] },
      { text: 'c', box: [10, 50, 25, 70] },
      { text: 'd', box: [200, 50, 215, 70] },
    ];
    const html = geometricTableHtml(lines);
    expect(html).not.toBeNull();
    expect(html as string).toContain('&lt;b&gt;a&lt;/b&gt;');
    expect(html as string).not.toContain('<b>');
  });

  it('returns null for prose (single column per row)', () => {
    const lines: OcrLine[] = [
      { text: 'The quick brown fox jumps over', box: [10, 10, 300, 30] },
      { text: 'the lazy dog and then it runs', box: [10, 40, 290, 60] },
      { text: 'away quickly into the deep woods', box: [10, 70, 305, 90] },
      { text: 'never to be seen again today', box: [10, 100, 295, 120] },
    ];
    expect(geometricTableHtml(lines)).toBeNull();
  });

  it('returns null when only a minority of rows span multiple columns', () => {
    // Column clustering finds two anchors (x~10 and x~300), but only the last
    // row actually spans both — the grid-regularity guard must reject this.
    const lines: OcrLine[] = [
      { text: 'Title', box: [10, 10, 80, 30] },
      { text: 'Some text here', box: [10, 40, 200, 60] },
      { text: 'More text follows', box: [10, 70, 220, 90] },
      { text: 'a', box: [10, 100, 25, 120] },
      { text: 'b', box: [300, 100, 320, 120] },
    ];
    expect(geometricTableHtml(lines)).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(geometricTableHtml([])).toBeNull();
  });

  it('returns null for a single row (not enough rows for a table)', () => {
    const lines: OcrLine[] = [
      { text: 'A', box: [10, 10, 40, 30] },
      { text: 'B', box: [150, 10, 180, 30] },
      { text: 'C', box: [300, 10, 330, 30] },
    ];
    expect(geometricTableHtml(lines)).toBeNull();
  });
});
