# Local Lens

A privacy-first Chrome extension that OCRs any selected region of a web page. Both OCR engines are bundled (PaddleOCR PP-OCRv5 + PP-DocLayoutV3) — no model downloads, no network calls.

## Links

- Chrome Web Store: https://chromewebstore.google.com/detail/fjkjnfomdkiidppadckboijmkegmbmpo

## What it does

- Click the toolbar icon (or press `Alt+Shift+S` / `Cmd+Shift+S` on Mac) to start a selection.
- Drag a rectangle over text, a table, an equation, or a code snippet.
- The extracted text appears in an in-page island you can copy from.
- Switch between engines in the island:
  - **Fast** — PP-OCRv5 mobile recognition. Plain text output. WebGPU with WASM fallback.
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
npm test                  # unit + browser tests (fast engine, parsers, island UI)
npm run test:watch        # watch mode
npm run test:structured   # structured engine browser tests
npm run test:ui-snapshots # FloatingIsland / GhostOverlay visual snapshots
npm run test:ui-update    # update snapshot baselines
npm run test:bench        # PP-OCRv5 timing tests (downloads fp32 rec for comparison)
npm run test:bench-parity # fp32 vs int8 recognition parity only
```

Browser tests run headless Chromium via `@vitest/browser-playwright`. Test fixtures live in `test_pictures/` and expected outputs in `tests/expected/`.

## Benchmarks

Numbers from `tests/bench/RESULTS.md` (headless Chromium, swiftshader, WASM SIMD threaded; WebGPU is not measurable in this environment so the "WebGPU" rows fall back to WASM):

- **Parity:** PP-OCRv5 int8 recognition is **byte-identical to fp32** (edit distance 0, identical confidence) across all fixtures. This is why int8 is the shipped default.
- **Fast engine warm steady-state:** **1–9 ms** per crop, bounded by image size. First OCR after extension load is **~1.5–4 s** on a cold WASM runtime, regardless of model precision.
- **Structured engine:** layout dominates (**~6.4 s** warm per image). Switching recognition precision doesn't move the wall time.
- **Bundle savings:** int8 saves **~830 KB** versus fp32 with no measurable runtime downside.

See `tests/bench/RESULTS.md` for the full table, caveats around process-warm WASM, and the limitations of the parity gate (small high-contrast English fixtures only).

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
  engine/         fast.ts (PP-OCRv5), structured.ts (PP-DocLayoutV3 + PP-OCRv5), table/ (SLANet_plus), parser/
public/
  manifest.json       MV3 manifest
  offscreen.html      host for the offscreen OCR worker
  paddle_engine/      bundled PP-OCRv5 ONNX models + ORT WASM runtime
  structured_engine/  bundled PP-DocLayoutV3 + SLANet_plus ONNX models + table dict
```

## Privacy

No network calls. All OCR models ship with the extension. See [PRIVACY.md](PRIVACY.md).
