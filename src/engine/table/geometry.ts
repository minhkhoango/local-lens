// Deterministic, ONNX-free table reconstruction from OCR line boxes.
//
// SLANet_plus is trained on BORDERED document tables and does poorly on the
// borderless / zebra tables common in web-UI screenshots — and the layout
// model frequently mislabels those regions as plain `text`, so SLANet never
// even runs. This module reconstructs a real <table> purely from the geometry
// of the OCR line boxes (their x/y positions), which is exactly the signal a
// borderless table still carries: cells align into columns and rows.
//
// It is a pure function (no `ort`, no async), cheap enough to attempt on ANY
// region, and self-guarding: it returns null for content that isn't genuinely
// tabular (prose, single columns, irregular layouts) so the caller can fall
// back to plain text without a separate classifier.

import type { OcrLine } from './match';

/** HTML-escape cell text, matching the escaping used in match.ts. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 1-D gap clustering: given ASCENDING-sorted values, split into clusters
 * wherever consecutive values are farther apart than `gap`, and return each
 * cluster's mean. Used to turn the scattered left edges of all lines into a
 * small set of column anchors. O(n) over the pre-sorted input.
 */
function clusterCenters(sortedValues: number[], gap: number): number[] {
  const centers: number[] = [];
  if (sortedValues.length === 0) return centers;

  let sum = sortedValues[0];
  let count = 1;
  let prev = sortedValues[0];
  for (let i = 1; i < sortedValues.length; i++) {
    const v = sortedValues[i];
    if (v - prev > gap) {
      centers.push(sum / count);
      sum = 0;
      count = 0;
    }
    sum += v;
    count++;
    prev = v;
  }
  centers.push(sum / count);
  return centers;
}

/**
 * Reconstruct an HTML <table> from OCR line boxes alone, or return null when
 * the content is not convincingly tabular.
 *
 * Algorithm:
 *  1. ROWS — sort lines by vertical center and group greedily: a line joins the
 *     current row when its box vertically overlaps the row's y-range OR its
 *     center is within `ROW_TOL_FRAC` × medianHeight of the row's mean center
 *     (sorting means only the most-recent row can ever match). Rows come out
 *     top-to-bottom.
 *  2. COLUMNS — collect every line's LEFT edge, sort, and gap-cluster them with
 *     a gap of `COL_GAP_FRAC` × medianHeight: cells in one column share a left
 *     edge (small jitter), while a real column break is a gap wider than a
 *     line-height. Each line is then assigned to the nearest column anchor.
 *  3. GRID — place each line into cell (row, col); lines colliding in one cell
 *     are joined top-to-bottom / left-to-right with a space.
 *
 * Guard (returns null unless ALL hold; tuned to reject prose that happens to
 * carry per-word boxes without over-rejecting sparse real tables):
 *  - at least 2 columns AND at least 2 rows, and
 *  - a STRONG MAJORITY of rows actually span >= 2 columns: the count of
 *    multi-column rows must be >= 2 and >= `MULTI_COL_ROW_FRAC` (0.6) of all
 *    rows. Prose lands one line per row (one column) and fails this outright.
 */
export function geometricTableHtml(lines: OcrLine[]): string | null {
  // Tolerances are expressed as fractions of the median line height so the
  // function is scale-invariant (works at any zoom / font size).
  const ROW_TOL_FRAC = 0.6; // center within 60% of a line-height => same row
  const COL_GAP_FRAC = 1.0; // left-edge gap > one line-height => new column
  const MULTI_COL_ROW_FRAC = 0.6; // >=60% of rows must span multiple columns

  if (lines.length === 0) return null;

  const heights = lines.map((l) => l.box[3] - l.box[1]).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  if (!(medianHeight > 0)) return null;

  const rowTol = medianHeight * ROW_TOL_FRAC;
  const colGap = Math.max(medianHeight * COL_GAP_FRAC, 4);

  // --- 1. Cluster into rows (top-to-bottom) ------------------------------
  const centerY = (l: OcrLine) => (l.box[1] + l.box[3]) / 2;
  const sorted = [...lines].sort((a, b) => centerY(a) - centerY(b));

  interface Row {
    lines: OcrLine[];
    minY: number;
    maxY: number;
    sumCenter: number;
  }
  const rows: Row[] = [];
  for (const line of sorted) {
    const cy = centerY(line);
    const last = rows[rows.length - 1];
    const overlaps = last ? line.box[1] < last.maxY && line.box[3] > last.minY : false;
    const nearCenter = last ? Math.abs(cy - last.sumCenter / last.lines.length) <= rowTol : false;
    if (last && (overlaps || nearCenter)) {
      last.lines.push(line);
      last.minY = Math.min(last.minY, line.box[1]);
      last.maxY = Math.max(last.maxY, line.box[3]);
      last.sumCenter += cy;
    } else {
      rows.push({ lines: [line], minY: line.box[1], maxY: line.box[3], sumCenter: cy });
    }
  }

  // --- 2. Determine columns (left-to-right) via left-edge clustering ------
  const lefts = lines.map((l) => l.box[0]).sort((a, b) => a - b);
  const columnAnchors = clusterCenters(lefts, colGap);
  if (columnAnchors.length < 2 || rows.length < 2) return null;

  const columnOf = (left: number): number => {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < columnAnchors.length; c++) {
      const d = Math.abs(left - columnAnchors[c]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  };

  // --- 3. Build the rectangular grid of cell texts -----------------------
  const cols = columnAnchors.length;
  const grid: OcrLine[][][] = rows.map(() =>
    Array.from({ length: cols }, () => [] as OcrLine[]),
  );
  let multiColRows = 0;
  for (let r = 0; r < rows.length; r++) {
    const occupied = new Set<number>();
    for (const line of rows[r].lines) {
      const c = columnOf(line.box[0]);
      grid[r][c].push(line);
      occupied.add(c);
    }
    if (occupied.size >= 2) multiColRows++;
  }

  // Guard: require genuine grid regularity, else this is prose/irregular.
  if (multiColRows < 2 || multiColRows < rows.length * MULTI_COL_ROW_FRAC) {
    return null;
  }

  // --- 4. Emit HTML ------------------------------------------------------
  const parts: string[] = ['<table>'];
  for (let r = 0; r < rows.length; r++) {
    parts.push('<tr>');
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      cell.sort((a, b) => {
        const ay = (a.box[1] + a.box[3]) / 2;
        const by = (b.box[1] + b.box[3]) / 2;
        if (Math.abs(ay - by) > medianHeight * ROW_TOL_FRAC) return ay - by;
        return a.box[0] - b.box[0];
      });
      const text = cell
        .map((l) => l.text.trim())
        .filter(Boolean)
        .join(' ');
      parts.push(`<td>${escapeHtml(text)}</td>`);
    }
    parts.push('</tr>');
  }
  parts.push('</table>');
  return parts.join('');
}
