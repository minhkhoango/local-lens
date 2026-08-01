# Local Lens v1.5.0 — uninstall-bug investigation

Investigated against the shipped **v1.5.0 tree (`0bcd00e`)**, built and driven in
a real headed Chromium. Reproductions live in [`tests/repro/`](tests/repro/).

**No production code has been changed.** This document is diagnosis and repro
steps only.

---

## TL;DR

There is no single bug. There are **three independent defects that all present
to the user as "the extension froze"**, plus a fourth that makes the extension
permanently heavy. Ranked by how likely they are to have driven uninstalls:

| # | Defect | What the user sees | Status |
| --- | --- | --- | --- |
| **1** | Setup port ignores `ERROR`; `activate()` is the only thing that binds Escape | Whole page **permanently dimmed 40% black**, banner stuck on **"Loading model..."**, Escape does nothing, clicks fall through. Only a reload escapes. | **Reproduced** |
| **2** | Island dismissal listeners all live on the top-level document; PDF plugin events never reach it, and the `isPdf` fallback is decided by a filename sniff | Floating island **cannot be dismissed at all** on a PDF served without a `.pdf` suffix | **Reproduced** |
| **3** | v1.5.0's new COOP/COEP manifest keys silently switched ORT from 1 thread to 4, against a code comment asserting the opposite | Intermittent hard hang on "Loading model...", new in 1.5.0 | **Mechanism verified**; hang is inferred |
| **4** | `chrome.offscreen.closeDocument()` is never called and 1.5.0 removed the only real engine teardown | Hundreds of MB pinned for the whole browser session, browser gets sluggish | Verified by inspection |

Defect 1 is the one I would fix first. It is deterministic, it locks the entire
page, and the "Loading model..." string it freezes on is exactly the symptom
described.

---

## Defect 1 — the setup-overlay lock (headline)

### Mechanism

`src/content.ts:111-121` registers the setup-port listener with exactly two
cases:

```js
port.onMessage.addListener((msg) => {
  if (!activeOverlay) return;
  switch (msg.action) {
    case 'DOWNLOAD':   activeOverlay.loadingProgress(msg.payload.progress); return true;
    case 'SETUP_DONE': activeOverlay.activate();                            return false;
  }
});
```

There is **no `ERROR` case**. But `src/offscreen.ts:81-89` posts exactly that on
the same port whenever `initEngine()` throws. The error is silently dropped.

That is fatal because `GhostOverlay.activate()` (`src/overlay.ts:137-142`) is the
only place that binds *any* means of dismissal:

```js
public activate(): void {
  this.host.style.pointerEvents = 'auto';                    // :139
  this.canvas.addEventListener('mousedown', this.handleMouseDown);  // :141
  window.addEventListener('keydown', this.handleKeyDown);    // :142  <- Escape
  ...
}
```

Meanwhile `mount()` has already painted the viewport for the structured engine:

```js
if (this.engine === 'fast') return;
this.fillBackground(0.4);        // src/overlay.ts:112-113
```

at `z-index: 2147483647`, with the banner set to `"Loading model..."`
(`src/overlay.ts:94`).

So on any setup failure the user gets a full-screen 40%-black layer, a frozen
"Loading model..." pill, `pointer-events: none` so they cannot even click it
away, and **no Escape handler, because it is only ever registered on the success
path**. Reload is the only exit.

A second, related gap: nothing ever posts `DOWNLOAD`. Neither `fast.ts` nor
`structured.ts` emits it, so `loadingProgress()` and the `Loading model: N%`
branch are dead code. Even a *successful* structured load shows a dark screen
with zero progress feedback for its full duration — measured below at 10s on
this machine, and far longer on the "weaker hardware" the dead
`warnBrowserFreeze()` banner was written to warn about.

### Reproduced

```
CASE A — structured engine, HEALTHY models
  >>> overlay ACTIVATED after 10.0s of dark screen
  RESULT: recoverable

CASE B — structured engine, setup FAILS (offscreen posts ERROR)
  overlay state after 60.4s: {"present":true,"pointerEvents":"none","activated":false}
  >>> overlay NEVER activated within 60s — still inert
    after Escape       : overlay present = true
    after click on page: overlay present = true
    after Escape again : overlay present = true
  RESULT: *** PAGE PERMANENTLY DARKENED, NO WAY OUT ***
```

Run it:

```bash
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/01-setup-overlay-lock.mjs
```

The script induces the failure by corrupting the layout model. **The trigger is
synthetic; the handling gap is real.** Any real setup failure reaches the same
state — OOM loading the 124 MiB fp32 `PP-DocLayoutV3.onnx`, a partial install, an
ORT init failure, or defect 3's silent hang.

---

## Defect 2 — the island cannot be dismissed on a PDF

### Mechanism

All three dismissal paths are bound to the **top-level document**
(`src/island/behavior.ts:100-107`):

```js
document.addEventListener('mousedown', this.handleClickOutside);
window.addEventListener('keydown', this.handleKeyDown);            // Escape
if (this.isPdf) window.addEventListener('blur', this.handleWindowBlur);
```

Chrome renders a PDF as a single `<embed>` hosting the plugin in a **separate
process**. I measured this directly: after clicking into the PDF and pressing
Escape, the top-level document recorded

```
{"mousedown":0,"keydown":0,"blur":0}
```

Zero of each. Click-outside and Escape are structurally dead on a PDF. The
`isPdf` blur listener is the only survivor.

And `isPdf` is decided by a filename sniff — `src/background.ts:202`:

```js
const isPdf = newUrl.pathname.toLowerCase().endsWith('.pdf');
```

So a PDF served from `/report`, `/download?id=123`, a `Content-Disposition`
response, or an extensionless local file classifies as `isPdf === false`, the
blur listener is never attached, and the island has **zero** working dismissal
paths. There is also no close button anywhere in the island UI — I read the whole
render tree at `src/island/FloatingIsland.tsx:404-508`; the actions row has only
Copy and Settings.

### Reproduced

Identical PDF bytes served at two URLs:

```
A — /report   => isPdf=false, no blur fallback
   click page top-left    island still present = true
   click page centre      island still present = true
   press Escape           island still present = true
   scroll                 island still present = true
   RESULT: island *** STILL PRESENT ***

B — /doc.pdf  => isPdf=true
   click page top-left    island still present = false
   RESULT: island was dismissed
```

```bash
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/02-pdf-island-dismissal.mjs
```

Two honest caveats:

- **Escape is flaky under automation.** Across runs, case A sometimes lost
  Escape (shown above) and sometimes kept it, depending on whether CDP input
  landed on the plugin or the top document. A real user who has clicked into the
  PDF loses it reliably. The click-outside result is stable in every run.
- Even in case B the island is dismissed only by `blur` — meaning on *any* PDF
  the island also evaporates the moment the user alt-tabs away, destroying the
  extracted text. `src/island/behavior.ts:118-121` concedes this in a comment.

Also worth noting: `handleWindowBlur`'s `inViewport` guard
(`src/island/behavior.ts:125`) is effectively dead code, because every write to
the island's position already goes through `clampToViewport`
(`src/island/utils.ts:129-130`). It inverts into a hard lock only when
`innerWidth < islandWidth + 4` — reachable with the text panel expanded
(`maxWidthExpanded: 650`) in a narrow window. I did not reproduce that case.

---

## Defect 3 — v1.5.0 silently enabled multi-threaded ORT

`public/manifest.json` gained two keys in 1.5.0 (absent in `0bcd00e^`):

```json
"cross_origin_embedder_policy": { "value": "require-corp" },
"cross_origin_opener_policy":   { "value": "same-origin"  }
```

`src/offscreen.ts:23-33` asserts the opposite of what these do:

> MV3 offscreen documents are usually NOT cross-origin-isolated: MV3 removed the
> MV2 COOP/COEP manifest keys, so `self.crossOriginIsolated` is commonly false
> and this guard keeps us at 1 thread today — which is correct and safe.
> [...] **do NOT add them here**.

The same commit added them. Measured, using the extension's own log line:

```
1.5.0 as shipped : crossOriginIsolated=true   numThreads=4
without the keys : crossOriginIsolated=false  numThreads=1
```

```bash
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/03-cross-origin-isolation.mjs
```

So 1.5.0 switched onnxruntime-web from 1 thread to 4 and began spawning pthread
workers that had never run in 1.4.x. Two findings about how that fails:

- Worker creation is **not** CSP-blocked — ORT re-imports its own same-origin
  `.mjs` URL, which `script-src 'self'` permits. Rule that hypothesis out.
- But in the shipped ORT 1.26, `env.wasm.initTimeout` defaults to `0` and the
  timeout racer is skipped when it is, and the per-worker ready promise is
  constructed as `new Promise(resolve => ...)` with **no reject path** — a worker
  that fails to start routes to `onerror`, which throws on the event loop and
  never rejects. So a failed worker start is a **silent, permanent hang** in
  `initialize()`, not an error.

That hang lands directly in defect 1: no `SETUP_DONE`, so the dark overlay never
activates. Whether workers actually fail on real user hardware is **inferred**,
not proven here — but the thread-count change is measured, and the failure mode
if it happens is verified to be a silent hang.

---

## Defect 4 — nothing is ever released

- `chrome.offscreen.closeDocument()` **does not appear anywhere in `src/`**.
- 1.5.0 deliberately made `stop()` stop tearing down (commit message: *"stop() no
  longer destroys the loaded PaddleOcrService on island close"*). `FastEngine.stop()`
  is now just `this.stopped = true`. The new `destroy()` that does the real work
  has **no caller in `src/`**. `StructuredEngine` has no `destroy()` at all.
- Switching engines never releases the previous one, and `StructuredEngine`
  builds its **own second** `PaddleOcrService` over the same det/rec models the
  fast engine already holds.

Net: after one structured OCR the offscreen document pins the 124 MiB layout
model, ~6 MiB of det/rec weights (twice, after a switch), the 25 MiB threaded
WASM module, and a grow-only `WebAssembly.Memory` — for the rest of the browser
session, with no code path that could ever free it. The shipped package is
**169 MB**.

Two aggravators found alongside:

- `warnBrowserFreeze()` — the "Browser may freeze on weaker hardware" banner — is
  **defined and never called** in 1.5.0 (`src/island/FloatingIsland.tsx:271-280`,
  wrapper at `src/island/mount.ts:110-112`). Its only caller in the whole repo is
  a snapshot test. Users got no warning before loading a 124 MiB model. Fixed
  after 1.5.0 by `f581fa8`.
- `stopOcr()` (`src/offscreen.ts:156-162`) branches on a module-global `engine`
  that only `initEngine` writes, so after an in-island engine switch it stops the
  wrong engine — heavy structured inference keeps running after the user closes
  the island.

---

## Why the test suite was green

`tests/e2e/helpers/extension.ts:408`:

```js
const resp = await chrome.tabs.sendMessage(id, {
  action: 'ACTIVATE_OVERLAY',
  payload: { imageUrl: null, isPdf: false },
});
```

The harness reproduces `background.ts`'s `activateOverlay` step for step and then
**hardcodes `isPdf: false`** — the one place the PDF branch could have been
parameterized into existence is a literal.

More broadly:

- **No test ever sets `isPdf: true`.** Both call sites pass `false`
  (`tests/browser/island-view.test.ts:22`, `tests/e2e/helpers/extension.ts:408`),
  so `src/island/behavior.ts:106` has never executed under test.
- **No test asserts the island can be dismissed** — by any gesture, on any page
  type. `handleClickOutside` / `handleKeyDown` / `handleWindowBlur` are never
  invoked.
- **No test calls `FloatingIsland.destroy()`.** Tests tear down with
  `getElementById(...).remove()`, which skips `root.unmount()` and therefore
  React's listener cleanup.
- **No test loads a PDF, a `file://` URL, or a `chrome://` page.** Everything runs
  on `http://127.0.0.1:5232`. `tests/e2e/fixtures/serve.mjs:6` says file:// was
  avoided deliberately.
- **`src/background.ts`, `src/content.ts`, and `src/offscreen.ts` are imported by
  zero tests.** `classifyUrl` — where `isPdf` is born — has no coverage of any
  kind.
- **`chrome-shim.ts` defines the failure class out of existence**: `sendMessage`
  always resolves (`:77`), and `connect()` returns a port whose
  `onMessage.addListener` is a bare `vi.fn()` that never fires (`:28-35`).
- **`tests/ui-snapshots/` has 10 `it()` blocks and 0 `expect()` calls** — it
  writes screenshots and never compares them.
- **The e2e suite skips itself when no display is available**
  (`tests/e2e/helpers/extension.ts:149-158`), so "green" and "the e2e ran" are
  not the same signal. There is no CI config in the repo.

---

## How to reproduce, start to finish

```bash
# 1. Build shipped 1.5.0
git worktree add ../ll-150 0bcd00e
cd ../ll-150 && npm install && npm run build && cd -

# 2. Run the reproductions (headed; use xvfb-run on a display-less box)
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/01-setup-overlay-lock.mjs      # dark-screen lock
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/02-pdf-island-dismissal.mjs    # undeletable island
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/03-cross-origin-isolation.mjs  # 1 -> 4 threads
```

Script 01 writes `overlay-setup-failed.png` / `overlay-healthy.png` so you can
see the dark lock.

### One environment caveat

`npm run build` fetches `SLANet_plus.onnx` from `huggingface.co`, which **this
session's egress policy blocks (HTTP 403)**. I stubbed that one file to get a
build. It does not affect any finding: `StructuredEngine.load()` wraps the SLANet
init in its own `try/catch` (`src/engine/structured.ts:149-162`), so a bad SLANet
only disables table reconstruction and never reaches the setup path these repros
exercise. On a machine that can reach huggingface, the build needs no stub.

---

## Suggested fix order (not implemented)

1. Handle `ERROR` (and `PROGRESS`) on the setup port in `src/content.ts:111`, and
   move the Escape binding out of `activate()` into `mount()` so the overlay is
   always dismissable. Add a timeout so a hung setup self-clears.
2. Give the island a close button, and stop relying on top-level document events
   for dismissal.
3. Decide deliberately about COOP/COEP: either keep the keys and validate the
   4-thread path, or drop them and keep `numThreads = 1`. Right now the manifest
   and the code comment disagree.
4. Call `chrome.offscreen.closeDocument()` (or wire up `destroy()`) on island
   teardown, and release the previous engine on switch.
5. Close the test gaps — the cheapest high-value one is a plain unit test on
   `EventsController` with `isPdf: true`, which needs no browser at all.
