import { FAMILY_BY_CODE, quorumFor, type ApprovalFamily } from '../config/approval-families.js';
import { SITE_DEFAULT, type BandStep, type CustomerClass, type LegalTrigger, type ProductClass, type VendorClass } from '../config/calibration.js';
import { activeSheet } from '../config/calibration-store.js';
import { BAND_ORDER, bandRank, maxBand, type AuthorityBand } from '../core/types.js';
import { ControlError } from '../core/errors.js';

export interface BandPercentages {
  discountPct?: number;
  marginPct?: number;          // 0..1
  budgetVariancePct?: number;
  priceVariancePct?: number;
  shrinkPct?: number;
}

export interface BandContext {
  amount?: number | null;
  percent?: BandPercentages;
  classes?: { vendor?: VendorClass; customer?: CustomerClass; product?: ProductClass };
  legal?: Partial<Record<LegalTrigger, boolean>>;
  siteCode?: string;
  /** Transaction timestamp — drives the off-hours escalation. */
  at?: Date;
  /** Family-specific boolean triggers. */
  flags?: Record<string, boolean | undefined>;
}

export interface BandResult {
  family: ApprovalFamily;
  band: AuthorityBand;
  quorum: number;
  drivers: string[];
  calibration: { version: string; hash: string };
}

export function familyOf(code: string): ApprovalFamily {
  const f = FAMILY_BY_CODE.get(code);
  if (!f) throw new ControlError('UNKNOWN_FAMILY', `Approval family ${code} is not defined`, 500, { code });
  return f;
}

const stepFor = (steps: readonly BandStep[], value: number): BandStep =>
  steps.find((s) => s.upTo === null || value <= s.upTo) ?? steps[steps.length - 1]!;

const escalate = (band: AuthorityBand, by: number): AuthorityBand =>
  BAND_ORDER[Math.min(BAND_ORDER.length - 1, bandRank(band) + by)]!;

/**
 * Deterministic band resolution. Every rule may only RAISE the band, never lower
 * it, and every raise is recorded in `drivers` so an auditor can reproduce the
 * routing from the request payload alone.
 */
export function resolveBand(familyCode: string, ctx: BandContext = {}): BandResult {
  const family = familyOf(familyCode);
  // Per-tenant sheet; falls back to the product default outside a tenant context.
  const cal = activeSheet();
  const site = (ctx.siteCode && cal.sites[ctx.siteCode]) || SITE_DEFAULT;
  const drivers: string[] = [];

  const raise = (to: AuthorityBand, why: string, current: AuthorityBand): AuthorityBand => {
    if (bandRank(to) > bandRank(current)) { drivers.push(`${why}→${to}`); return to; }
    return current;
  };

  // 1 ── amount ladder. The site factor scales generic ladders so a kiosk hits
  //      bands sooner; an explicit per-site ladder is absolute and is never scaled.
  const override = family.ladder === 'POS_VARIANCE' ? site.posVariance : undefined;
  const ladderSteps = override ?? cal.ladders[family.ladder];
  const factor = override ? 1 : site.amountFactor;
  const rawAmount = Math.abs(ctx.amount ?? 0);
  const effAmount = factor === 1 ? rawAmount : rawAmount / factor;
  const step = stepFor(ladderSteps, effAmount);
  let band = step.band;
  drivers.push(`amount ${Math.round(effAmount).toLocaleString('id-ID')}≤${step.upTo?.toLocaleString('id-ID') ?? '∞'}→${step.band}${factor === 1 ? '' : ` (site×${factor})`}${override ? ' (site ladder)' : ''}`);

  // 2 ── family floor
  if (family.minBand) band = raise(family.minBand, `family:${family.code}.minBand`, band);

  // 3 ── percentages
  const p = ctx.percent ?? {};
  if (p.discountPct !== undefined) {
    const d = stepFor(cal.percent.discount, p.discountPct);
    band = raise(d.band, `discount ${p.discountPct}%`, band);
  }
  if (p.marginPct !== undefined) {
    if (p.marginPct < cal.percent.marginCriticalPct) band = raise('T4', `margin ${(p.marginPct * 100).toFixed(1)}%<${cal.percent.marginCriticalPct * 100}%`, band);
    else if (p.marginPct < cal.percent.marginFloorPct) band = raise('T3', `margin ${(p.marginPct * 100).toFixed(1)}%<${cal.percent.marginFloorPct * 100}%`, band);
  }
  if (p.budgetVariancePct !== undefined) {
    if (p.budgetVariancePct > cal.percent.budgetVarianceT3Pct) band = raise('T3', `budgetVar ${p.budgetVariancePct}%`, band);
    else if (p.budgetVariancePct > cal.percent.budgetVarianceT2Pct) band = raise('T2', `budgetVar ${p.budgetVariancePct}%`, band);
  }
  if (p.priceVariancePct !== undefined) {
    if (p.priceVariancePct > cal.percent.priceVarianceT3Pct) band = raise('T3', `priceVar ${p.priceVariancePct}%`, band);
    else if (p.priceVariancePct > cal.percent.priceVarianceT2Pct) band = raise('T2', `priceVar ${p.priceVariancePct}%`, band);
    else if (p.priceVariancePct > cal.percent.priceTolerancePct) band = raise('T1', `priceVar ${p.priceVariancePct}%`, band);
  }
  if (p.shrinkPct !== undefined) {
    if (p.shrinkPct > cal.percent.shrinkT3Pct) band = raise('T3', `shrink ${p.shrinkPct}%`, band);
    else if (p.shrinkPct > cal.percent.shrinkT2Pct) band = raise('T2', `shrink ${p.shrinkPct}%`, band);
  }

  // 4 ── party / product class floors
  for (const [dim, value] of Object.entries(ctx.classes ?? {})) {
    if (!value) continue;
    const table = cal.classFloor[dim as keyof typeof cal.classFloor] as Record<string, AuthorityBand | null> | undefined;
    const floor = table?.[value];
    if (floor) band = raise(floor, `${dim}:${value}`, band);
  }

  // 5 ── legal / tax floors
  for (const [key, active] of Object.entries(ctx.legal ?? {})) {
    if (!active) continue;
    const floor = cal.legalFloor[key as LegalTrigger];
    if (floor) band = raise(floor, `legal:${key}`, band);
  }

  // 6 ── family boolean triggers
  for (const [flag, forced] of Object.entries(family.triggers)) {
    if (ctx.flags?.[flag]) band = raise(forced, `flag:${flag}`, band);
  }

  // 7 ── off-hours escalation
  if (ctx.at && cal.shiftEscalation.appliesTo.includes(family.ladder)) {
    const hour = ctx.at.getHours();
    if (hour < site.openHour || hour >= site.closeHour) {
      const to = escalate(band, cal.shiftEscalation.bands);
      band = raise(to, `offHours ${hour}:00 (open ${site.openHour}–${site.closeHour})`, band);
    }
  }

  return {
    family, band, quorum: quorumFor(family, band), drivers,
    calibration: { version: cal.version, hash: cal.hash },
  };
}

/** Renders the full amount matrix for the policy annex / sign-off pack. */
export function bandMatrix() {
  return APPROVAL_FAMILY_ROWS();
}

function APPROVAL_FAMILY_ROWS() {
  const cal = activeSheet();
  return [...FAMILY_BY_CODE.values()].map((f) => ({
    code: f.code,
    name: f.name,
    ladder: f.ladder,
    minBand: f.minBand ?? null,
    steps: cal.ladders[f.ladder].map((s) => ({ band: s.band, upTo: s.upTo })),
    triggers: f.triggers,
    quorum: Object.fromEntries(BAND_ORDER.map((b) => [b, quorumFor(f, b)])),
    slaHours: f.slaHours ?? null,
    sodRules: f.sodRules,
  }));
}

export { maxBand };
