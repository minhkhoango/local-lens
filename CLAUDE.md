# Local Lens

Privacy-first Chrome/Brave MV3 extension that OCRs a selected screen region entirely on-device.
Stack: TypeScript (strict), React 19, Vite 7, Vitest 4, Playwright, onnxruntime-web, ppu-paddle-ocr.
Entry points: `src/background.ts`, `src/content.ts`, `src/offscreen.ts`, `src/overlay.ts`, `src/engine/`, `src/island/`.

## Git

Implement big changes in a git worktree, or at minimum on a dedicated branch.
Never leave substantial work uncommitted on `main`.
Branch early with `git switch -c`, commit in logical chunks, and delete the worktree once it is merged.
Do not push or merge without asking first.
When multiple agents touch overlapping files in parallel, give each one its own worktree.

## Engineering standards

When making technical decisions, do not give much weight to development cost.
Prefer quality, simplicity, robustness, scalability, and long term maintainability.

When fixing a bug, always start by reproducing it in an end-to-end setting as closely aligned as possible with how a real end user hits it.
Only then write the fix.
Reproducing first is what confirms you found the real problem, so the fix actually solves it.

Lint errors, test failures, and test flakiness are always in scope.
If you see one, get it fixed even when it was not caused by what you are working on right now.

## UI quality

When end-to-end testing the product, be picky about the UI you see and obsessed with pixel perfection.
If something clearly looks off, even if it is not directly related to what you are doing, get it fixed along the way.

## OCR engine

Lean on the `ppu-paddle-ocr` library as much as possible.
Avoid hand-rolled onnxruntime-web plumbing, custom preprocessing, and int8 quantization.
Write custom code only where the library genuinely has no support, such as SLANet_plus table structure.

## Commands

```bash
npm run build            # tsc + three Vite builds (background, content, offscreen) into dist/
npm test                 # Vitest unit tests
npm run test:structured  # structured-engine suite
npm run test:e2e         # Playwright, real browser extension harness (runs build first)
npm run test:bench       # benchmarks (downloads models first)
```

E2E browser selection: Brave via `E2E_EXECUTABLE_PATH`, Chrome via `E2E_CHANNEL=chrome`.
After a dependency change, the first Vitest run may need `rm -rf node_modules/.vite`.

## Long-running commands

Give any long command (npm install, build, model download) a roughly 10 minute budget.
If it has made no visible progress by then, kill it and debug instead of waiting it out.
A stall that long almost always means a real problem such as a lockfile conflict, a peer-dep resolution loop, a wedged postinstall, or a host blocked by the network sandbox.
