# Local Lens

A privacy-first Chrome extension that OCRs any selected region of a web page. All processing runs locally in your browser using either [Tesseract.js](https://tesseract.projectnaptha.com/) or [IBM Granite 258M](https://huggingface.co/ibm-granite/granite-docling-258M) — nothing leaves your machine.

## Links

- Demo (20s): https://youtu.be/f9fvxj5iOAI
- Chrome Web Store: https://chromewebstore.google.com/detail/fjkjnfomdkiidppadckboijmkegmbmpo

## What it does

- Click the toolbar icon (or press `Alt+Shift+S` / `Cmd+Shift+S` on Mac) to start a selection.
- Drag a rectangle over text, a table, an equation, or a code snippet.
- The extracted text appears in an in-page island you can copy from.
- Switch between engines in the island:
  - **Tesseract** — fast, lightweight, plain text.
  - **Granite** — heavier WebGPU model; better with tables, math (LaTeX), and structured layouts. First run downloads model weights from Hugging Face.

## Install from source

Requires Node 20+.

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `dist/` folder.

## Development

```bash
npm run dev        # Vite dev server (for working on UI in isolation)
npm run build      # production build into dist/
```

The build emits three entry points (`background`, `content`, `offscreen`) and copies static assets from `public/` (manifest, icons, locales, offscreen HTML).

## Testing

```bash
npm test              # unit + browser tests (Tesseract, parsers, island UI)
npm run test:watch    # watch mode
npm run test:granite  # Granite engine tests (downloads model, slow)
npm run test:ui-update # update Vitest screenshot/snapshot baselines
```

Browser tests run headless Chromium via `@vitest/browser-playwright`. The Granite suite is split into its own config because it pulls multi-hundred-MB weights and needs WebGPU.

Test fixtures live in `test_pictures/` and expected outputs in `tests/expected/`.

## Project layout

```
src/
  background.ts   service worker — toolbar action, lifecycle
  content.ts      injected into pages — selection overlay + island host
  offscreen.ts    offscreen document — runs OCR engines off the main thread
  overlay.ts      drag-to-select rectangle UI
  island/         floating result panel (engine switcher, copy, status)
  engine/         tesseract.ts, granite.ts, shared types
public/
  manifest.json   MV3 manifest
  offscreen.html  host for the offscreen OCR worker
  _locales/       i18n strings
```

## Privacy

No network calls for OCR. The only outbound requests are model/data downloads from `tessdata.projectnaptha.com` and `huggingface.co` (allowlisted in the manifest CSP), and only on first use of each engine. See [PRIVACY.md](PRIVACY.md).
