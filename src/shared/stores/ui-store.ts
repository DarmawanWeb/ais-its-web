import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { BasemapId } from '@/shared/config/env';

export type ThemePreference = 'dark' | 'light' | 'system';

interface UiState {
  /** Theme preference; dark is the default of the operations console. */
  theme: ThemePreference;
  /** Desktop sidebar collapsed to icons. */
  sidebarCollapsed: boolean;
  /** Last basemap chosen on any map (null = configured default). */
  basemap: BasemapId | null;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setBasemap: (basemap: BasemapId) => void;
}

function systemPrefersLight(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches
  );
}

/**
 * Persisted UI preferences (localStorage key "ais-ui", read by public/theme-init.js before
 * the first paint). Only conveniences live here — never tokens or server data.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      basemap: null,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const current = get().theme;
        const resolved = current === 'system' ? (systemPrefersLight() ? 'light' : 'dark') : current;
        set({ theme: resolved === 'dark' ? 'light' : 'dark' });
      },
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setBasemap: (basemap) => set({ basemap }),
    }),
    {
      name: 'ais-ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, sidebarCollapsed, basemap }) => ({ theme, sidebarCollapsed, basemap }),
    },
  ),
);
