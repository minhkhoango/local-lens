import TurndownService from 'turndown';
import { replace } from 'unicodeit';
import { tables } from './table';

export function htmlToText(docling: string): string {
  const turndownService = new TurndownService();
  turndownService.use(tables);
  const markdown = turndownService.turndown(docling);
  const unicodeMarkdown = replace(markdown);
  return unicodeMarkdown;
}
