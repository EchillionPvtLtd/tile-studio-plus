'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import { useRoomStore, PAINTABLE_WALLS } from '@/stores/roomStore';
import { ROOM_CONFIGS } from '@/types/room';
import { GROUT_COLORS, TILE_LAYOUT_OPTIONS } from '@/types/tile';
import { PANEL_TREATMENTS, colourName } from '@/data/wallFinishes';
import { buildQuote, quoteSurfaces, WASTAGE } from '@/lib/quotation';
import { downloadQuotationPdf, printQuotationPdf, type QuotationPdfInput, type ShopProfile } from '@/lib/quotationPdf';
import { captureSceneImage } from '@/components/Viewer/sceneSnapshot';
import { formatLKR } from '@/lib/utils';
import { EmptyState } from '@/components/dashboard';
import { Section } from './Section';

const WALL_LABEL: Record<string, string> = { 'wall-n': 'North', 'wall-s': 'South', 'wall-e': 'East', 'wall-w': 'West' };

function quoteNumber(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Q${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function QuotePanel({ shop, onBrowseTiles }: { shop: ShopProfile | null; onBrowseTiles: () => void }) {
  const s = useRoomStore();
  const shopId = useSearchParams()?.get('shopId') || '';
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quote = useMemo(
    () => buildQuote(s),
    [s.roomType, s.lengthFt, s.widthFt, s.heightFt, s.featureWallTreatment, s.floorTile, s.wallNTile, s.wallSTile, s.wallETile, s.wallWTile, s.featureWallTile, s.backsplashTile, s.showerWallTile],
  );

  /** Plain-language finish notes for the PDF. */
  const finishes = useMemo(() => {
    const notes: string[] = [];
    if (quote.lines.length) {
      const layout = TILE_LAYOUT_OPTIONS.find((l) => l.key === s.layout)?.label ?? s.layout;
      const grout = GROUT_COLORS.find((g) => g.hex.toLowerCase() === s.groutColor.toLowerCase())?.name ?? 'custom colour';
      notes.push(`Laying pattern: ${layout}. Grout: ${s.groutWidthMm} mm, ${grout}.`);
    }
    const present = quoteSurfaces(s.roomType);
    const byColour = new Map<string, string[]>();
    for (const w of PAINTABLE_WALLS) {
      if (!present.includes(w) || s.getTileForSurface(w)) continue;
      if (w === 'wall-n' && s.featureWallTreatment !== 'none') continue;
      const c = colourName(s.wallPaints[w] || s.wallColor);
      byColour.set(c, [...(byColour.get(c) ?? []), WALL_LABEL[w]]);
    }
    for (const [c, walls] of byColour) notes.push(`Paint: ${walls.join(', ')} wall${walls.length > 1 ? 's' : ''} in ${c}.`);
    if (s.featureWallTreatment !== 'none') {
      const panel = PANEL_TREATMENTS.find((p) => p.id === s.featureWallTreatment)?.name ?? s.featureWallTreatment;
      notes.push(`Feature wall: ${panel} in ${colourName(s.featureWallColor)}${s.featureWallBacklight ? ', with cove LED lighting' : ''}.`);
    }
    return notes;
  }, [quote.lines.length, s]);

  const run = async (kind: 'download' | 'print') => {
    setBusy(kind);
    setError(null);
    try {
      const now = new Date();
      // The showroom's logo and details may not have arrived yet (or the first request failed): ask again before printing
      let shopProfile = shop;
      if (!shopProfile) {
        shopProfile = await fetch(shopId ? `/api/shop/public?shopId=${encodeURIComponent(shopId)}` : '/api/shop/public')
          .then((r) => (r.ok ? (r.json() as Promise<ShopProfile | null>) : null))
          .catch(() => null);
      }
      const input: QuotationPdfInput = {
        quoteNo: quoteNumber(now),
        date: now,
        validDays: 14,
        shop: shopProfile,
        customer,
        room: {
          label: ROOM_CONFIGS.find((r) => r.type === s.roomType)?.label ?? s.roomType,
          presetName: s.activeTemplate?.name ?? null,
          lengthFt: s.lengthFt,
          widthFt: s.widthFt,
          heightFt: s.heightFt,
        },
        quote,
        finishes,
        snapshot: captureSceneImage(),
      };
      await (kind === 'download' ? downloadQuotationPdf(input) : printQuotationPdf(input));
    } catch (e) {
      console.error('Quotation PDF failed:', e);
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-7">
      <Section title="Customer" aside="Optional — printed on the quote">
        <div className="grid grid-cols-1 gap-2">
          <input
            className="ds-field"
            placeholder="Customer name"
            value={customer.name}
            onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
            autoComplete="name"
          />
          <input
            className="ds-field"
            placeholder="Phone number"
            inputMode="tel"
            value={customer.phone}
            onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
            autoComplete="tel"
          />
        </div>
      </Section>

      <Section title="Tiles in this design" aside={`Includes ${Math.round(WASTAGE * 100)}% wastage`}>
        {quote.lines.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No tiles selected yet"
            description="Choose a floor or wall tile to build the quotation."
            className="py-8"
            action={
              <button type="button" onClick={onBrowseTiles} className="ds-btn ds-btn-primary">
                Choose a floor tile
              </button>
            }
          />
        ) : (
          <div className="ds-card overflow-hidden rounded-2xl shadow-none">
            <ul className="divide-y divide-border">
              {quote.lines.map((l) => (
                <li key={l.surface} className="flex items-center gap-3 p-3">
                  <img
                    src={l.tile.previewUrl || l.tile.textureUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{l.label}</p>
                    <p className="truncate text-2xs text-muted-foreground">{l.tile.name}</p>
                    <p className="text-2xs tabular-nums text-muted-foreground">
                      {l.areaSqFt.toFixed(0)} sq.ft · {l.tiles} tiles
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
      </Section>

      {finishes.length > 0 && (
        <Section title="Finishes">
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {finishes.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Section>
      )}

      <div className="space-y-2">
        <button type="button" onClick={() => run('download')} disabled={busy !== null} className="ds-btn ds-btn-lg ds-btn-primary w-full">
          {busy === 'download' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </button>
        <button type="button" onClick={() => run('print')} disabled={busy !== null} className="ds-btn ds-btn-lg ds-btn-outline w-full">
          {busy === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Print quotation
        </button>
        {error && <p className="text-center text-2xs text-destructive">{error}</p>}
        <p className="text-center text-2xs text-muted-foreground">The PDF includes a picture of the current 3D view.</p>
      </div>
    </div>
  );
}
