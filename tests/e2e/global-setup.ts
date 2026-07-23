import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Playwright global setup: guarantee a fresh, complete `dist/` before any e2e
 * test launches. The `pretest:e2e` npm script already runs `npm run build`, so
 * when the suite is started via `npm run test:e2e` this is a no-op verification.
 * When started directly (`npx playwright test`), this builds on demand so the
 * harness is self-sufficient. The paddle/structured models are cached under
 * public/, so the build's model-download step is a no-op.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Every artifact the extension needs at runtime — the entry bundles plus the
// bundled ONNX models. If any is missing the built extension cannot OCR, so we
// (re)build rather than launch a broken extension.
const REQUIRED_ARTIFACTS = [
  'dist/manifest.json',
  'dist/background.js',
  'dist/content.js',
  'dist/offscreen.js',
  'dist/offscreen.html',
  'dist/paddle_engine/PP-OCRv6_tiny_det.onnx',
  'dist/paddle_engine/PP-OCRv6_tiny_rec.onnx',
  'dist/paddle_engine/ppocrv6_tiny_dict.txt',
  'dist/structured_engine/PP-DocLayoutV3.onnx',
  'dist/structured_engine/SLANet_plus.onnx',
];

export default function globalSetup(): void {
  const missing = REQUIRED_ARTIFACTS.filter(
    (rel) => !existsSync(join(REPO_ROOT, rel)),
  );

  if (missing.length === 0) {
    console.log('[e2e-setup] dist/ is present and complete — skipping build.');
    return;
  }

  console.log(
    `[e2e-setup] building extension (missing ${missing.length} artifact(s), e.g. ${missing[0]})...`,
  );
  execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });

  const stillMissing = REQUIRED_ARTIFACTS.filter(
    (rel) => !existsSync(join(REPO_ROOT, rel)),
  );
  if (stillMissing.length > 0) {
    throw new Error(
      `[e2e-setup] build finished but these artifacts are still missing:\n  ${stillMissing.join('\n  ')}`,
    );
  }
  console.log('[e2e-setup] build complete.');
}
