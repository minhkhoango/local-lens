import { describe, it, expect } from 'vitest';
import { buildStructureDict } from '@/engine/table/dict';

// A trimmed fixture mirroring ppocr table_structure_dict.txt (note the
// significant leading space on attribute tokens, and the standalone <td> that
// merge_no_span_structure should remove).
const RAW = [
  '<thead>',
  '<tr>',
  '<td>',
  '</td>',
  '</tr>',
  '</thead>',
  '<tbody>',
  '</tbody>',
  '<td',
  ' colspan="2"',
  '>',
  ' rowspan="2"',
].join('\n');

describe('buildStructureDict', () => {
  it('wraps the vocabulary with sos/eos special tokens', () => {
    const d = buildStructureDict(RAW);
    expect(d.list[d.startIdx]).toBe('sos');
    expect(d.list[d.endIdx]).toBe('eos');
    expect(d.startIdx).toBe(0);
    expect(d.endIdx).toBe(d.list.length - 1);
    expect(d.ignoredIdxSet.has(d.startIdx)).toBe(true);
    expect(d.ignoredIdxSet.has(d.endIdx)).toBe(true);
  });

  it('merges no-span cells: adds <td></td> and drops standalone <td>', () => {
    const d = buildStructureDict(RAW);
    expect(d.charToIdx.has('<td></td>')).toBe(true);
    expect(d.charToIdx.has('<td>')).toBe(false);
  });

  it('marks cell-bearing tokens (<td, <td></td>) in tdIdxSet', () => {
    const d = buildStructureDict(RAW);
    expect(d.tdIdxSet.has(d.charToIdx.get('<td></td>')!)).toBe(true);
    expect(d.tdIdxSet.has(d.charToIdx.get('<td')!)).toBe(true);
  });

  it('preserves the leading space on attribute tokens', () => {
    const d = buildStructureDict(RAW);
    expect(d.charToIdx.has(' colspan="2"')).toBe(true);
    expect(d.charToIdx.has(' rowspan="2"')).toBe(true);
  });
});
