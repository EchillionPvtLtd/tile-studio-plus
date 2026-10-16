import { parseDetails } from '@/lib/visualizerDownloads';

/**
 * Which visualizers a showroom may use.
 *
 * The PLAN gives the default (`planEntitlements`); the main administrator's switch for that showroom (stored in its `details`
 * JSON under `visualizerAccess`) decides. The administrator may turn on something the plan does not include (for example the
 * 3D visualizer for a Starter showroom, for a special case) and may turn it off again.
 *
 * A showroom with no stored switches gets its plan's defaults, so nothing has to be migrated. The switches are stamped with
 * the plan they were set under: when the plan changes they are ignored (and replaced by the new plan's defaults), so a
 * one-off switch never silently carries over to another plan.
 * This file is plain logic, with no server-only imports, so the admin screen, the dashboard and the server share it.
 */
export type VisualizerKind = 'viz2d' | 'viz3d';

export interface VisualizerAccess {
  viz2d: boolean;
  viz3d: boolean;
}

export const NO_ACCESS: VisualizerAccess = { viz2d: false, viz3d: false };

/** What a visitor sees where a restricted visualizer would be. */
export const RESTRICTED_MESSAGE = 'Visualizer access is currently restricted. Please contact your administrator.';

export const VISUALIZER_LABEL: Record<VisualizerKind, string> = { viz2d: '2D Visualizer', viz3d: '3D Visualizer' };

const KEY = 'visualizerAccess';

/** The plan names the app uses ("Pro" is an older spelling of Professional, "Enterprise" of Custom). */
export function canonicalPlan(plan: string | null | undefined): string {
  const p = (plan ?? '').trim();
  if (p === 'Pro') return 'Professional';
  if (p.toLowerCase() === 'enterprise') return 'Custom';
  return p || 'Free Trial';
}

/**
 * What a plan includes, which is what a showroom on it starts with:
 *   Starter       2D yes, 3D no (3D is part of the higher plans)
 *   Professional  both
 *   Custom        both are available; the administrator switches each one to match the showroom's agreement
 *   Free Trial    both, so a prospect can try everything
 * A plan this table does not know is treated like Starter: it never gets a feature that was not named.
 */
export function planEntitlements(plan: string | null | undefined): VisualizerAccess {
  switch (canonicalPlan(plan)) {
    case 'Professional':
    case 'Custom':
    case 'Free Trial':
      return { viz2d: true, viz3d: true };
    default:
      return { viz2d: true, viz3d: false };
  }
}

/** The switches the administrator has saved for a showroom, if they are for the plan it is on now. */
export function storedAccess(details: string | null | undefined, plan: string | null | undefined): Partial<VisualizerAccess> | null {
  const raw = parseDetails(details)[KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.plan !== 'string' || canonicalPlan(o.plan) !== canonicalPlan(plan)) return null; // set under another plan: no longer valid
  const out: Partial<VisualizerAccess> = {};
  if (typeof o.viz2d === 'boolean') out.viz2d = o.viz2d;
  if (typeof o.viz3d === 'boolean') out.viz3d = o.viz3d;
  return out;
}

/** What the showroom can use right now: the administrator's switch if there is one for this plan, else the plan's default. */
export function effectiveAccess(plan: string | null | undefined, details: string | null | undefined): VisualizerAccess {
  const base = planEntitlements(plan);
  const set = storedAccess(details, plan);
  return { viz2d: set?.viz2d ?? base.viz2d, viz3d: set?.viz3d ?? base.viz3d };
}

export type AccessState = 'enabled' | 'disabled';

export function accessStates(plan: string | null | undefined, details: string | null | undefined): Record<VisualizerKind, AccessState> {
  const now = effectiveAccess(plan, details);
  return { viz2d: now.viz2d ? 'enabled' : 'disabled', viz3d: now.viz3d ? 'enabled' : 'disabled' };
}

/** Switched on by the administrator although the plan does not include it (a special, usually temporary, case). */
export function isSpecialGrant(plan: string | null | undefined, details: string | null | undefined, kind: VisualizerKind): boolean {
  return effectiveAccess(plan, details)[kind] && !planEntitlements(plan)[kind];
}

/** One word for the whole showroom, for the table and its filter. */
export type AccessSummary = 'both' | '2d-only' | '3d-only' | 'none';

export function summarize(access: VisualizerAccess): AccessSummary {
  if (access.viz2d && access.viz3d) return 'both';
  if (access.viz2d) return '2d-only';
  if (access.viz3d) return '3d-only';
  return 'none';
}

export const SUMMARY_LABEL: Record<AccessSummary, string> = {
  both: '2D and 3D',
  '2d-only': '2D only',
  '3d-only': '3D only',
  none: 'No access',
};

/** The switches stored for a showroom that has just been given `plan`: what the plan includes, stamped with the plan. */
export function planAccessRecord(plan: string | null | undefined) {
  return { ...planEntitlements(plan), plan: canonicalPlan(plan) };
}

/** The details JSON with the plan's default switches written for `plan` (a showroom's first plan, or a new one). */
export function withPlanDefaults(details: string | null | undefined, plan: string | null | undefined): string {
  return JSON.stringify({ ...parseDetails(details), [KEY]: planAccessRecord(plan) });
}

/** True when two plan names are the same plan ("Pro" and "Professional" are). */
export const samePlan = (a: string | null | undefined, b: string | null | undefined) => canonicalPlan(a) === canonicalPlan(b);

export type AccessChange = { ok: true; details: string; access: VisualizerAccess } | { ok: false; message: string };

/** The details JSON with one switch changed; the other switch keeps its current value. Any switch may be turned on or off. */
export function withAccessChange(details: string | null | undefined, plan: string | null | undefined, kind: VisualizerKind, enabled: boolean): AccessChange {
  if (kind !== 'viz2d' && kind !== 'viz3d') return { ok: false, message: 'Unknown visualizer.' };
  const current = effectiveAccess(plan, details);
  const next: VisualizerAccess = { ...current, [kind]: enabled };
  return {
    ok: true,
    details: JSON.stringify({ ...parseDetails(details), [KEY]: { viz2d: next.viz2d, viz3d: next.viz3d, plan: canonicalPlan(plan) } }),
    access: next,
  };
}

/**
 * Carries what the showroom is allowed to change on its own across an edit of its `details`: whatever it sends, the
 * administrator's `visualizerAccess` stays as stored. Showrooms edit their own details, but never their own permissions.
 */
export function keepStoredAccess(stored: string | null | undefined, incoming: string): string {
  const before = parseDetails(stored)[KEY];
  const text = incoming.trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    const p: unknown = JSON.parse(text);
    if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (before === undefined && (parsed === null || !(KEY in parsed))) return text; // nothing to protect, nothing to strip
  const base = parsed ?? (text ? { description: text } : {});
  const { [KEY]: _dropped, ...rest } = base;
  void _dropped;
  return JSON.stringify(before === undefined ? rest : { ...rest, [KEY]: before });
}
