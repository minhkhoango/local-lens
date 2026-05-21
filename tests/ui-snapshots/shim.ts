import { installChromeShim } from '../setup/chrome-shim';
import { realGetMessage } from './i18n';

export function installRealisticShim(): void {
  const shim = installChromeShim();
  shim.i18n.getMessage = realGetMessage;
  (globalThis as any).chrome.i18n.getMessage = realGetMessage;
}

const BACKDROP_CSS = `
  html, body {
    margin: 0;
    padding: 0;
    background: #fafafa;
    font-family: -apple-system, 'Segoe UI', 'Roboto', sans-serif;
    color: #1f1f1f;
  }
  body {
    min-height: 800px;
  }
  #snapshot-backdrop-content {
    padding: 40px;
    max-width: 760px;
    line-height: 1.6;
    color: #444;
  }
  #snapshot-backdrop-content h1 {
    font-size: 28px;
    margin: 0 0 12px 0;
    color: #1a1a1a;
  }
`;

export function mountBackdrop(): void {
  let style = document.getElementById('snapshot-backdrop-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'snapshot-backdrop-style';
    style.textContent = BACKDROP_CSS;
    document.head.appendChild(style);
  }
  let content = document.getElementById('snapshot-backdrop-content');
  if (!content) {
    content = document.createElement('div');
    content.id = 'snapshot-backdrop-content';
    content.innerHTML = `
      <h1>Local Lens</h1>
      <p>A privacy-first Chrome extension that OCRs any selected region of a web
        page. All processing runs locally in your browser using either Tesseract
        or IBM Granite — nothing leaves your machine.</p>
      <p>Click and drag a rectangle over text, a table, an equation, or a code
        snippet. The extracted text appears in an in-page island.</p>
    `;
    document.body.appendChild(content);
  }
}

export function unmountBackdrop(): void {
  document.getElementById('snapshot-backdrop-content')?.remove();
  document.getElementById('xr-floating-island-host')?.remove();
  document.getElementById('xr-screenshot-reader-host')?.remove();
}

export const flush = (ms = 40) =>
  new Promise<void>((r) => setTimeout(r, ms));
