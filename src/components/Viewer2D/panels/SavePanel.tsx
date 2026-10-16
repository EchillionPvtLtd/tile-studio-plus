'use client';

import React, { useMemo, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, Printer, Save, Trash2 } from 'lucide-react';
import { buildGroups } from '@/lib/viz2d/design';
import { buildQuote2D } from '@/lib/viz2d/quote2d';
import { roomKindLabel } from '@/lib/viz2d/roomKinds';
import { WASTAGE } from '@/lib/quotation';
import { downloadQuotationPdf, printQuotationPdf, type QuotationPdfInput, type ShopProfile } from '@/lib/quotationPdf';
import type { Design, RoomScene } from '@/lib/viz2d/types';
import { GROUT_COLORS, TILE_LAYOUT_OPTIONS } from '@/types/tile';
import { formatLKR } from '@/lib/utils';
import { EmptyState } from '@/components/dashboard';
import { Section } from '@/components/Visualizer/Section';
import { addSavedDesign, blobToDataUrl, downloadBlob, listSavedDesigns, newId, removeSavedDesign, slug, type SavedDesign2D } from '../savedDesigns';
import type { StageHandle } from '../Stage';
import { MAX_PHOTO_SIDE } from '../roomLoader';
import { currentDesign, useViz2D } from '../store';

export interface RemoteSaveResult {
  success: boolean;
  message?: string;
}

interface SavePanelProps {
  room: RoomScene;
  stage: React.RefObject<StageHandle | null>;
  shop: ShopProfile | null;
  /** Records the design in the showroom's account (the dashboard's design count). Absent when there is no signed-in showroom. */
  onSaveRemote?: (input: { roomId: string; design: Design; thumbnail: string; name: string }) => Promise<RemoteSaveResult>;
  onOpenDesign: (saved: SavedDesign2D) => void;
  onBrowse: () => void;
  /** Whether the picture (JPG / PNG) buttons are shown; the showroom decides in its settings. */
  allowPictureDownload?: boolean;
}

const quoteNumber = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Q${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

export function SavePanel({ room, stage, shop, onSaveRemote, onOpenDesign, onBrowse, allowPictureDownload = true }: SavePanelProps) {
  const design = useViz2D(currentDesign);
  const notify = useViz2D((s) => s.notify);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'jpg' | 'png' | 'pdf' | 'print'>(null);
  const [saved, setSaved] = useState<SavedDesign2D[]>(() => (typeof window === 'undefined' ? [] : listSavedDesigns()));

  const quote = useMemo(() => buildQuote2D(room, design), [room, design]);
  const finishes = useMemo(() => {
    const notes: string[] = [];
    for (const g of buildGroups(room)) {
      const s = design.surfaces[g.id];
      if (!s?.tile) continue;
      const layout = TILE_LAYOUT_OPTIONS.find((l) => l.key === s.layout)?.label ?? s.layout;
      const grout = GROUT_COLORS.find((c) => c.hex.toLowerCase() === s.groutColor.toLowerCase())?.name ?? 'custom colour';
      notes.push(`${g.name}: ${s.tile.name}, ${layout} pattern, ${s.tileWidthMm} x ${s.tileHeightMm} mm tiles, grout ${s.groutMm} mm ${grout}.`);
    }
    return notes;
  }, [room, design]);
  const tiled = quote.lines.length > 0;

  const defaultName = `${room.name} · ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`;

  const withBusy = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      notify(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const saveDesign = () =>
    withBusy('save', async () => {
      const handle = stage.current;
      if (!handle) throw new Error('The room is not ready yet');
      const title = name.trim() || defaultName;
      const thumbnail = await handle.thumbnail(480, 0.78);
      const entry: SavedDesign2D = { id: newId(), name: title, roomId: room.id, roomName: room.name, roomImage: room.image.src, savedAt: Date.now(), thumbnail, design };
      const kept = addSavedDesign(entry);
      setSaved(listSavedDesigns());
      let remote = '';
      if (onSaveRemote) {
        try {
          const res = await onSaveRemote({ roomId: room.id, design, thumbnail, name: title });
          remote = res.success ? ' It is also recorded in your showroom account.' : ` It could not be recorded in your showroom account${res.message ? `: ${res.message}` : '.'}`;
        } catch {
          remote = ' It could not be recorded in your showroom account.';
        }
      }
      notify(kept ? `Saved “${title}” on this device.${remote}` : `Your browser has no room left to keep this design.${remote}`, kept ? 'success' : 'error');
      setName('');
    });

  const downloadPicture = (type: 'image/jpeg' | 'image/png') =>
    withBusy(type === 'image/jpeg' ? 'jpg' : 'png', async () => {
      const blob = await stage.current!.exportImage(type, 0.92);
      downloadBlob(blob, `${slug(room.name)}-tiled.${type === 'image/png' ? 'png' : 'jpg'}`);
    });

  const makePdf = (kind: 'pdf' | 'print') =>
    withBusy(kind, async () => {
      const now = new Date();
      const blob = await stage.current!.exportImage('image/jpeg', 0.9);
      const input: QuotationPdfInput = {
        quoteNo: quoteNumber(now),
        date: now,
        validDays: 14,
        shop,
        customer,
        room: {
          label: roomKindLabel(room.roomType) ?? room.name,
          presetName: room.name,
          lengthFt: room.dims?.lengthFt,
          widthFt: room.dims?.widthFt,
          heightFt: room.dims?.heightFt,
        },
        quote,
        finishes,
        snapshot: await blobToDataUrl(blob),
      };
      await (kind === 'pdf' ? downloadQuotationPdf(input) : printQuotationPdf(input));
    });

  return (
    <div className="space-y-7">
      <Section title="Quotation & Tile Breakdown" aside={`Includes ${Math.round(WASTAGE * 100)}% wastage`}>
        {!tiled ? (
          <EmptyState
            icon={FileText}
            title="No tiles chosen yet"
            description="Pick a surface and a tile to build the quotation."
            className="py-8"
            action={
              <button type="button" onClick={onBrowse} className="ds-btn ds-btn-primary">
                Choose tiles
              </button>
            }
          />
        ) : (
          <div className="ds-card overflow-hidden rounded-2xl shadow-none">
            <ul className="divide-y divide-border">
              {quote.lines.map((l) => (
                <li key={l.surface} className="flex items-center gap-3 p-3">
                  <img src={l.tile.previewUrl || l.tile.textureUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{l.label}</p>
                    <p className="truncate text-2xs text-muted-foreground">{l.tile.name}</p>
                    <p className="text-2xs tabular-nums text-muted-foreground">
                      {l.areaSqFt > 0 ? `about ${l.areaSqFt.toFixed(0)} sq.ft · ${l.tiles} tiles` : 'Area not measured'}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-foreground">{formatLKR(l.amount)}</p>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between bg-inverse px-4 py-3 text-inverse-foreground">
              <span className="text-2xs font-semibold uppercase tracking-wider text-inverse-foreground/70">Estimated total</span>
              <span className="text-lg font-semibold tabular-nums">{formatLKR(quote.total)}</span>
            </div>
          </div>
        )}
        {tiled && <p className="text-2xs leading-relaxed text-muted-foreground">Areas are worked out from the photo, so they are estimates. Measure the room before ordering tiles.</p>}
      </Section>

      <Section title="Customer Details" aside="Optional, printed on quote">
        <div className="grid grid-cols-1 gap-2">
          <input className="ds-field" placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} autoComplete="name" />
          <input className="ds-field" placeholder="Phone number" inputMode="tel" value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} autoComplete="tel" />
        </div>
      </Section>

      <Section title="Export Quotation">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => makePdf('pdf')} disabled={!tiled || busy !== null} className="ds-btn ds-btn-primary">
            {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Quotation PDF
          </button>
          <button type="button" onClick={() => makePdf('print')} disabled={!tiled || busy !== null} className="ds-btn ds-btn-outline">
            {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print quote
          </button>
          {allowPictureDownload && (
            <>
              <button type="button" onClick={() => downloadPicture('image/jpeg')} disabled={busy !== null} className="ds-btn ds-btn-outline">
                {busy === 'jpg' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                Picture (JPG)
              </button>
              <button type="button" onClick={() => downloadPicture('image/png')} disabled={busy !== null} className="ds-btn ds-btn-outline">
                {busy === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                Picture (PNG)
              </button>
            </>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">
          {allowPictureDownload ? `Pictures are saved at high resolution. ` : ''}The PDF includes the tiled room and priced line items.
        </p>
      </Section>

      <Section title="Save this design" aside="On this device">
        <input className="ds-field" placeholder={defaultName} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Design name" />
        <button type="button" onClick={saveDesign} disabled={!tiled || busy !== null} className="ds-btn ds-btn-lg ds-btn-outline w-full">
          {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save design
        </button>
        {!tiled && <p className="text-2xs text-muted-foreground">Tile at least one surface to save the design.</p>}
      </Section>

      {saved.length > 0 && (
        <Section title="Saved designs" aside={`${saved.length}`}>
          <ul className="space-y-2">
            {saved.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2">
                <img src={d.thumbnail} alt="" className="h-12 w-[76px] shrink-0 rounded-lg border border-border object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{d.name}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {d.roomName} · {new Date(d.savedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <button type="button" className="ds-btn ds-btn-sm ds-btn-outline" onClick={() => onOpenDesign(d)}>
                  Open
                </button>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="Delete this saved design"
                  aria-label={`Delete ${d.name}`}
                  onClick={() => {
                    removeSavedDesign(d.id);
                    setSaved(listSavedDesigns());
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export { SavePanel as QuotePanel };
