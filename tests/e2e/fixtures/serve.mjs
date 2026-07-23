// Tiny static file server for the e2e fixtures. Started by Playwright's
// `webServer` (see playwright.config.ts) so the fixture pages load over real
// HTTP (http://127.0.0.1:<port>/...), which is what the extension sees for a
// normal browsing tab — content-script injection, captureVisibleTab and the
// background's non-restricted URL classification all behave exactly as they do
// on a real website (unlike file:// or about:blank, which are special-cased).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_FIXTURE_PORT ?? 5232);
const HOST = '127.0.0.1';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
    const rel = normalize(decodeURIComponent(url.pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    const filePath = join(HERE, rel === '/' || rel === '' ? 'text-page.html' : rel);
    if (!filePath.startsWith(HERE)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(filePath);
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    res.writeHead(200, {
      'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[e2e-fixtures] serving ${HERE} at http://${HOST}:${PORT}`);
});
