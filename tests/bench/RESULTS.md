# PP-OCRv5 int8 vs fp32 — benchmark results

Branch: `bench/int8-eval` · headless Chromium (Playwright, swiftshader) · WASM SIMD threaded.

## Environment notes

- **WebGPU is not measurable here.** `isWebGpuAvailable()` returns true but
  ORT's WebGPU EP can't find the `com.ms.internal.nhwc:Conv:1` kernel under
  swiftshader, so every session declared `['webgpu', 'wasm']` falls back to
  WASM. Numbers labelled "WebGPU" are effectively the WASM path. In a real
  browser with a real GPU these conditions would be meaningful.
- **WASM runtime caches across sessions in one process.** Only the *first*
  engine load in the process pays the WASM init cost; subsequent loads look
  artificially fast. The fp32+WASM condition ran first, so its 1378ms
  engine-load is the only truly cold figure; the others (251–363ms) are
  partially warm.

## Parity (gates the default swap)

All three fixtures: **dist=0**, **identical confidence**, normalized text byte-equal.

```
[parity] Screenshot 2025-12-27 104306.png: dist=0 maxLen=189 ratio=0.000 fp32_conf=98 int8_conf=98
[parity] Screenshot 2025-12-30 140247.png: dist=0 maxLen=235 ratio=0.000 fp32_conf=98 int8_conf=98
[parity] Screenshot 2025-12-30 152450.png: dist=0 maxLen=650 ratio=0.000 fp32_conf=95 int8_conf=95
```

## FastEngine — first-call latency (cold) and steady-state (warm)

| condition                  | engine-load (first in process only) | first-call (cold) S1 / S2 / S3 | warm mean (n=3) S1 / S2 / S3 |
|----------------------------|-------------------------------------:|---------------------------------|-------------------------------|
| fp32 + WASM                | 1378 ms (truly cold)                 | 1557 / 1998 / 4338 ms           | 5 / 2 / 6 ms                  |
| int8 + WASM                | 251 ms (WASM warm)                   | 2 / 3 / 9 ms                    | 2 / 2 / 6 ms                  |
| fp32 + WebGPU→WASM         | 363 ms (WASM warm)                   | 2 / 2 / 6 ms                    | 1 / 2 / 5 ms                  |
| int8 + WebGPU→WASM         | 272 ms (WASM warm)                   | 2 / 2 / 7 ms                    | 2 / 3 / 5 ms                  |

S1 = `Screenshot 2025-12-27 104306.png` (12 KB), S2 = `140247.png` (35 KB),
S3 = `152450.png` (132 KB).

**Takeaway:** warm-state inference is bounded by image size, not by precision.
At steady state the four conditions are indistinguishable. The user-visible
first OCR after the extension loads is ~1.5–4 s on a cold WASM runtime
regardless of model precision.

## StructuredEngine — recognition precision swap

| condition  | engine-load | first-call (cold) | warm mean (n=2) |
|------------|------------:|------------------:|----------------:|
| fp32 rec   | 3944 ms     | 8171 ms           | 6363 ms         |
| int8 rec   | 1197 ms     | 6453 ms           | 6433 ms         |

Layout (PP-DocLayoutV3, 124 MB ONNX, WASM-only) dominates. Recognition is a
small fraction of the per-image cost. Int8 rec does not move the structured-
engine recognize() wall time.

## Model file sizes (on disk, post-fetch)

| file                                      | bytes      |
|-------------------------------------------|-----------:|
| PP-OCRv5_mobile_det_infer.ort             |  4,896,928 |
| en_PP-OCRv5_mobile_rec_infer.ort (fp32)   |  7,962,368 |
| en_PP-OCRv5_mobile_rec_infer_int8.ort     |  7,133,720 |
| ppocrv5_en_dict.txt                       |      1,417 |
| PP-DocLayoutV3.onnx                       |129,920,689 |

Int8 saves 828,648 bytes (~10%) versus fp32.

## Decision

**Promote int8 to default for both engines.**

- Byte-identical OCR output across all three fixtures (edit distance = 0)
- Byte-identical confidence
- Smaller bundle (~830 KB savings)
- No measurable downside in either steady-state or cold-start inference

**Steady-state inference does not improve** with int8 in either engine. The
honest pitch is: "int8 default is justified by parity + file size; no
measurable speed change at warm steady state, and cold-load numbers across
conditions aren't cleanly comparable because ORT initializes WASM once per
process." The structured engine in particular gains nothing — layout
dominates (6363 → 6433 ms is noise).

## Limitations

- Parity is established on **three small high-contrast English UI
  screenshots, 12–132 KB**. Quantization regressions typically surface on
  dense text, low-contrast scans, unusual fonts, or rare-character languages
  — none of which our fixtures contain. The `recognition-parity.test.ts`
  gate will only catch future regressions if fixtures with those properties
  are added.
- WebGPU is not measurable in headless swiftshader; the engine's fallback to
  WASM is what actually ran. On real GPUs the WebGPU path should be retested.
- Cold-call latency for non-first conditions is artificially low because
  ORT's WASM runtime is process-global and already initialized.

## How to reproduce

```bash
npm run prebuild:models          # downloads both fp32 and int8 .ort
npm run test:bench               # full timing tests
npm run test:bench-parity        # accuracy parity only
```
