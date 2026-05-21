import { describe, it, expect } from 'vitest';
import { DoclingConverter } from '@/engine/parser/html';

describe('DoclingConverter.convertTable', () => {
  const make = () => new DoclingConverter();

  it('renders simple header + body rows', () => {
    const c = make();
    const html = c.convertTable('<ched>H1<ched>H2<nl><fcel>a<fcel>b<nl>');
    expect(html).toBe(
      '<table><tbody><tr><th>H1</th><th>H2</th></tr><tr><td>a</td><td>b</td></tr></tbody></table>',
    );
  });

  it('expands <lcel> as colspan++ on the previous cell', () => {
    const c = make();
    const html = c.convertTable('<fcel>X<lcel>Y<lcel>Z<nl>');
    expect(html).toContain('<td colspan="3">X</td>');
    expect(html).not.toContain('Y</td>');
  });

  it('expands <xcel> as colspan++ on the previous cell', () => {
    const c = make();
    const html = c.convertTable('<fcel>X<xcel>Y<nl>');
    expect(html).toContain('<td colspan="2">X</td>');
  });

  it('expands <ucel> as rowspan++ on the cell directly above', () => {
    const c = make();
    const html = c.convertTable('<fcel>A<fcel>B<nl><ucel><fcel>C<nl>');
    expect(html).toContain('rowspan="2"');
    expect(html).toContain('<td>C</td>');
  });

  it('applies scope="row" for <rhed>', () => {
    const c = make();
    const html = c.convertTable('<rhed>Total<fcel>100<nl>');
    expect(html).toContain('<th scope="row">Total</th>');
  });

  it('applies scope="row" for <srow>', () => {
    const c = make();
    const html = c.convertTable('<srow>Sub<fcel>v<nl>');
    expect(html).toContain('<th scope="row">Sub</th>');
  });

  it('emits empty td for <ecel>', () => {
    const c = make();
    const html = c.convertTable('<fcel>a<ecel><nl>');
    expect(html).toContain('<td></td>');
  });
});
