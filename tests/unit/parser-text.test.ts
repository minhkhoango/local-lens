import { describe, it, expect } from 'vitest';
import { htmlToText } from '@/engine/parser/text';

describe('htmlToText', () => {
  it('converts headings and paragraphs to markdown', () => {
    const md = htmlToText('<h1>Title</h1><p>body</p>');
    expect(md).toContain('Title');
    expect(md).toContain('body');
    // Turndown's default uses Setext-style underline for h1.
    expect(md).toMatch(/Title\n=+/);
  });

  it('converts unordered lists', () => {
    const md = htmlToText('<ul><li>one</li><li>two</li></ul>');
    expect(md).toMatch(/[-*]\s+one/);
    expect(md).toMatch(/[-*]\s+two/);
  });

  it('preserves preformatted blocks', () => {
    const md = htmlToText('<pre class="formula">E = mc^2</pre>');
    expect(md).toContain('E = mc^2');
  });
});
