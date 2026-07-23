import { describe, it, expect } from 'vitest';
import { buildTableHtml, type OcrLine } from '@/engine/table/match';

describe('buildTableHtml', () => {
  it('fills a 2x2 grid by matching OCR lines to cell centers', () => {
    // Cells laid out as a 2x2 grid in crop pixels.
    const cellBoxes = [
      [0, 0, 50, 20], // top-left
      [50, 0, 100, 20], // top-right
      [0, 20, 50, 40], // bottom-left
      [50, 20, 100, 40], // bottom-right
    ];
    const tokens = [
      '<tbody>',
      '<tr>',
      '<td></td>',
      '<td></td>',
      '</tr>',
      '<tr>',
      '<td></td>',
      '<td></td>',
      '</tr>',
      '</tbody>',
    ];
    const lines: OcrLine[] = [
      { text: 'A', box: [5, 5, 20, 15] },
      { text: 'B', box: [55, 5, 70, 15] },
      { text: 'C', box: [5, 25, 20, 35] },
      { text: 'D', box: [55, 25, 70, 35] },
    ];

    const html = buildTableHtml(tokens, cellBoxes, lines);
    expect(html).toBe(
      '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>C</td><td>D</td></tr></tbody></table>',
    );
  });

  it('passes colspan attribute tokens through and injects text into the cell', () => {
    const cellBoxes = [[0, 0, 100, 20]];
    const tokens = ['<tr>', '<td', ' colspan="2"', '>', '</td>', '</tr>'];
    const lines: OcrLine[] = [{ text: 'Wide', box: [10, 5, 40, 15] }];

    const html = buildTableHtml(tokens, cellBoxes, lines);
    expect(html).toBe('<table><tr><td colspan="2">Wide</td></tr></table>');
  });

  it('escapes HTML in cell text', () => {
    const html = buildTableHtml(
      ['<tr>', '<td></td>', '</tr>'],
      [[0, 0, 50, 20]],
      [{ text: '<b>x</b>', box: [5, 5, 20, 15] }],
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('emits empty cells when no OCR line matches', () => {
    const html = buildTableHtml(
      ['<tr>', '<td></td>', '<td></td>', '</tr>'],
      [
        [0, 0, 50, 20],
        [50, 0, 100, 20],
      ],
      [{ text: 'only', box: [5, 5, 20, 15] }],
    );
    expect(html).toBe('<table><tr><td>only</td><td></td></tr></table>');
  });

  it('snaps a line outside every cell to the nearest cell instead of dropping it', () => {
    // 'X' sits well below both cells (no containment, zero IoU), but its center
    // is nearer the right cell's center, so it must land in the right cell.
    const html = buildTableHtml(
      ['<tr>', '<td></td>', '<td></td>', '</tr>'],
      [
        [0, 0, 50, 20], // top-left
        [50, 0, 100, 20], // top-right
      ],
      [{ text: 'X', box: [60, 100, 80, 120] }],
    );
    // Text is preserved (not dropped) and placed in the nearest (right) cell.
    expect(html).toBe('<table><tr><td></td><td>X</td></tr></table>');
    expect(html).toContain('X');
  });
});
