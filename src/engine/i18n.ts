export function localize(key: string, fallback: string): string {
  try {
    const msg = chrome?.i18n?.getMessage?.(key);
    return msg || fallback;
  } catch {
    return fallback;
  }
}
