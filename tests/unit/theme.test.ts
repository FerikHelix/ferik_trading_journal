import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme } from '../../src/lib/theme';

describe('theme preference', () => {
  it('resolves explicit and system preferences predictably', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('only accepts supported persisted values', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('night')).toBe(false);
  });
});
