'use client';

import React from 'react';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import {
  Sun,
  Moon,
  Compass,
  Sparkles,
  Crown,
  Layers,
  Palette,
  Waves,
  Leaf,
  Contrast,
  Layers3,
  Check,
} from 'lucide-react';

export interface ThemeDefinition {
  id: ThemeMode;
  name: string;
  category: 'Dark' | 'Light';
  badge: string;
  description: string;
  accentColor: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  colors: {
    bg: string;
    sidebar: string;
    card: string;
    border: string;
    accent: string;
    text: string;
  };
}

export const AVAILABLE_THEMES: ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Studio Obsidian',
    category: 'Dark',
    badge: 'Pro Dark',
    description: 'Deep matte obsidian (#0B0C0E) optimized for low glare & high focus.',
    accentColor: '#FFFFFF',
    icon: Moon,
    colors: {
      bg: '#0B0C0E',
      sidebar: '#111215',
      card: '#15161A',
      border: '#262626',
      accent: '#FFFFFF',
      text: '#F3F4F6',
    },
  },
  {
    id: 'light',
    name: 'Neo-Minimal Light',
    category: 'Light',
    badge: 'Daylight',
    description: 'Clean daylight interface with pure white cards and obsidian accents.',
    accentColor: '#0A0A0C',
    icon: Sun,
    colors: {
      bg: '#F0F2F6',
      sidebar: '#FFFFFF',
      card: '#FFFFFF',
      border: '#E5E7EB',
      accent: '#0A0A0C',
      text: '#101216',
    },
  },
  {
    id: 'navy',
    name: 'Midnight Sapphire',
    category: 'Dark',
    badge: 'Executive',
    description: 'Executive deep slate navy with electric cyan and sapphire highlights.',
    accentColor: '#38BDF8',
    icon: Compass,
    colors: {
      bg: '#070D19',
      sidebar: '#0B1326',
      card: '#0F1B36',
      border: '#1E2E4E',
      accent: '#38BDF8',
      text: '#F0F6FC',
    },
  },
  {
    id: 'travertine',
    name: 'Warm Travertine',
    category: 'Light',
    badge: 'Ceramic Warm',
    description: 'Architectural warm limestone & clay palette tailored for ceramic studios.',
    accentColor: '#854D0E',
    icon: Layers,
    colors: {
      bg: '#F5F2EB',
      sidebar: '#FAF8F4',
      card: '#FFFFFF',
      border: '#E6DFD5',
      accent: '#854D0E',
      text: '#292524',
    },
  },
  {
    id: 'emerald',
    name: 'Imperial Emerald',
    category: 'Dark',
    badge: 'Prestige',
    description: 'Opulent deep spruce & forest botanical tones with mint glow accents.',
    accentColor: '#10B981',
    icon: Sparkles,
    colors: {
      bg: '#04130F',
      sidebar: '#071C17',
      card: '#0B2821',
      border: '#144237',
      accent: '#10B981',
      text: '#ECFDF5',
    },
  },
  {
    id: 'champagne',
    name: 'Carbon & Champagne',
    category: 'Dark',
    badge: 'Luxury Gold',
    description: 'Anthracite graphite matrix with rich warm champagne gold accents.',
    accentColor: '#F59E0B',
    icon: Crown,
    colors: {
      bg: '#0E0E10',
      sidebar: '#141416',
      card: '#1B1B1E',
      border: '#2E2D32',
      accent: '#F59E0B',
      text: '#FAFAF9',
    },
  },
  {
    id: 'slate',
    name: 'Graphite Indigo',
    category: 'Dark',
    badge: 'Modern Dark',
    description: 'Neutral graphite surfaces with a calm indigo accent for focused daily work.',
    accentColor: '#5A5FED',
    icon: Layers3,
    colors: {
      bg: '#101318',
      sidebar: '#0C0E13',
      card: '#191C24',
      border: '#2A2E37',
      accent: '#5A5FED',
      text: '#F3F5F7',
    },
  },
  {
    id: 'charcoal',
    name: 'Charcoal Teal',
    category: 'Dark',
    badge: 'Clean Dark',
    description: 'Soft charcoal with a crisp teal accent. Easy on the eyes, still sharp.',
    accentColor: '#1ABCAA',
    icon: Contrast,
    colors: {
      bg: '#131516',
      sidebar: '#0E1011',
      card: '#1C1F21',
      border: '#2E3133',
      accent: '#1ABCAA',
      text: '#F4F6F6',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Blue',
    category: 'Light',
    badge: 'Fresh Light',
    description: 'Bright, airy workspace with cool blue-grey surfaces and a confident blue accent.',
    accentColor: '#2463EB',
    icon: Waves,
    colors: {
      bg: '#F2F4F8',
      sidebar: '#F8FAFC',
      card: '#FFFFFF',
      border: '#DFE5EC',
      accent: '#2463EB',
      text: '#0F1729',
    },
  },
  {
    id: 'sage',
    name: 'Soft Sage',
    category: 'Light',
    badge: 'Calm Light',
    description: 'Quiet green-grey light theme with a deep green accent, gentle on long sessions.',
    accentColor: '#1A7554',
    icon: Leaf,
    colors: {
      bg: '#F0F4F2',
      sidebar: '#F6F9F7',
      card: '#FFFFFF',
      border: '#DAE2DE',
      accent: '#1A7554',
      text: '#13201C',
    },
  },
];

interface ThemeSelectorProps {
  className?: string;
  showTitle?: boolean;
}

export function ThemeSelector({ className = '', showTitle = true }: ThemeSelectorProps) {
  const { theme, setTheme } = useThemeStore();
  const activeThemeDef = AVAILABLE_THEMES.find((t) => t.id === theme) || AVAILABLE_THEMES[0];

  return (
    <section
      className={`rounded-3xl bg-card p-6 sm:p-7 shadow-card border border-border ${className}`}
    >
      {showTitle && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-muted border border-input flex items-center justify-center text-foreground shrink-0">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Dashboard Appearance & Theme
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose your visual style. Changes apply across the whole dashboard instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-muted border border-input text-foreground/80 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: activeThemeDef.accentColor }}
              />
              <span>Active: <strong className="text-foreground">{activeThemeDef.name}</strong></span>
              <span className="text-2xs uppercase font-bold text-muted-foreground">({activeThemeDef.category})</span>
            </span>
          </div>
        </div>
      )}

      {/* Compact 6-Theme Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {AVAILABLE_THEMES.map((t) => {
          const isActive = theme === t.id;
          const IconComponent = t.icon;

          return (
            <div
              key={t.id}
              onClick={() => setTheme(t.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTheme(t.id);
                }
              }}
              className={`group relative rounded-2xl p-3.5 border-2 transition-all duration-200 cursor-pointer flex flex-col justify-between select-none ${
                isActive
                  ? 'shadow-md scale-[1.01]'
                  : 'border-border hover:border-input hover:scale-[1.005]'
              }`}
              style={{
                borderColor: isActive ? t.accentColor : undefined,
                backgroundColor: isActive
                  ? t.category === 'Dark' ? '#141518' : '#FAFAFA'
                  : undefined,
              }}
            >
              {/* Compact Visual Preview Banner */}
              <div
                className="w-full h-14 rounded-xl border p-2 flex gap-2 overflow-hidden shadow-inner mb-3 transition-transform group-hover:scale-[1.01]"
                style={{
                  backgroundColor: t.colors.bg,
                  borderColor: t.colors.border,
                }}
              >
                {/* Mini Sidebar */}
                <div
                  className="w-6 h-full rounded-lg border flex flex-col items-center py-1 gap-1 shrink-0"
                  style={{
                    backgroundColor: t.colors.sidebar,
                    borderColor: t.colors.border,
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-xs"
                    style={{ backgroundColor: t.colors.accent }}
                  />
                  <div
                    className="w-3 h-1.5 rounded-xs opacity-40"
                    style={{ backgroundColor: t.colors.text }}
                  />
                  <div
                    className="w-3 h-1.5 rounded-xs opacity-40"
                    style={{ backgroundColor: t.colors.text }}
                  />
                </div>

                {/* Mini Content Area */}
                <div className="flex-1 flex flex-col gap-1.5 justify-between">
                  {/* Mini Header */}
                  <div
                    className="h-2.5 rounded-xs w-1/2 opacity-70"
                    style={{ backgroundColor: t.colors.card, border: `1px solid ${t.colors.border}` }}
                  />
                  {/* Mini 3 Cards */}
                  <div className="grid grid-cols-3 gap-1 h-5">
                    <div
                      className="rounded-xs border flex items-center justify-center p-0.5"
                      style={{ backgroundColor: t.colors.card, borderColor: t.colors.border }}
                    >
                      <div className="w-full h-1 rounded-xs opacity-60" style={{ backgroundColor: t.colors.text }} />
                    </div>
                    <div
                      className="rounded-xs border flex items-center justify-center p-0.5"
                      style={{ backgroundColor: t.colors.card, borderColor: t.colors.border }}
                    >
                      <div className="w-full h-1 rounded-xs opacity-60" style={{ backgroundColor: t.colors.text }} />
                    </div>
                    <div
                      className="rounded-xs flex items-center justify-center p-0.5"
                      style={{ backgroundColor: t.colors.accent }}
                    >
                      <div
                        className="w-full h-1 rounded-xs"
                        style={{ backgroundColor: t.category === 'Dark' ? '#000' : '#fff' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Theme Identity & Info */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <IconComponent
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: t.accentColor }}
                    />
                    <h4 className="text-xs font-bold text-foreground truncate">
                      {t.name}
                    </h4>
                  </div>

                  <span
                    className="text-2xs font-semibold uppercase px-1.5 py-0.5 rounded-lg shrink-0 border"
                    style={{
                      borderColor: t.colors.border,
                      backgroundColor: t.colors.card,
                      color: t.accentColor,
                    }}
                  >
                    {t.badge}
                  </span>
                </div>

                {/* Color Palette Swatches */}
                <div className="flex items-center gap-1 py-0.5">
                  <span className="text-2xs text-muted-foreground font-bold uppercase tracking-wider mr-1">
                    Palette:
                  </span>
                  <span
                    title="Background"
                    className="h-3 w-3 rounded-full border border-neutral-600/40 shadow-xs"
                    style={{ backgroundColor: t.colors.bg }}
                  />
                  <span
                    title="Sidebar"
                    className="h-3 w-3 rounded-full border border-neutral-600/40 shadow-xs"
                    style={{ backgroundColor: t.colors.sidebar }}
                  />
                  <span
                    title="Surface Card"
                    className="h-3 w-3 rounded-full border border-neutral-600/40 shadow-xs"
                    style={{ backgroundColor: t.colors.card }}
                  />
                  <span
                    title="Accent Highlight"
                    className="h-3 w-3 rounded-full border border-neutral-600/40 shadow-xs ring-1 ring-ring"
                    style={{ backgroundColor: t.colors.accent }}
                  />
                </div>

                <p className="text-2xs text-muted-foreground leading-tight line-clamp-2">
                  {t.description}
                </p>
              </div>

              {/* Bottom Action Button */}
              <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
                <span className="text-2xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t.category} Theme
                </span>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTheme(t.id);
                  }}
                  className={`px-3 py-1 rounded-full text-2xs font-bold tracking-wide flex items-center gap-1 transition-all cursor-pointer ${
                    isActive
                      ? 'shadow-xs font-bold'
                      : 'bg-secondary hover:bg-accent text-muted-foreground'
                  }`}
                  style={{
                    backgroundColor: isActive ? t.accentColor : undefined,
                    color: isActive
                      ? t.category === 'Dark' ? '#0A0A0C' : '#FFFFFF'
                      : undefined,
                  }}
                >
                  {isActive ? (
                    <>
                      <Check className="h-3 w-3 stroke-[3]" />
                      <span>Active</span>
                    </>
                  ) : (
                    <span>Select</span>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
