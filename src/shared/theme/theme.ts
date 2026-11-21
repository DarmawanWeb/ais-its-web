import { useEffect, useSyncExternalStore } from 'react';

import { type ThemePreference, useUiStore } from '@/shared/stores/ui-store';

export type ResolvedTheme = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

function subscribeSystem(callback: () => void): () => void {
  const media = window.matchMedia?.(LIGHT_QUERY);
  media?.addEventListener('change', callback);
  return () => media?.removeEventListener('change', callback);
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(LIGHT_QUERY).matches ? 'light' : 'dark';
}

export function resolveTheme(preference: ThemePreference, system: ResolvedTheme): ResolvedTheme {
  return preference === 'system' ? system : preference;
}

/** The effective theme (dark or light), following the system when the preference is "system". */
export function useResolvedTheme(): ResolvedTheme {
  const preference = useUiStore((state) => state.theme);
  const system = useSyncExternalStore(subscribeSystem, systemTheme, () => 'dark' as const);
  return resolveTheme(preference, system);
}

/** Applies the theme class to <html>; mounted once by the app providers. */
export function ThemeSync(): null {
  const theme = useResolvedTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#070d17' : '#f5f8fc');
  }, [theme]);
  return null;
}
