# v1.5.0 uninstall-bug reproductions

Standalone harnesses that drive the **real built extension** in a real headed
Chromium, exercising the paths `tests/e2e/` never takes.

These are diagnostic reproductions, not regression tests. They are deliberately
plain Node scripts rather than Playwright specs: each needs its own browser
profile and its own manifest variant, and each is meant to be watched.

## Running

They need a built `dist/`. To reproduce against shipped 1.5.0:

```bash
git worktree add ../ll-150 0bcd00e
cd ../ll-150 && npm install && npm run build
```

Then, from this repo:

```bash
# Linux without a display:
DIST_DIR=../ll-150/dist xvfb-run -a --server-args="-screen 0 1400x900x24" \
  node tests/repro/01-setup-overlay-lock.mjs
```

MV3 extensions do not load under classic headless, so the browser is always
launched headed — same constraint as `tests/e2e/helpers/extension.ts`.

| Env var | Default | Meaning |
| --- | --- | --- |
| `DIST_DIR` | `./dist` | Built extension under test |
| `REPRO_CHROME` | Playwright's bundled Chromium | Browser binary |
| `REPRO_PORT` | `5310` | Fixture server port (script 02) |

## The scripts

### `01-setup-overlay-lock.mjs` — the headline defect

`src/content.ts:111-121` handles only `DOWNLOAD` and `SETUP_DONE` on the setup
port, but `src/offscreen.ts:81-89` posts `ERROR` there when `initEngine()`
throws. The `ERROR` is discarded — and `GhostOverlay.activate()`
(`src/overlay.ts:137-142`) is the only place that binds pointer events *and* the
Escape key, so a failed setup leaves the structured engine's 40%-black
full-viewport overlay (`src/overlay.ts:112-113`) permanently on screen, banner
frozen at `"Loading model..."`, with Escape never wired up.

Case A runs healthy models to time the dark window; case B corrupts the layout
model to stand in for any real setup failure.

### `02-pdf-island-dismissal.mjs` — island dismissal on PDFs

All three island dismissal listeners (`src/island/behavior.ts:100-107`) sit on
the top-level document, which never sees events from inside Chrome's PDF plugin
process. The `isPdf` blur fallback is the only survivor — and `isPdf` is decided
by a filename sniff (`src/background.ts:202`), so a PDF served from an
extensionless endpoint loses even that.

Serves identical PDF bytes at `/report` and `/doc.pdf` to isolate the
difference.

### `03-cross-origin-isolation.mjs` — the COOP/COEP keys

v1.5.0 added `cross_origin_embedder_policy` / `cross_origin_opener_policy` to
the manifest while `src/offscreen.ts:23-33` states MV3 removed those keys and
uses that belief to justify `numThreads = 1`. Probes the shipped manifest
against the same build with the keys stripped.

## Fidelity and limitations

Faithful:

- Real built extension, real Chromium, real content-script injection, real
  overlay/island/offscreen message flow, real ONNX inference.
- `activateOverlay()` in `lib.mjs` mirrors `src/background.ts` step for step,
  including the `isPdf` argument that `tests/e2e/helpers/extension.ts:408`
  hardcodes to `false`.

Not faithful — read results with these in mind:

- **`host_permissions: ['<all_urls>']` replaces the `activeTab` grant**, which
  CDP automation cannot mint. Same as the existing e2e harness. The OCR pipeline
  is unchanged; only the permission source differs.
- **The trigger is a service-worker reproduction of `activateOverlay`, not a
  real toolbar click**, so `chrome.action.onClicked` and `classifyUrl()` are not
  themselves executed. Script 02 recomputes `classifyUrl`'s `isPdf` decision in
  `lib.mjs:classifyUrlIsPdf` and feeds it in.
- **Keyboard focus does not follow into the PDF plugin under CDP.** A real user
  who clicks the PDF loses Escape to the plugin; `page.keyboard.press` still
  reaches the top document. So script 02 *understates* how stuck a real user is.
- **Script 01 case B induces the setup failure** by corrupting the layout model.
  The failure *trigger* is synthetic; the failure *handling* — the missing
  `ERROR` case — is real 1.5.0 code and is what the script demonstrates.
- `tests/repro/fixtures/sample.pdf` is a hand-built minimal PDF, not a
  representative real-world document.
