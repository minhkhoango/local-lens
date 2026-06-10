import { describe, it, expect } from 'vitest';
import { toEngineOption } from '@/types';

describe('toEngineOption', () => {
  it('passes valid engines through', () => {
    expect(toEngineOption('fast')).toBe('fast');
    expect(toEngineOption('structured')).toBe('structured');
  });

  it('coerces stale or invalid values to fast', () => {
    // 'tesseract' is a real-world stale chrome.storage value from pre-1.5.0
    // installs; it used to wedge the island on "Loading model...".
    expect(toEngineOption('tesseract')).toBe('fast');
    expect(toEngineOption('auto')).toBe('fast');
    expect(toEngineOption(undefined)).toBe('fast');
    expect(toEngineOption(null)).toBe('fast');
    expect(toEngineOption(42)).toBe('fast');
  });
});
