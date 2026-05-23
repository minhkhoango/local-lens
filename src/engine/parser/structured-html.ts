// Composes semantic HTML from PP-DocLayout regions paired with OCR text.
// Labels come from ppu-doclayout's 25-class LABELS list:
// abstract, algorithm, aside_text, chart, content, display_formula, doc_title,
// figure_title, footer, footer_image, footnote, formula_number, header,
// header_image, image, inline_formula, number, paragraph_title, reference,
// reference_content, seal, table, text, vertical_text, vision_footnote.

export interface StructuredRegion {
  label: string;
  text: string;
}

const SKIP_LABELS = new Set([
  'chart',
  'image',
  'header_image',
  'footer_image',
  'seal',
  'formula_number',
  'footer',
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tagFor(label: string): { open: string; close: string } | null {
  switch (label) {
    case 'doc_title':
      return { open: '<h1>', close: '</h1>' };
    case 'paragraph_title':
      return { open: '<h2>', close: '</h2>' };
    case 'header':
      return { open: '<h3>', close: '</h3>' };
    case 'figure_title':
      return { open: '<figcaption>', close: '</figcaption>' };
    case 'table':
      return { open: '<pre class="table">', close: '</pre>' };
    case 'algorithm':
      return { open: '<pre class="algorithm">', close: '</pre>' };
    case 'display_formula':
    case 'inline_formula':
      return { open: '<pre class="formula">', close: '</pre>' };
    case 'number':
      return { open: '<li>', close: '</li>' };
    case 'abstract':
    case 'content':
    case 'text':
    case 'footnote':
    case 'reference':
    case 'reference_content':
    case 'aside_text':
    case 'vision_footnote':
    case 'vertical_text':
      return { open: '<p>', close: '</p>' };
    default:
      return { open: '<p>', close: '</p>' };
  }
}

export function composeStructuredHtml(regions: StructuredRegion[]): string {
  const parts: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  for (const region of regions) {
    if (SKIP_LABELS.has(region.label)) continue;
    const text = region.text.trim();
    if (!text) continue;

    if (region.label === 'number') {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${escapeHtml(text)}</li>`);
      continue;
    }

    closeList();
    const tag = tagFor(region.label);
    if (!tag) continue;
    parts.push(`${tag.open}${escapeHtml(text)}${tag.close}`);
  }

  closeList();
  return parts.join('\n');
}
