export type StudioThemeMode = 'auto' | 'light' | 'dark' | 'brand';

export type StudioResolvedTheme = Exclude<StudioThemeMode, 'auto'>;

const STUDIO_THEME_MODES: readonly StudioThemeMode[] = ['auto', 'light', 'dark', 'brand'];

export function normalizeStudioThemeMode(value: unknown): StudioThemeMode {
  return typeof value === 'string' && STUDIO_THEME_MODES.includes(value as StudioThemeMode)
    ? value as StudioThemeMode
    : 'auto';
}

export function resolveStudioTheme(mode: StudioThemeMode, hostTheme: string): StudioResolvedTheme {
  if (mode !== 'auto') return mode;
  return hostTheme === 'dark' || hostTheme === 'high-contrast' ? 'dark' : 'light';
}
