import TurndownService from 'turndown';

export function htmlToText(html: string): string {
  const turndownService = new TurndownService();
  return turndownService.turndown(html);
}
