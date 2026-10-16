/**
 * Whether a showroom shows a Download button in its 2D and 3D visualizers.
 *
 * The two switches live in the showroom's own `details` JSON (next to its contact details and plan data), under one key, so
 * they belong to that showroom alone and survive every other edit of that JSON. Both are off until the owner turns them on.
 */
export interface VisualizerDownloads {
  viz2d: boolean;
  viz3d: boolean;
}

export const NO_DOWNLOADS: VisualizerDownloads = { viz2d: false, viz3d: false };

const KEY = 'visualizerDownloads';

/** The `details` column as an object. Text written by hand before the column held JSON is kept as the description. */
export function parseDetails(raw: string | null | undefined): Record<string, unknown> {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* plain text */
  }
  return { description: text };
}

/** The switches stored in a showroom's `details`. Anything missing or malformed counts as off. */
export function readDownloads(raw: string | null | undefined): VisualizerDownloads {
  const stored = parseDetails(raw)[KEY];
  const o = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return { viz2d: o.viz2d === true, viz3d: o.viz3d === true };
}

/** The `details` JSON with the given switches changed and everything else in it left exactly as it was. */
export function withDownloads(raw: string | null | undefined, patch: Partial<VisualizerDownloads>): { details: string; downloads: VisualizerDownloads } {
  const downloads = { ...readDownloads(raw) };
  if (typeof patch.viz2d === 'boolean') downloads.viz2d = patch.viz2d;
  if (typeof patch.viz3d === 'boolean') downloads.viz3d = patch.viz3d;
  return { details: JSON.stringify({ ...parseDetails(raw), [KEY]: downloads }), downloads };
}
