'use client';

import React, { useEffect, useState } from 'react';
import { useThemeStore, isDarkTheme, type ThemeScope } from '@/stores/themeStore';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ scope = 'login', ownerId, className = '', iconOnly = false }: { scope?: ThemeScope; ownerId?: string; className?: string; iconOnly?: boolean }) {
  const { theme, toggleTheme, initTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initTheme(scope, ownerId);
    setMounted(true);
  }, [initTheme, scope, ownerId]);

  if (!mounted) {
    return (
      <div className={`h-9 ${iconOnly ? 'w-9' : 'w-[78px]'} rounded-full border border-border bg-muted ${className}`} />
    );
  }

  const isDark = isDarkTheme(theme);

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`ds-btn ds-btn-outline ${iconOnly ? 'w-9 px-0' : 'px-3.5'} ${className}`}
      title={`Switch to ${isDark ? 'Light' : 'Dark'} Theme`}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <>
          <Sun className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
          {!iconOnly && <span>Light</span>}
        </>
      ) : (
        <>
          <Moon className={iconOnly ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
          {!iconOnly && <span>Dark</span>}
        </>
      )}
    </button>
  );
}
