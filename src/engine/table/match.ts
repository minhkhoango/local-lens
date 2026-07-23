// Matches OCR text lines into SLANet structure cells and assembles an HTML
// <table>. SLANet emits the inner structure tokens (<thead>/<tbody>/<tr>/<td>…)
// plus one bbox per cell token; we assign each OCR line to the cell whose box
// best contains it, then splice the per-cell text back into the token stream.

export interface OcrLine {
  text: string;
  /** [x1, y1, x2, y2] in table-crop pixel coordinates. */
  box: [number, number, number, number];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function intersectionOverUnion(
  a: readonly number[],
  b: readonly number[],
): number {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

function contains(cell: readonly number[], cx: number, cy: number): boolean {
  return cx >= cell[0] && cx <= cell[2] && cy >= cell[1] && cy <= cell[3];
}

/**
 * Assign each OCR line to its cell, then join per-cell text in reading order.
 * A line lands in the cell that contains its center; failing that, the cell
 * with the largest IoU. A line that matches no cell by either signal (SLANet's
 * boxes can sit slightly off the text) is snapped to the NEAREST cell by
 * center-to-center distance rather than dropped — text is only ever lost when
 * there are literally no cells.
 */
function assignLinesToCells(
  cellBoxes: number[][],
  ocrLines: OcrLine[],
): string[] {
  const buckets: OcrLine[][] = cellBoxes.map(() => []);

  for (const line of ocrLines) {
    const [x1, y1, x2, y2] = line.box;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < cellBoxes.length; i++) {
      const cell = cellBoxes[i];
      // Containment is a strong signal; bias it above any IoU value.
      const score =
        (contains(cell, cx, cy) ? 1 : 0) +
        intersectionOverUnion(cell, line.box);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }

    // No containment and no overlap with any cell: assign to the nearest cell
    // by center distance so the text survives (only impossible when cellless).
    if (best === -1 && cellBoxes.length > 0) {
      let bestDist = Infinity;
      for (let i = 0; i < cellBoxes.length; i++) {
        const cell = cellBoxes[i];
        const ccx = (cell[0] + cell[2]) / 2;
        const ccy = (cell[1] + cell[3]) / 2;
        const dist = (cx - ccx) ** 2 + (cy - ccy) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
    }

    if (best !== -1) buckets[best].push(line);
  }

  return buckets.map((lines) => {
    lines.sort((a, b) => {
      const ay = (a.box[1] + a.box[3]) / 2;
      const by = (b.box[1] + b.box[3]) / 2;
      // Same row (overlapping vertically): order left-to-right.
      if (
        Math.abs(ay - by) <=
        Math.min(a.box[3] - a.box[1], b.box[3] - b.box[1]) / 2
      ) {
        return a.box[0] - b.box[0];
      }
      return ay - by;
    });
    return lines
      .map((l) => l.text.trim())
      .filter(Boolean)
      .join(' ');
  });
}

/**
 * Build an HTML <table> from SLANet structure tokens, cell boxes, and OCR lines.
 * Cell tokens come in three forms: the merged '<td></td>', a plain open '<td>',
 * or an attributed open '<td' followed by ' colspan=…'/'rowspan=…' tokens and a
 * closing '>'. Each form bears exactly one cell box (and thus one cell text),
 * keeping the cell pointer aligned with cellBoxes.
 */
export function buildTableHtml(
  structureTokens: string[],
  cellBoxes: number[][],
  ocrLines: OcrLine[],
): string {
  const cellText = assignLinesToCells(cellBoxes, ocrLines);

  const parts: string[] = ['<table>'];
  let ptr = 0;
  for (let i = 0; i < structureTokens.length; ) {
    const tok = structureTokens[i];

    if (tok === '<td></td>') {
      parts.push(`<td>${escapeHtml(cellText[ptr++] ?? '')}</td>`);
      i++;
    } else if (tok === '<td>') {
      parts.push(`<td>${escapeHtml(cellText[ptr++] ?? '')}`);
      i++;
    } else if (tok === '<td') {
      // Gather the attributed open tag: '<td' ' colspan="2"' … '>'
      let open = '<td';
      i++;
      while (i < structureTokens.length && structureTokens[i] !== '>') {
        open += structureTokens[i];
        i++;
      }
      if (i < structureTokens.length) {
        open += '>';
        i++; // consume '>'
      }
      parts.push(`${open}${escapeHtml(cellText[ptr++] ?? '')}`);
    } else {
      // <thead>, <tbody>, <tr>, </tr>, </td>, </thead>, </tbody>, etc.
      parts.push(tok);
      i++;
    }
  }
  parts.push('</table>');
  return parts.join('');
}
