# Local Lens

A privacy-first Chrome extension that OCRs any selected region of a web page. Both OCR engines are bundled (PaddleOCR PP-OCRv6 + PP-DocLayoutV3) — no model downloads, no network calls.

## Links

- Chrome Web Store: https://chromewebstore.google.com/detail/fjkjnfomdkiidppadckboijmkegmbmpo

## What it does

- Click the toolbar icon (or press `Alt+Shift+S` / `Cmd+Shift+S` on Mac) to start a selection.
- Drag a rectangle over text, a table, an equation, or a code snippet.
- The extracted text appears in an in-page island you can copy from.
- Switch between engines in the island:
  - **Fast** — PP-OCRv6 tiny recognition. Plain text output. WebGPU with WASM fallback.
  - **Structured** — PP-DocLayoutV3 segments the crop into regions; each region is OCR'd and reassembled into HTML (headings, code blocks, equations). Detected tables are reconstructed into real `<table>` markup with SLANet_plus (structure + per-cell boxes) and the recognized cell text. Layout and table structure run WASM-only; recognition runs WebGPU when available.

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

The build emits three entry points (`background`, `content`, `offscreen`) and copies static assets from `public/` (manifest, icons, offscreen HTML, bundled model files).

## Testing

```bash
npm test                  # unit + browser projects
npm run test:watch        # same two projects, watch mode
npm run test:structured   # structured engine (PP-DocLayoutV3 + SLANet_plus)
npm run test:ui-snapshots # writes UI screenshots to tests/ui-snapshots/output/
npm run test:bench        # engine timing runs
npm run test:e2e          # real extension in a real browser
```

All Vitest projects live in a single `vitest.config.ts` and are selected with
`--project`. The `unit` project runs under happy-dom with no browser process;
everything else runs headless Chromium via `@vitest/browser-playwright`.

OCR fixtures are sibling file pairs in `tests/fixtures/images/`:

```
typescript-code-dark.png             the image to OCR
typescript-code-dark.expected.txt    one required substring per line
```

Adding a fixture means dropping in those two files — no code change. A `.png`
with no matching `.expected.txt` fails loudly rather than running unasserted.

## Benchmarks

`npm run test:bench` prints per-image timings for both engines. Numbers move
with host GPU, thermal state, and ONNX Runtime version, so they are not checked
into the repo — run it locally when you need a baseline.

### Real-world latency (Ryzen 7 5800HS, plugged in, performance mode)

End-to-end inference, measured on a real Chrome install (not headless). Currently all inference runs on WASM — WebGPU is not yet wired up in practice, so these numbers are a ceiling, not a floor.

- **Fast engine:** ~3 s on a small, already-warm crop; up to ~10 s on a large full-page crop with no warmup.
- **Structured engine:** ~18 s to ~47 s depending on crop size and warm state.

## Project layout

```
src/
  background.ts   service worker — toolbar action, lifecycle
  content.ts      injected into pages — selection overlay + island host
  offscreen.ts    offscreen document — runs OCR engines off the main thread
  overlay.ts      drag-to-select rectangle UI
  island/         floating result panel (React 19; engine switcher, copy, status)
  engine/         fast.ts (PP-OCRv6), structured.ts (PP-DocLayoutV3 + PP-OCRv6), table/ (SLANet_plus), parser/
public/
  manifest.json       MV3 manifest
  offscreen.html      host for the offscreen OCR worker
  paddle_engine/      bundled PP-OCRv6 ONNX models + ORT WASM runtime
  structured_engine/  bundled PP-DocLayoutV3 + SLANet_plus ONNX models + table dict
```

## Privacy

No network calls. All OCR models ship with the extension. See [PRIVACY.md](PRIVACY.md).
