'use client';

import { useEffect, useState } from 'react';
import { Moon, MousePointer, Move, Sun, Sunrise, Sunset, ZoomIn } from 'lucide-react';
import { useRoomStore, type CameraPreset, type TimeOfDay } from '@/stores/roomStore';
import { cn } from '@/lib/utils';

const TIMES: { id: TimeOfDay; label: string; icon: typeof Sun }[] = [
  { id: 'morning', label: 'Morning', icon: Sunrise },
  { id: 'afternoon', label: 'Noon', icon: Sun },
  { id: 'evening', label: 'Evening', icon: Sunset },
  { id: 'night', label: 'Night', icon: Moon },
];

const VIEWS: { id: CameraPreset; label: string }[] = [
  { id: 'eye-level', label: 'Eye level' },
  { id: 'corner', label: 'Corner' },
  { id: 'floor', label: 'Floor' },
  { id: 'wall', label: 'Wall' },
  { id: 'top', label: 'Top' },
];

const HINT_KEY = 'tv_viz_hint_seen';

/** On phones each row is its own pill; from sm up the rows merge into one outer pill. */
const group =
  'flex max-w-full items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-elevated backdrop-blur sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none';

const pill = (active: boolean) =>
  cn(
    'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium transition-colors sm:h-8 sm:px-3 md:max-lg:px-2.5',
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  );

/** Floating lighting + camera controls along the bottom of the 3D view. */
export function CanvasToolbar({ className }: { className?: string }) {
  const timeOfDay = useRoomStore((s) => s.timeOfDay);
  const setTimeOfDay = useRoomStore((s) => s.setTimeOfDay);
  const cameraPreset = useRoomStore((s) => s.cameraPreset);
  const setCameraPreset = useRoomStore((s) => s.setCameraPreset);

  // Navigation hint: shown on a viewer's first visit, then fades out.
  const [showHint, setShowHint] = useState(false);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia('(pointer: coarse)').matches);
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === '1';
    } catch {}
    if (seen) return;
    setShowHint(true);
    const t = setTimeout(() => {
      setShowHint(false);
      try {
        localStorage.setItem(HINT_KEY, '1');
      } catch {}
    }, 7000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2 px-4", className)}>
      <div
        className={cn(
          'flex items-center gap-4 rounded-full border border-border bg-card/90 px-4 py-1.5 text-2xs text-muted-foreground shadow-sm backdrop-blur transition-opacity duration-700',
          showHint ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden={!showHint}
      >
        <span className="flex items-center gap-1.5"><MousePointer className="h-3.5 w-3.5" /> Drag to rotate</span>
        <span className="flex items-center gap-1.5"><ZoomIn className="h-3.5 w-3.5" /> {touch ? 'Pinch to zoom' : 'Scroll to zoom'}</span>
        <span className="hidden items-center gap-1.5 sm:flex"><Move className="h-3.5 w-3.5" /> {touch ? 'Two fingers to pan' : 'Right-drag to pan'}</span>
      </div>

      <div className="pointer-events-auto flex w-full max-w-full flex-col items-center gap-1.5 sm:w-auto sm:flex-row sm:gap-1 sm:overflow-x-auto sm:rounded-full sm:border sm:border-border sm:bg-card/95 sm:p-1 sm:shadow-elevated sm:backdrop-blur sm:[scrollbar-width:none]">
        <div className={group}>
        {TIMES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTimeOfDay(t.id)}
              aria-pressed={timeOfDay === t.id}
              title={`${t.label} light`}
              className={pill(timeOfDay === t.id)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          );
        })}
        </div>
        <span className="mx-1 hidden h-5 w-px shrink-0 bg-border sm:block" />
        <div className={cn(group, 'overflow-x-auto [scrollbar-width:none] sm:overflow-visible')}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setCameraPreset(v.id)}
            aria-pressed={cameraPreset === v.id}
            className={pill(cameraPreset === v.id)}
          >
            {v.label}
          </button>
        ))}
        </div>
      </div>
    </div>
  );
}
