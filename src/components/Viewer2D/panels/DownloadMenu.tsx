'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadBlob, slug } from '../savedDesigns';
import type { StageHandle } from '../Stage';
import { useViz2D } from '../store';

interface DownloadMenuProps {
  stage: React.RefObject<StageHandle | null>;
  /** The room's name, which names the downloaded file. */
  roomName: string;
  disabled?: boolean;
  /** Opens the Save panel, where the quotation PDF and the rest of the export options are. */
  onMore?: () => void;
}

/** The toolbar's quick download: the finished picture at the photo's size, as a JPG or a lossless PNG. */
export function DownloadMenu({ stage, roomName, disabled, onMore }: DownloadMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | 'jpg' | 'png'>(null);
  const root = useRef<HTMLDivElement>(null);

  // Closes on a click anywhere else, and on Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = async (type: 'image/jpeg' | 'image/png') => {
    const kind = type === 'image/png' ? 'png' : 'jpg';
    setOpen(false);
    setBusy(kind);
    try {
      const handle = stage.current;
      if (!handle) throw new Error('The room is not ready yet.');
      downloadBlob(await handle.exportImage(type, 0.92), `${slug(roomName)}-tiled.${kind}`);
      useViz2D.getState().notify('The picture was saved to your downloads.', 'success');
    } catch (e) {
      useViz2D.getState().notify(e instanceof Error && e.message ? e.message : 'The picture could not be saved.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const item = 'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn('ds-btn shrink-0 w-8 h-8 sm:w-auto sm:h-9 px-0 sm:px-3', open ? 'ds-btn-primary' : 'ds-btn-outline')}
        title="Download the picture"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        <span className="hidden sm:inline">Download</span>
        <ChevronDown className={cn('hidden h-3.5 w-3.5 transition-transform sm:block', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" aria-label="Download" className="absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-border bg-card p-1.5 shadow-elevated">
          <button type="button" role="menuitem" className={item} onClick={() => void save('image/jpeg')} autoFocus>
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              Picture (JPG)
              <span className="block text-2xs font-normal text-muted-foreground">Small file, good for sharing</span>
            </span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => void save('image/png')}>
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              Picture (PNG)
              <span className="block text-2xs font-normal text-muted-foreground">Lossless, larger file</span>
            </span>
          </button>
          {onMore && (
            <>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                className={item}
                onClick={() => {
                  setOpen(false);
                  onMore();
                }}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  Quotation PDF and more
                  <span className="block text-2xs font-normal text-muted-foreground">Save, price and print the design</span>
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
