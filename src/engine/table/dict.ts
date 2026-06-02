// Parses the PaddleOCR table-structure vocabulary (table_structure_dict.txt)
// into the runtime form SLANet's greedy decoder needs. Mirrors PaddleOCR's
// TableLabelDecode.__init__ with merge_no_span_structure=true:
//   - read newline-separated tokens
//   - ensure the merged '<td></td>' token exists; drop the standalone '<td>'
//     (SLANet_plus is trained on the merged no-span cell token)
//   - wrap with special start ('sos', index 0) and end ('eos', last index) tokens
// The raw dict ships neither '<table>' nor '<td></td>'; the decoder/HTML builder
// add those. See ppocr/postprocess/table_postprocess.py (release/2.7).

const START_TOKEN = 'sos';
const END_TOKEN = 'eos';
const MERGED_TD = '<td></td>';

/** Tokens that carry a cell bounding box in the model's loc output. */
const TD_TOKENS = ['<td>', '<td', MERGED_TD];

export interface StructureDict {
  /** Token string by vocabulary index (includes sos/eos). */
  list: string[];
  /** token -> index */
  charToIdx: Map<string, number>;
  /** Index of the start token ('sos'). */
  startIdx: number;
  /** Index of the end token ('eos'). */
  endIdx: number;
  /** Indices to skip while decoding (start + end). */
  ignoredIdxSet: Set<number>;
  /** Indices whose token bears a cell bbox ('<td>', '<td', '<td></td>'). */
  tdIdxSet: Set<number>;
}

/**
 * Build the runtime structure dictionary from the raw dict file text.
 * @param rawDictText newline-separated token list (table_structure_dict.txt)
 */
export function buildStructureDict(rawDictText: string): StructureDict {
  // Strip trailing CR but keep leading spaces — attribute tokens such as
  // ' colspan="2"' start with a significant space.
  const tokens = rawDictText
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.length > 0);

  if (!tokens.includes(MERGED_TD)) {
    tokens.push(MERGED_TD);
  }
  const plainTd = tokens.indexOf('<td>');
  if (plainTd !== -1) {
    tokens.splice(plainTd, 1);
  }

  const list = [START_TOKEN, ...tokens, END_TOKEN];

  const charToIdx = new Map<string, number>();
  list.forEach((token, idx) => charToIdx.set(token, idx));

  const startIdx = 0;
  const endIdx = list.length - 1;

  const tdIdxSet = new Set<number>();
  for (const td of TD_TOKENS) {
    const idx = charToIdx.get(td);
    if (idx !== undefined) tdIdxSet.add(idx);
  }

  return {
    list,
    charToIdx,
    startIdx,
    endIdx,
    ignoredIdxSet: new Set([startIdx, endIdx]),
    tdIdxSet,
  };
}
