// https://huggingface.co/spaces/ibm-granite/granite-docling-258M-WebGPU/resolve/main/parser.js
import htmlStyle from 'katex/dist/katex.min.css?inline';
import katexScript from 'katex/dist/katex.min.js?raw';
import autoRenderScript from 'katex/dist/contrib/auto-render.min.js?raw';

/**
 * Configuration for table tags
 */
interface TableTagConfig {
  htmlTag: string;
  scope?: string;
}

/**
 * Structure representing a table cell
 */
interface TableCell {
  content: string;
  tag: string;
  colspan: number;
  rowspan: number;
}

/**
 * Type representing a grid row of table cells
 */
type TableCellRow = TableCell[];

/**
 * Type representing a grid of table cells
 */
type TableCellGrid = TableCellRow[];

/**
 * Type representing a record mapping tag names to HTML strings
 */
type SelfClosingTagMap = Record<string, string>;

/**
 * Type representing a record mapping tag names to HTML tag names
 */
type SimpleTagMap = Record<string, string>;

/**
 * Type representing a record mapping table tags to configuration
 */
type TableTagConfigMap = Record<string, TableTagConfig>;

/**
 * DoclingConverter class for converting Docling markup to HTML
 */
export class DoclingConverter {
  private simpleTagMap: SimpleTagMap;
  private selfClosingTagMap: SelfClosingTagMap;
  private TABLE_TAG_CONFIG: TableTagConfigMap;
  private TABLE_TAG_REGEX: RegExp;
  private combinedTagRegex: RegExp;

  constructor() {
    this.simpleTagMap = {
      doctag: 'div',
      document: 'div',
      ordered_list: 'ol',
      unordered_list: 'ul',
      list_item: 'li',
      caption: 'figcaption',
      footnote: 'sup',
      formula: 'div',
      page_footer: 'footer',
      page_header: 'header',
      picture: 'figure',
      chart: 'figure',
      table: 'table',
      otsl: 'table',
      text: 'p',
      paragraph: 'p',
      title: 'h1',
      document_index: 'div',
      form: 'form',
      key_value_region: 'dl',
      reference: 'a',
      smiles: 'span',
    };
    this.selfClosingTagMap = {
      checkbox_selected: '<input type="checkbox" checked disabled>',
      checkbox_unselected: '<input type="checkbox" disabled>',
      page_break: '<hr class="page-break">',
    };
    this.TABLE_TAG_CONFIG = {
      '<ched>': { htmlTag: 'th' },
      '<rhed>': { htmlTag: 'th', scope: 'row' },
      '<srow>': { htmlTag: 'th', scope: 'row' },
      '<fcel>': { htmlTag: 'td' },
      '<ecel>': { htmlTag: 'td' },
      '<ucel>': { htmlTag: 'td' },
      '<lcel>': { htmlTag: 'td' },
      '<xcel>': { htmlTag: 'td' },
    };
    this.TABLE_TAG_REGEX = new RegExp(
      `(${Object.keys(this.TABLE_TAG_CONFIG).join('|')})`,
    );
    const selfClosingNames: string = Object.keys(this.selfClosingTagMap).join(
      '|',
    );
    this.combinedTagRegex = new RegExp(
      `(<([a-z_0-9]+)>(.*?)<\\/\\2>)|(<(${selfClosingNames})>)`,
      's',
    );
  }

  /**
   * Escapes HTML special characters in text
   * @param text - The text to escape
   * @returns The escaped HTML string
   */
  escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Converts Docling markup to HTML
   * @param docling - The Docling markup string
   * @returns The converted HTML string
   */
  convert(docling: string): string {
    let html: string = ` ${docling} `;
    html = this.cleanupMetadataTokens(html);
    html = this.processTags(html);
    return html.trim();
  }

  /**
   * Processes tags in the text and converts them to HTML
   * @param text - The text containing tags
   * @returns The processed HTML string
   */
  processTags(text: string): string {
    let remainingText: string = text;
    let result: string = '';
    while (remainingText.length > 0) {
      const match: RegExpMatchArray | null = remainingText.match(
        this.combinedTagRegex,
      );
      if (match && typeof match.index === 'number') {
        const textBefore: string = remainingText.substring(0, match.index);
        result += this.escapeHtml(textBefore);
        const fullMatch: string = match[0];
        const pairedTagName: string | undefined = match[2];
        const pairedContent: string | undefined = match[3];
        const selfClosingTagName: string | undefined = match[5];
        if (pairedTagName !== undefined) {
          result += this.convertSingleTag(pairedTagName, pairedContent);
        } else if (selfClosingTagName !== undefined) {
          result += this.selfClosingTagMap[selfClosingTagName] || '';
        }
        remainingText = remainingText.substring(match.index + fullMatch.length);
      } else {
        result += this.escapeHtml(remainingText);
        break;
      }
    }
    return result;
  }

  /**
   * Converts a single tag and its content to HTML
   * @param tagName - The name of the tag
   * @param content - The content inside the tag
   * @returns The converted HTML string
   */
  convertSingleTag(tagName: string, content: string): string {
    if (tagName === 'list_item') {
      content = content.trim().replace(/^[·-]\s*/g, '');
    }
    switch (tagName) {
      case 'code':
        return this.convertBlockCode(content);
      case 'otsl':
        return this.convertTable(content);
      case 'picture':
        // Remove picture
        return '';
      case 'chart':
        return this.convertPictureOrChart(tagName, content);
      case 'inline':
        return this.convertInlineContent(content);
      case 'section_header_level_0':
      case 'section_header_level_1':
      case 'section_header_level_2':
      case 'section_header_level_3':
      case 'section_header_level_4':
      case 'section_header_level_5':
        const level: number = parseInt(tagName.at(-1)!, 10) + 1;
        return `<h${level}>${this.processTags(content)}</h${level}>`;
      default:
        const htmlTag: string | undefined = this.simpleTagMap[tagName];
        if (htmlTag) {
          const processedContent: string = this.processTags(content);
          const startTag: string = this.getStartTag(tagName, htmlTag);
          return `${startTag}${processedContent}</${htmlTag}>`;
        }
        console.warn(`Unknown tag encountered: ${tagName}, escaping it.`);
        return this.escapeHtml(`<${tagName}>${content}</${tagName}>`);
    }
  }

  /**
   * Gets the opening HTML tag with appropriate attributes
   * @param doclingTag - The Docling tag name
   * @param htmlTag - The HTML tag name
   * @returns The opening HTML tag string
   */
  getStartTag(doclingTag: string, htmlTag: string): string {
    switch (doclingTag) {
      case 'doctag':
      case 'document':
        return '<div class="docling-document">';
      case 'formula':
        return '<div class="formula">';
      case 'document_index':
        return '<div class="toc">';
      case 'smiles':
        return '<span class="smiles">';
      case 'reference':
        return '<a href="#">';
      default:
        return `<${htmlTag}>`;
    }
  }

  /**
   * Converts inline content with nested tags
   * @param content - The inline content to convert
   * @returns The converted HTML string
   */
  convertInlineContent(content: string): string {
    const inlineTagRegex: RegExp = /<(code|formula|text|smiles)>(.*?)<\/\1>/s;
    let remainingText: string = content;
    let result: string = '';
    while (remainingText.length > 0) {
      const match: RegExpMatchArray | null =
        remainingText.match(inlineTagRegex);
      if (match && typeof match.index === 'number') {
        const textBefore: string = remainingText.substring(0, match.index);
        result += this.escapeHtml(textBefore);
        const [fullMatch, tagName, innerContent]: [string, string, string] =
          match as [string, string, string];
        switch (tagName) {
          case 'code':
            const langRegex: RegExp = /<_(.*?)_>/;
            const langMatch: RegExpMatchArray | null =
              innerContent.match(langRegex);
            if (langMatch && langMatch[1]) {
              const language: string = this.sanitizeLanguageName(langMatch[1]);
              const codeContent: string = innerContent
                .replace(langRegex, '')
                .trim();
              const escapedCode: string = this.escapeHtml(codeContent);
              const langClass: string =
                language !== 'unknown' ? ` class="language-${language}"` : '';
              result += `<code${langClass}>${escapedCode}</code>`;
            } else {
              result += `<code>${this.escapeHtml(innerContent)}</code>`;
            }
            break;
          case 'formula':
            result += `<span class="formula">${this.escapeHtml(innerContent)}</span>`;
            break;
          case 'smiles':
            result += `<span class="smiles">${this.escapeHtml(innerContent)}</span>`;
            break;
          case 'text':
            result += this.escapeHtml(innerContent);
            break;
        }
        remainingText = remainingText.substring(match.index + fullMatch.length);
      } else {
        result += this.escapeHtml(remainingText);
        break;
      }
    }
    return result;
  }

  /**
   * Converts block code with language specification
   * @param content - The code content to convert
   * @returns The converted HTML string
   */
  convertBlockCode(content: string): string {
    const langRegex: RegExp = /<_(.*?)_>/;
    const langMatch: RegExpMatchArray | null = content.match(langRegex);
    let language: string = 'unknown';
    let codeContent: string = content;
    if (langMatch && langMatch[1]) {
      language = this.sanitizeLanguageName(langMatch[1]);
      codeContent = content.replace(langRegex, '').trim();
    }
    const escapedCode: string = this.escapeHtml(codeContent);
    const langClass: string =
      language !== 'unknown' ? ` class="language-${language}"` : '';
    return `<pre><code${langClass}>${escapedCode}</code></pre>`;
  }

  /**
   * Converts table markup to HTML table
   * @param content - The table content to convert
   * @returns The converted HTML table string
   */
  convertTable(content: string): string {
    const rows: string[] = content
      .trim()
      .split(/<nl>/)
      .filter((row: string) => row.length > 0);
    const cellGrid: TableCellGrid = [];
    rows.forEach((rowStr: string, rowIndex: number) => {
      const parts: string[] = rowStr.split(this.TABLE_TAG_REGEX);
      const currentRow: TableCellRow = [];
      let gridColIndex: number = 0;
      for (let i = 1; i < parts.length; i += 2) {
        const tag: string = parts[i];
        const cellContent: string = parts[i + 1] || '';
        switch (tag) {
          case '<lcel>':
            if (currentRow.length > 0) {
              currentRow[currentRow.length - 1].colspan++;
            }
            break;
          case '<ucel>':
            if (rowIndex > 0 && cellGrid[rowIndex - 1]?.[gridColIndex]) {
              cellGrid[rowIndex - 1][gridColIndex].rowspan++;
            }
            gridColIndex++;
            break;
          case '<xcel>':
            if (currentRow.length > 0) {
              currentRow[currentRow.length - 1].colspan++;
            }
            break;
          default:
            if (this.TABLE_TAG_CONFIG[tag]) {
              currentRow.push({
                content: cellContent,
                tag,
                colspan: 1,
                rowspan: 1,
              });
              gridColIndex++;
            }
            break;
        }
      }
      cellGrid.push(currentRow);
    });
    const htmlRows: string = cellGrid
      .map((row: TableCellRow) => {
        const cellsHtml: string = row
          .map((cell: TableCell) => {
            const config: TableTagConfig | undefined =
              this.TABLE_TAG_CONFIG[cell.tag];
            if (!config) return '';
            const attrs: string[] = [];
            if (cell.colspan > 1) attrs.push(`colspan="${cell.colspan}"`);
            if (cell.rowspan > 1) attrs.push(`rowspan="${cell.rowspan}"`);
            if (config.scope) attrs.push(`scope="${config.scope}"`);
            const processedContent: string = this.processTags(cell.content);
            const attrString: string =
              attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
            return `<${config.htmlTag}${attrString}>${processedContent}</${config.htmlTag}>`;
          })
          .join('');
        return `<tr>${cellsHtml}</tr>`;
      })
      .join('');
    return `<table><tbody>${htmlRows}</tbody></table>`;
  }

  /**
   * Converts picture or chart tags to HTML figure elements
   * @param tag - The tag name (picture or chart)
   * @param content - The content inside the tag
   * @returns The converted HTML string
   */
  convertPictureOrChart(tag: string, content: string): string {
    if (/<(fcel|ched|rhed)>/.test(content)) {
      const cleanedContent: string = content.replace(
        /<[a-z_]+>/g,
        (match: string) => {
          if (
            match.startsWith('<fcel') ||
            match.startsWith('<ched') ||
            match.startsWith('<rhed') ||
            match.startsWith('<nl')
          ) {
            return match;
          }
          return '';
        },
      );
      return this.convertTable(cleanedContent);
    }
    let captionHtml: string = '';
    const captionRegex: RegExp = /<caption>(.*?)<\/caption>/s;
    const captionMatch: RegExpMatchArray | null = content.match(captionRegex);
    if (captionMatch && captionMatch[1]) {
      const captionContent: string = this.processTags(captionMatch[1]);
      captionHtml = `<figcaption>${captionContent}</figcaption>`;
    }
    const contentWithoutCaption: string = content.replace(captionRegex, '');
    const classificationRegex: RegExp = /<([a-z_]+)>/;
    const classMatch: RegExpMatchArray | null =
      contentWithoutCaption.match(classificationRegex);
    let altText: string = tag;
    if (classMatch) {
      altText = classMatch[1].replace(/_/g, ' ');
    }
    const imgHtml: string = `<img alt="${this.escapeHtml(altText)}" src="">`;
    const figureTag: string = this.simpleTagMap[tag] || 'figure';
    return `<${figureTag}>${imgHtml}${captionHtml}</${figureTag}>`;
  }

  /**
   * Sanitizes language name for use in CSS classes
   * @param lang - The language name to sanitize
   * @returns The sanitized language name
   */
  sanitizeLanguageName(lang: string): string {
    const lowerLang: string = lang.toLowerCase();
    const aliasMap: Record<string, string> = {
      'c#': 'csharp',
      'c++': 'cpp',
      objectivec: 'objective-c',
      visualbasic: 'vb',
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      ruby: 'rb',
      dockerfile: 'docker',
    };
    return aliasMap[lowerLang] || lowerLang.replace(/[\s#+]/g, '-');
  }

  /**
   * Removes metadata tokens from Docling markup
   * @param docling - The Docling markup string
   * @returns The cleaned string
   */
  cleanupMetadataTokens(docling: string): string {
    return docling.replace(/<loc_[0-9]+>/g, '');
  }
}

/**
 * Converts Docling markup to a complete HTML document
 * @param docling - The Docling markup string
 * @returns A tuple containing the inner HTML and the complete HTML document as strings
 */
export function doclingToHtml(docling: string): [string, string] {
  const converter: DoclingConverter = new DoclingConverter();
  const textHtml: string = converter.convert(docling);
  const formattedHtml = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <style>
        ${htmlStyle}

          html {
              background-color: #f5f5f5;
              font-family: Arial, sans-serif;
              line-height: 1.6;
          }
          header, footer {
              text-align: center;
              margin-bottom: 1rem;
              font-size: 1em;
          }
          body {
              max-width: 800px;
              margin: 0 auto;
              padding: 2rem;
              background-color: white;
              box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          h1, h2, h3, h4, h5, h6 {
              color: #333;
              margin-top: 1.5em;
              margin-bottom: 0.5em;
          }
          h1 {
              font-size: 2em;
              border-bottom: 1px solid #eee;
              padding-bottom: 0.3em;
          }
          table {
              border-collapse: collapse;
              margin: 1em 0;
              width: 100%;
          }
          th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
          }
          th {
              background-color: #f2f2f2;
              font-weight: bold;
          }
          figure {
              margin: 1.5em 0;
              text-align: center;
          }
          figcaption {
              color: #666;
              font-style: italic;
              margin-top: 0.5em;
          }
          img {
              max-width: 100%;
              height: auto;
          }
          pre {
              background-color: #f6f8fa;
              border-radius: 3px;
              padding: 1em;
              overflow: auto;
          }
          code {
              font-family: monospace;
              background-color: #f6f8fa;
              padding: 0.2em 0.4em;
              border-radius: 3px;
          }
          pre code {
              background-color: transparent;
              padding: 0;
          }
          .formula {
              text-align: center;
              padding: 0.5em;
              margin: 1em 0;
          }
          .formula:not(:has(.katex)) {
              color: transparent;
          }
          .page-break {
              page-break-after: always;
              border-top: 1px dashed #ccc;
              margin: 2em 0;
          }
          .key-value-region {
              background-color: #f9f9f9;
              padding: 1em;
              border-radius: 4px;
              margin: 1em 0;
          }
          .key-value-region dt {
              font-weight: bold;
          }
          .key-value-region dd {
              margin-left: 1em;
              margin-bottom: 0.5em;
          }
          .form-container {
              border: 1px solid #ddd;
              padding: 1em;
              border-radius: 4px;
              margin: 1em 0;
          }
          .form-item {
              margin-bottom: 0.5em;
          }
      </style>
      </head>
  <body>
  ${textHtml}
  <script>
  ${katexScript}
  </script>
  <script>
  ${autoRenderScript}
  </script>
  <script>
  const mathElements = document.querySelectorAll('.formula');
  for (let element of mathElements) {
    katex.render(element.textContent, element, {
      throwOnError: false,
    });
  }

  renderMathInElement(document.body, {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "\\\\[", right: "\\\\]", display: true},
      {left: "$", right: "$", display: false},
      {left: "\\\\(", right: "\\\\)", display: false}
    ],
    throwOnError: false,
  });
  </script>
  </body>
  </html>`;

  return [textHtml, formattedHtml];
}
