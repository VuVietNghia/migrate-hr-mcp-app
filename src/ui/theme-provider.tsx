/** Studio theme state: follow the PrivOS host or use an explicit local palette. */
import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  normalizeStudioThemeMode,
  resolveStudioTheme,
  type StudioResolvedTheme,
  type StudioThemeMode,
} from './studio/studio-theme';

const THEME_STORAGE_KEY = 'theme-mode';

interface ThemeContextValue {
  mode: StudioThemeMode;
  resolved: StudioResolvedTheme;
  setMode: (mode: StudioThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  resolved: 'light',
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Host theme from Privos (via usePrivosContext().theme) */
  hostTheme: string;
}

export function ThemeProvider({ children, hostTheme }: ThemeProviderProps) {
  const [mode, setModeState] = useState<StudioThemeMode>(() => {
    try { return normalizeStudioThemeMode(localStorage.getItem(THEME_STORAGE_KEY)); }
    catch { return 'auto'; }
  });

  const setMode = useCallback((m: StudioThemeMode) => {
    setModeState(m);
    try {
      if (m === 'auto') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, m);
    } catch {}
  }, []);

  const resolved = resolveStudioTheme(mode, hostTheme);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Small theme toggle button */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const options: { value: StudioThemeMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'brand', label: 'Brand' },
  ];

  return (
    <div className="theme-toggle" role="group" aria-label="Giao diện">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`theme-toggle-btn ${mode === o.value ? 'active' : ''}`}
          aria-pressed={mode === o.value}
          onClick={() => setMode(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
