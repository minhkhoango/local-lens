# Local Lens — real end-to-end (e2e) OCR harness

This suite loads the **actual built extension** (`dist/`) into a **real browser**
and reproduces exactly what you do by hand:

1. invoke the extension on a page,
2. drag-select a region of known text,
3. wait for the **floating island** to show the recognized text, and
4. read that text back and assert on it — while measuring **real inference
   wall-clock**, including the WebGPU path where a GPU is available.

It is built on `@playwright/test` and launches a **headed persistent context**
(MV3 extensions do not load in classic headless).

---

## Quick start

```bash
# Bundled Chromium (Playwright's), headed. Builds dist/ first via pretest:e2e.
npm run test:e2e
```

Runs two tests:

- **fast engine** over `fixtures/text-page.html` → asserts the recognized text
  contains `quick brown fox … 12345`.
- **structured engine** over `fixtures/table-page.html` (a *borderless* table) →
  asserts the island output contains a reconstructed `<table>` and the cell
  values `Fruit / Apple / Banana / Cherry`.

First run downloads Playwright's Chromium if missing:

```bash
npx playwright install chromium
```

---

## Choosing the browser (this is how you target Brave)

Selection is entirely via environment variables — no config edits.

| Target | Command |
| --- | --- |
| **Bundled Chromium** (default) | `npm run test:e2e` |
| **Installed Google Chrome** | `E2E_CHANNEL=chrome npm run test:e2e` |
| **Installed Microsoft Edge** | `E2E_CHANNEL=msedge npm run test:e2e` |
| **Brave** (any Chromium build) | `E2E_EXECUTABLE_PATH=/path/to/brave npm run test:e2e` |

Playwright has **no `brave` channel**, so Brave is launched via
`executablePath`. Typical Brave binaries:

```bash
# Linux
E2E_EXECUTABLE_PATH=/usr/bin/brave-browser npm run test:e2e
# macOS
E2E_EXECUTABLE_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" npm run test:e2e
# Windows (WSL, pointing at the Windows binary won't work — run from Windows-native Node)
E2E_EXECUTABLE_PATH="C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" npm run test:e2e
```

`E2E_EXECUTABLE_PATH` takes precedence over `E2E_CHANNEL`.

---

## WebGPU / GPU acceleration

The context is always launched with GPU-friendly flags so the WebGPU path is
exercised on real hardware:

```
--enable-unsafe-webgpu  --enable-features=Vulkan  --use-angle=vulkan  --ignore-gpu-blocklist
```

We deliberately **do not** pass `--use-gpu` / `--disable-gpu` overrides or
`--use-vulkan=swiftshader` (which would *force software* and hide real-GPU
behaviour). If no hardware adapter is available, Chromium falls back to its
**SwiftShader** software WebGPU automatically, and the engines fall back
WebGPU → WASM on their own.

Read the adapter each run logs:

```
[e2e-webgpu] navigator.gpu=true adapter=true vendor=google architecture=swiftshader \
             fallbackAdapter=null accelerated=false crossOriginIsolated=false
```

- `accelerated=true` → a real GPU adapter (hardware WebGPU path).
- `accelerated=false` → software (SwiftShader) or no adapter; **GPU-specific
  assertions are skipped** and timings reflect the software/WASM path. The test
  still runs the full pipeline and still asserts the OCR text.
- `crossOriginIsolated=false` is expected for MV3 offscreen documents (single
  WASM thread) — see the comment in `src/offscreen.ts`.

---

## Reading the timing output

Each capture logs one `[e2e-timing]` line:

```
[e2e-timing] fast: dragToFinish=725ms activateToFinish=3763ms overlay=true island=true
[e2e-timing] structured: dragToFinish=9470ms activateToFinish=16812ms overlay=true island=true
```

- **`dragToFinish`** — wall-clock from the drag mouse-up (OCR start) to the
  island's FINISH. **This is the inference number.** The engine is warmed while
  the overlay is up (the same as real usage: the model loads while you decide
  what to select), so this is the hot-path recognition time.
- **`activateToFinish`** — from trigger to FINISH, i.e. includes model load +
  drag + inference.

The recognized text itself is logged as `[e2e-result]`.

---

## Environments without a real display (CI, headless Linux)

Headed mode needs a display. Options on Linux:

```bash
# Under a virtual framebuffer:
xvfb-run -a npm run test:e2e

# Or Chromium's NEW headless (loads MV3 extensions; usually no WebGPU adapter):
E2E_HEADLESS=new npm run test:e2e
```

On WSL2 with **WSLg**, `DISPLAY` is already set, so plain `npm run test:e2e`
works headed out of the box.

If no display is available and `E2E_HEADLESS=new` is not set, the suite
**skips itself** with an explanatory message rather than failing.

---

## Other env vars

| Var | Default | Meaning |
| --- | --- | --- |
| `E2E_CHANNEL` | `chromium` | `chromium` \| `chrome` \| `msedge` |
| `E2E_EXECUTABLE_PATH` | — | Absolute path to a browser binary (Brave, etc.) |
| `E2E_HEADLESS` | — | `new` → Chromium new-headless (no display needed) |
| `E2E_FIXTURE_PORT` | `5232` | Port for the local fixture HTTP server |

---

## Fidelity & limitations (important)

This harness aims to match "what you go through by hand" as closely as
automation permits. Two deliberate, documented compromises:

### 1. Trigger — how the capture is started

A real user starts capture by clicking the toolbar icon or pressing the
`Alt+Shift+S` command; both fire `chrome.action.onClicked` **and** grant the
extension the `activeTab` permission for that tab.

Under CDP automation, **neither** a synthetic `keyboard.press('Alt+Shift+S')`
(the browser-level command accelerator does not fire from injected key events)
**nor** a service-worker call produces that `activeTab` grant — so
`captureVisibleTab` and `executeScript` are refused. (Both were verified against
this codebase.)

So the harness instead **reproduces `background.ts`'s `activateOverlay`
sequence from the service worker**: ensure the offscreen document, inject
`content.js`, send `PING_CONTENT`, then `ACTIVATE_OVERLAY`. **Every message the
content script, overlay, offscreen engine, and island receive is byte-identical
to a real toolbar click** — only the *sender* differs (a test service-worker
eval instead of `onClicked`). No test-only code path is added to `src/`.

To make that path work without an interactive gesture, the harness loads a
**copy of `dist/` with one line added** to the manifest —
`"host_permissions": ["<all_urls>"]` — which stands in for the `activeTab`
grant. The OCR pipeline is unchanged; only the permission source differs.

**Fully faithful alternative (real OS keystroke).** On a Linux/X11 desktop you
can drive the *literal* `Alt+Shift+S` accelerator against the **unpatched**
extension with a native input tool, which grants `activeTab` for real:

```bash
# terminal 1: launch a headed browser with the unpatched dist/ loaded
# terminal 2:
xdotool search --onlyvisible --class chrome windowactivate --sync key alt+shift+s
```

`xdotool`/`ydotool` were not available in the reference environment, so the
default path is the service-worker reproduction above.

### 2. Reading the result — clipboard vs. DOM

The overlay and island render inside `attachShadow({ mode: 'closed' })` roots
(`src/overlay.ts`, `src/island/mount.ts`). Their **host** elements
(`#xr-screenshot-reader-host`, `#xr-floating-island-host`) are visible in the
light DOM — so the harness detects overlay/island presence directly — but the
recognized **text** inside a *closed* root is unreachable from the page's main
world (and from a content-script isolated world).

So the harness reads the result the way the extension surfaces it to you: it
forces the island's **auto-copy** on and reads the **system clipboard**
(`text/plain` for the recognized text, `text/html` for the reconstructed
`<table>`). This exercises *more* of the real feature, not less. The browser
sanitizes clipboard `text/html` (inline styles get rewritten, `<style>` is
stripped), but structural tags like `<table>`/`<td>` survive, which is what the
structured assertion checks.

> Want DOM-level assertions instead of the clipboard? A **one-line production
> change** would enable them: switch the two `attachShadow({ mode: 'closed' })`
> calls in `src/overlay.ts` and `src/island/mount.ts` to `mode: 'open'`. Then a
> test could read the island's rendered text straight from `host.shadowRoot`.
> (Described only — not changed here; those files are owned by another lane.)

---

## Flakiness notes & mitigations

- **Clipboard focus** — async clipboard writes require the document to be
  focused. The harness calls `page.bringToFront()` and the drag itself provides
  a user gesture; clipboard perms are granted at launch. If a window manager
  steals focus, the result poll surfaces `clipboardError`.
- **Slow model load (structured)** — the overlay only becomes clickable after
  the engine's `SETUP_DONE`; the harness **retries the drag** until the island
  appears, so a multi-second structured model load is tolerated (240s test
  budget).
- **Capture race** — the overlay captures the screenshot on mouse-down
  (backup-mode round-trip); the harness holds ~800ms mid-drag so the crop never
  races an empty screenshot.
