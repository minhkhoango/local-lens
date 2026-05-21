import { describe, it, expect } from 'vitest';
import { doclingToHtml } from '@/engine/parser/html';

describe('doclingToHtml', () => {
  it('wraps plain text in escaped output', () => {
    const html = doclingToHtml('<text>hello & world</text>');
    expect(html).toBe('<p>hello &amp; world</p>');
  });

  it('maps paragraph and title tags', () => {
    expect(doclingToHtml('<paragraph>p</paragraph>')).toBe('<p>p</p>');
    expect(doclingToHtml('<title>t</title>')).toBe('<h1>t</h1>');
  });

  it('maps section_header_level_* to <h{n+2}> (capped at 6)', () => {
    expect(doclingToHtml('<section_header_level_1>A</section_header_level_1>')).toBe(
      '<h3>A</h3>',
    );
    expect(doclingToHtml('<section_header_level_3>C</section_header_level_3>')).toBe(
      '<h5>C</h5>',
    );
    expect(doclingToHtml('<section_header_level_5>E</section_header_level_5>')).toBe(
      '<h6>E</h6>',
    );
  });

  it('drops picture tags', () => {
    expect(doclingToHtml('<picture>anything inside</picture>')).toBe('');
  });

  it('handles checkbox self-closing tags', () => {
    const html = doclingToHtml('<checkbox_selected><checkbox_unselected>');
    expect(html).toContain('<input type="checkbox" checked disabled>');
    expect(html).toContain('<input type="checkbox" disabled>');
  });

  it('emits page-break for <page_break>', () => {
    expect(doclingToHtml('<page_break>')).toBe('<hr class="page-break">');
  });

  it('strips <loc_*> metadata tokens', () => {
    const html = doclingToHtml('<text><loc_12>abc<loc_34></text>');
    expect(html).toBe('<p>abc</p>');
  });

  it('escapes unknown tags', () => {
    const html = doclingToHtml('<foobar>x</foobar>');
    expect(html).toBe('&lt;foobar&gt;x&lt;/foobar&gt;');
  });

  it('handles inline <code> with language hint', () => {
    const html = doclingToHtml(
      '<inline><code><_python_>print(1)</code></inline>',
    );
    expect(html).toContain('<code class="language-py">');
    expect(html).toContain('print(1)');
  });

  it('handles block <code> with language hint', () => {
    const html = doclingToHtml('<code><_javascript_>const x = 1;</code>');
    expect(html).toBe('<pre><code class="language-js">const x = 1;</code></pre>');
  });

  it('handles inline <formula>', () => {
    const html = doclingToHtml('<inline><formula>E=mc^2</formula></inline>');
    expect(html).toContain('<span class="formula">E=mc^2</span>');
  });

  it('renders <otsl> tables with headers and cells', () => {
    const docling =
      '<otsl><ched>A<ched>B<nl><fcel>1<fcel>2<nl></otsl>';
    const html = doclingToHtml(docling);
    expect(html).toContain('<table><tbody>');
    expect(html).toContain('<tr><th>A</th><th>B</th></tr>');
    expect(html).toContain('<tr><td>1</td><td>2</td></tr>');
  });

  it('handles colspan via <lcel>', () => {
    const docling = '<otsl><fcel>X<lcel>Y<nl></otsl>';
    const html = doclingToHtml(docling);
    expect(html).toContain('colspan="2"');
  });

  it('handles rowspan via <ucel>', () => {
    const docling =
      '<otsl><fcel>A<fcel>B<nl><ucel><fcel>C<nl></otsl>';
    const html = doclingToHtml(docling);
    expect(html).toContain('rowspan="2"');
  });

  it('sets row-scoped <th> for <rhed>', () => {
    const docling = '<otsl><rhed>row<fcel>val<nl></otsl>';
    const html = doclingToHtml(docling);
    expect(html).toContain('<th scope="row">row</th>');
  });

  it('cleanupMetadataTokens strips <loc_NN> sequences', () => {
    const html = doclingToHtml('<text>a<loc_1><loc_22><loc_333>b</text>');
    expect(html).toBe('<p>ab</p>');
  });
});
