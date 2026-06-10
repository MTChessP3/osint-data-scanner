'use client';

import { useTheme, type Theme } from '@/components/theme-provider';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useEffect, useState } from 'react';

const themes: { value: Theme; label: string; description: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', description: 'Fondo claro, ideal para ambientes iluminados', icon: Sun },
  { value: 'dim', label: 'Intermedio', description: 'Azul noche, reduce fatiga visual', icon: Monitor },
  { value: 'dark', label: 'Oscuro', description: 'Negro profundo, optimizado para OLED', icon: Moon },
];

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Return placeholder to avoid hydration mismatch
    return (
      <div className="flex items-center gap-1 p-1 rounded-lg bg-app-surface-deep border border-app-border">
        {themes.map(t => (
          <div
            key={t.value}
            className="w-8 h-8 rounded-md bg-app-surface-hover"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-app-surface-deep border border-app-border">
      {themes.map(t => {
        const Icon = t.icon;
        const isActive = theme === t.value;
        return (
          <button
            key={t.value}
            onClick={() => setTheme(t.value)}
            title={t.description}
            className={`
              relative flex items-center justify-center w-8 h-8 rounded-md
              transition-all duration-200 group
              ${isActive
                ? 'bg-app-surface-active text-blue-400 shadow-sm'
                : 'text-app-text-muted hover:text-app-text-dim hover:bg-app-surface-hover'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            {/* Tooltip */}
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 text-[10px] font-medium
              bg-app-surface text-app-text border border-app-border rounded shadow-lg
              whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {t.label}
            </span>
            {/* Active indicator dot */}
            {isActive && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact dropdown version for the header/settings area
 */
export function ThemeSelectorDropdown() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const currentTheme = themes.find(t => t.value === theme) || themes[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-app-surface-deep border border-app-border
          text-app-text-dim hover:text-app-text hover:bg-app-surface-hover transition-colors text-xs"
      >
        <CurrentIcon className="w-3.5 h-3.5" />
        <span>{currentTheme.label}</span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-1 w-56 bg-app-surface border border-app-border
            rounded-lg shadow-xl z-50 overflow-hidden">
            {themes.map(t => {
              const Icon = t.icon;
              const isActive = theme === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => { setTheme(t.value); setOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                    ${isActive
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-app-text-dim hover:bg-app-surface-hover hover:text-app-text'
                    }
                  `}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{t.label}</p>
                    <p className="text-[10px] text-app-text-muted">{t.description}</p>
                  </div>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
