/**
 * OCR test images, discovered from disk.
 *
 * Each fixture is a pair of sibling files in tests/fixtures/images/:
 *
 *   <name>.png             the image to OCR
 *   <name>.expected.txt    one substring per line that must appear in the
 *                          recognized text (matched case-insensitively)
 *
 * Adding a fixture means dropping in those two files — no code change. A .png
 * without a matching .expected.txt is a hard error rather than a silently
 * unasserted test.
 */

const images = import.meta.glob('../fixtures/images/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const expectations = import.meta.glob('../fixtures/images/*.expected.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface TestImage {
  /** Fixture basename, e.g. 'typescript-code-dark'. Used as the test title. */
  name: string;
  /** Served URL of the .png, for fetchAsDataUrl(). */
  url: string;
  /** Substrings that must appear in the OCR output. */
  expected: string[];
}

export const TEST_IMAGES: TestImage[] = Object.entries(images)
  .map(([path, url]) => {
    const name = path.replace(/^.*\//, '').replace(/\.png$/, '');
    const raw = expectations[path.replace(/\.png$/, '.expected.txt')];
    if (raw === undefined) {
      throw new Error(
        `OCR fixture "${name}.png" has no sibling "${name}.expected.txt"`,
      );
    }
    const expected = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (expected.length === 0) {
      throw new Error(`OCR fixture "${name}.expected.txt" is empty`);
    }
    return { name, url, expected };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
