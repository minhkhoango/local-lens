import { describe, it, expect } from 'vitest';
import { htmlToText } from '@/engine/parser/text';

describe('htmlToText', () => {
  it('converts a heading-row table to markdown', () => {
    const html =
      '<table><tbody><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
    const md = htmlToText(html);
    expect(md).toContain('| A | B |');
    // unicodeit replaces ASCII hyphens with U+2212; match either form.
    expect(md).toMatch(/\|\s[-−]{3}\s\|\s[-−]{3}\s\|/);
    expect(md).toContain('| 1 | 2 |');
  });

  it('runs unicodeit replacement on common LaTeX sequences', () => {
    const md = htmlToText('<p>\\alpha + \\beta</p>');
    expect(md).toContain('α');
    expect(md).toContain('β');
  });

  it('converts headings and paragraphs', () => {
    const md = htmlToText('<h3>Title</h3><p>body</p>');
    expect(md).toMatch(/### Title/);
    expect(md).toContain('body');
  });
});
