import { describe, expect, it } from 'vitest';
import {
  normalizeStudioThemeMode,
  resolveStudioTheme,
} from '../src/ui/studio/studio-theme';

describe('Studio theme preference normalization', () => {
  it.each([null, undefined, '', 'sepia', {}, 42])(
    'falls back to auto for invalid stored value %j',
    (value) => {
      expect(normalizeStudioThemeMode(value)).toBe('auto');
    },
  );

  it.each(['auto', 'light', 'dark', 'brand'] as const)(
    'keeps supported mode %s',
    (mode) => {
      expect(normalizeStudioThemeMode(mode)).toBe(mode);
    },
  );
});

describe('Studio theme resolution', () => {
  it('follows dark and high-contrast host themes in auto mode', () => {
    expect(resolveStudioTheme('auto', 'dark')).toBe('dark');
    expect(resolveStudioTheme('auto', 'high-contrast')).toBe('dark');
  });

  it('falls back to light for every other host theme in auto mode', () => {
    expect(resolveStudioTheme('auto', 'light')).toBe('light');
    expect(resolveStudioTheme('auto', 'unknown')).toBe('light');
  });

  it('keeps explicit light, dark and brand choices independent of the host', () => {
    expect(resolveStudioTheme('light', 'dark')).toBe('light');
    expect(resolveStudioTheme('dark', 'light')).toBe('dark');
    expect(resolveStudioTheme('brand', 'dark')).toBe('brand');
    expect(resolveStudioTheme('brand', 'light')).toBe('brand');
  });
});
