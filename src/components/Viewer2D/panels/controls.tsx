'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** A labelled range input with its current value on the right. */
export function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={cn('block', disabled && 'opacity-50')}>
      <span className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer accent-primary"
      />
    </label>
  );
}

/** A row of mutually exclusive small buttons. */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            title={o.title}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-8 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A number box that lets you type freely (including an empty box while you retype) and only commits a valid,
 * in-range value when you leave it or press Enter.
 */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  suffix,
  label,
  onCommit,
  className,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  label: string;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(Math.round(value * 100) / 100));
  }, [value, focused]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
    else setText(String(value));
  };
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn('ds-field py-1.5 text-center tabular-nums', suffix && 'pr-9')}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground">{suffix}</span>}
    </label>
  );
}
