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

## UI design

Draw design inspiration from Google Material 3 and the Perplexity.ai UI.

## OCR engine

Lean on existing open-source libraries as much as possible instead of hand-rolling the engine.
When picking one, prefer libraries that are actively maintained on GitHub, ship TypeScript types, and support local inference inside a Chrome extension.
`ppu-paddle-ocr` is the current choice, not a fixed requirement: swap or add libraries when something fits those criteria better.
Avoid hand-rolled onnxruntime-web plumbing, custom preprocessing, and int8 quantization.
Write custom code only where no suitable library exists, such as SLANet_plus table structure.

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
