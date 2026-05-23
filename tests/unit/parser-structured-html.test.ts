import { describe, it, expect } from 'vitest';
import { composeStructuredHtml } from '@/engine/parser/structured-html';

describe('composeStructuredHtml', () => {
  it('maps doc_title to h1 and text to p', () => {
    const html = composeStructuredHtml([
      { label: 'doc_title', text: 'My Document' },
      { label: 'text', text: 'Some body text.' },
    ]);
    expect(html).toContain('<h1>My Document</h1>');
    expect(html).toContain('<p>Some body text.</p>');
  });

  it('collapses consecutive number regions into a single <ul>', () => {
    const html = composeStructuredHtml([
      { label: 'number', text: 'first' },
      { label: 'number', text: 'second' },
      { label: 'text', text: 'after' },
    ]);
    expect(html).toMatch(
      /<ul>\s*<li>first<\/li>\s*<li>second<\/li>\s*<\/ul>/,
    );
    expect(html).toContain('<p>after</p>');
  });

  it('skips non-text regions', () => {
    const html = composeStructuredHtml([
      { label: 'image', text: 'should not appear' },
      { label: 'seal', text: 'nope' },
      { label: 'text', text: 'visible' },
    ]);
    expect(html).not.toContain('should not appear');
    expect(html).not.toContain('nope');
    expect(html).toContain('<p>visible</p>');
  });

  it('escapes HTML in OCR text', () => {
    const html = composeStructuredHtml([
      { label: 'text', text: '<script>alert("x")</script>' },
    ]);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('skips empty text regions', () => {
    const html = composeStructuredHtml([
      { label: 'text', text: '   ' },
      { label: 'paragraph_title', text: 'Section' },
    ]);
    expect(html).toBe('<h2>Section</h2>');
  });
});
