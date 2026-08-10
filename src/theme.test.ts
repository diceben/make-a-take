import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('honours an explicit choice over the system preference', () => {
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
  });

  it('follows the system when nothing was chosen', () => {
    expect(resolveTheme(null, true)).toBe('light');
    expect(resolveTheme(null, false)).toBe('dark');
  });

  it('falls back to dark for unusable stored values', () => {
    expect(resolveTheme('', false)).toBe('dark');
    expect(resolveTheme('carbon', false)).toBe('dark');
  });
});
