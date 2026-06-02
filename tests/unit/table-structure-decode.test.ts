import { describe, it, expect } from 'vitest';
import { buildStructureDict } from '@/engine/table/dict';
import { decodeStructure } from '@/engine/table/structure';

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

const dict = buildStructureDict(RAW);
const vocab = dict.list.length;

/** Build a one-hot structure-prob array from a sequence of token indices. */
function oneHot(seq: number[]): Float32Array {
  const probs = new Float32Array(seq.length * vocab);
  seq.forEach((idx, t) => {
    probs[t * vocab + idx] = 1;
  });
  return probs;
}

describe('decodeStructure', () => {
  it('decodes a 1x2 row, stops at eos, and scales cell boxes to crop px', () => {
    const tbody = dict.charToIdx.get('<tbody>')!;
    const tr = dict.charToIdx.get('<tr>')!;
    const td = dict.charToIdx.get('<td></td>')!;
    const trClose = dict.charToIdx.get('</tr>')!;
    const tbodyClose = dict.charToIdx.get('</tbody>')!;

    const seq = [tbody, tr, td, td, trClose, tbodyClose, dict.endIdx, tbody];
    const probs = oneHot(seq);

    // loc rows are normalized [0,1]; only the two td steps (t=2,3) are read.
    const loc = new Float32Array(seq.length * 4);
    loc.set([0, 0, 0.5, 0.5], 2 * 4); // -> [0,0,50,20] at 100x40
    loc.set([0.5, 0, 1.0, 0.5], 3 * 4); // -> [50,0,100,20]

    const res = decodeStructure(
      probs,
      seq.length,
      vocab,
      loc,
      4,
      dict,
      100,
      40,
    );

    expect(res.structureTokens).toEqual([
      '<tbody>',
      '<tr>',
      '<td></td>',
      '<td></td>',
      '</tr>',
      '</tbody>',
    ]);
    expect(res.cellBoxes).toEqual([
      [0, 0, 50, 20],
      [50, 0, 100, 20],
    ]);
    expect(res.confidence).toBeCloseTo(1);
  });

  it('skips special (sos/eos) tokens mid-stream', () => {
    const tr = dict.charToIdx.get('<tr>')!;
    const td = dict.charToIdx.get('<td></td>')!;
    const trClose = dict.charToIdx.get('</tr>')!;

    const seq = [tr, dict.startIdx, td, trClose];
    const probs = oneHot(seq);
    const loc = new Float32Array(seq.length * 4);

    const res = decodeStructure(probs, seq.length, vocab, loc, 4, dict, 10, 10);
    expect(res.structureTokens).toEqual(['<tr>', '<td></td>', '</tr>']);
    expect(res.cellBoxes).toHaveLength(1);
  });
});
