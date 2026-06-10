'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

export type Theme = 'light' | 'dim' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark'; // for Tailwind dark: variant
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  resolvedTheme: 'dark',
});

const STORAGE_KEY = 'osint-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dim' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return 'dark';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Set data-theme attribute for CSS variable switching
  root.setAttribute('data-theme', theme);

  // Manage Tailwind's .dark class for dark: variant
  // Both 'dim' and 'dark' use the .dark class so dark: variants apply
  if (theme === 'light') {
    root.classList.remove('dark');
  } else {
    root.classList.add('dark');
  }

  // Add transition class for smooth switching, remove after animation
  root.classList.add('theme-transition');
  const timer = setTimeout(() => {
    root.classList.remove('theme-transition');
  }, 400);

  return () => clearTimeout(timer);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount (client-side only)
  useEffect(() => {
    const initial = getInitialTheme();
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch { /* ignore */ }
  }, []);

  // Prevent flash of wrong theme by not rendering until mounted
  const resolvedTheme: 'light' | 'dark' = theme === 'light' ? 'light' : 'dark';

  if (!mounted) {
    // Return children with dark theme default to avoid flash
    return (
      <ThemeContext.Provider value={{ theme: 'dark', setTheme: () => {}, resolvedTheme: 'dark' }}>
        {children}
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/**
 * Inline script to prevent FOUC (Flash of Unstyled Content).
 * Must be placed in <head> before any rendering.
 */
export function ThemeScript() {
  const script = `
    (function() {
      try {
        var theme = localStorage.getItem('${STORAGE_KEY}');
        if (theme === 'light' || theme === 'dim' || theme === 'dark') {
          document.documentElement.setAttribute('data-theme', theme);
          if (theme !== 'light') {
            document.documentElement.classList.add('dark');
          }
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.classList.add('dark');
        }
      } catch(e) {}
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
