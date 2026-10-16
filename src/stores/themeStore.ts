import { useLayoutEffect } from 'react';
import { create } from 'zustand';
import { saveTheme } from '@/actions/theme';

export type ThemeMode = 'dark' | 'light' | 'navy' | 'travertine' | 'emerald' | 'champagne' | 'slate' | 'charcoal' | 'ocean' | 'sage';

export const isDarkTheme = (theme: ThemeMode): boolean =>
  theme !== 'light' && theme !== 'travertine' && theme !== 'ocean' && theme !== 'sage';

export const isLightTheme = (theme: ThemeMode): boolean =>
  !isDarkTheme(theme);

/**
 * Each area keeps its own theme so changing one never affects another:
 *   admin – super admin dashboard (saved)
 *   shop  – shop dashboard and visualizer (saved separately for every shop)
 *   login – sign-in page: always dark, never saved
 */
export type ThemeScope = 'admin' | 'shop' | 'login';

const DEFAULT_THEME: ThemeMode = 'dark';
const LEGACY_KEY = 'tv_theme';
/** Remembers which account last used this browser, so the first paint can pick its cached theme. */
const activeKey = (scope: ThemeScope) => `tv_${scope}_active`;
const storageKey = (scope: ThemeScope, ownerId?: string) =>
  ownerId ? `tv_theme_${scope}_${ownerId}` : `tv_theme_${scope}`;

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'dark' || value === 'light' || value === 'navy' || value === 'travertine' ||
  value === 'emerald' || value === 'champagne' || value === 'slate' || value === 'charcoal' ||
  value === 'ocean' || value === 'sage';

const readSaved = (scope: ThemeScope, ownerId?: string): ThemeMode => {
  if (scope === 'login') return DEFAULT_THEME;
  try {
    // Older shared keys seed each shop once, then every shop diverges.
    const saved =
      localStorage.getItem(storageKey(scope, ownerId)) ??
      localStorage.getItem(storageKey(scope)) ??
      localStorage.getItem(LEGACY_KEY);
    return isThemeMode(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

/** Browser cache of the saved theme, so the next page load paints it straight away. */
const cache = (scope: ThemeScope, ownerId: string | undefined, theme: ThemeMode) => {
  if (scope === 'login') return;
  try {
    localStorage.setItem(storageKey(scope, ownerId), theme);
    if (ownerId) localStorage.setItem(activeKey(scope), ownerId);
  } catch {
    /* storage blocked: the theme still applies for this visit */
  }
};

/** The database is the source of truth; the cache above is only for speed. */
const persist = (scope: ThemeScope, ownerId: string | undefined, theme: ThemeMode) => {
  cache(scope, ownerId, theme);
  if (scope !== 'login' && ownerId) void saveTheme(ownerId, theme).catch(() => {});
};

interface ThemeState {
  theme: ThemeMode;
  scope: ThemeScope;
  /** Which shop (or admin) the saved theme belongs to. */
  ownerId?: string;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  /** Load the theme for an area. Call it from the area's page before showing theme controls. */
  initTheme: (scope: ThemeScope, ownerId?: string, savedTheme?: string | null) => void;
}

const applyThemeToDOM = (theme: ThemeMode) => {
  if (typeof window === 'undefined') return;

  // Set data-theme attribute on root <html>
  document.documentElement.setAttribute('data-theme', theme);

  // Manage dark/light base classes for Tailwind compatibility
  if (isDarkTheme(theme)) {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  scope: 'shop',
  ownerId: undefined,
  toggleTheme: () => {
    // Toggling switches between the primary daylight and obsidian themes
    get().setTheme(isDarkTheme(get().theme) ? 'light' : 'dark');
  },
  setTheme: (theme: ThemeMode) => {
    persist(get().scope, get().ownerId, theme);
    applyThemeToDOM(theme);
    set({ theme });
  },
  initTheme: (scope: ThemeScope, ownerId?: string, savedTheme?: string | null) => {
    if (typeof window === 'undefined') return;
    // A theme loaded from the account (database) wins over this browser's cache.
    const theme = isThemeMode(savedTheme ?? null) ? (savedTheme as ThemeMode) : readSaved(scope, ownerId);
    cache(scope, ownerId, theme);
    applyThemeToDOM(theme);
    set({ scope, ownerId, theme });
  },
}));

/** Use the theme that belongs to this area (admin / shop / login), and to this shop when given. */
export function useThemeScope(scope: ThemeScope, ownerId?: string, savedTheme?: string | null) {
  const initTheme = useThemeStore((s) => s.initTheme);
  // Layout effect: swap themes before paint when moving between areas (e.g. logout to login).
  useLayoutEffect(() => {
    initTheme(scope, ownerId, savedTheme);
  }, [initTheme, scope, ownerId, savedTheme]);
}
