import img1 from '../../test_pictures/Screenshot 2025-12-27 104306.png?url';
import img2 from '../../test_pictures/Screenshot 2025-12-30 140247.png?url';
import img3 from '../../test_pictures/Screenshot 2025-12-30 152450.png?url';

export interface TestImage {
  name: string;
  url: string;
  expectedKey: string;
}

export const TEST_IMAGES: TestImage[] = [
  { name: 'Screenshot 2025-12-27 104306.png', url: img1, expectedKey: 'screenshot-2025-12-27-104306' },
  { name: 'Screenshot 2025-12-30 140247.png', url: img2, expectedKey: 'screenshot-2025-12-30-140247' },
  { name: 'Screenshot 2025-12-30 152450.png', url: img3, expectedKey: 'screenshot-2025-12-30-152450' },
];

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
