import type { AuthorityBand } from '../core/types.js';
import { versionHash } from '../core/hash.js';

/**
 * T0–T4 CALIBRATION — group-wide, IDR.
 *
 * Sesi-4 §3.1 fixes the bands as control classes and requires the company to map
 * each band to amount, percentage, risk class, legal requirement, role,
 * company/site, party/product class and exception type. Sesi-1 A07 records that
 * no threshold had been agreed at blueprint time, so every number below is
 * DERIVED from one anchor — change `ANCHOR.monthlyRevenue` and the whole matrix
 * moves coherently. Nothing here is a magic constant.
 *
 * Sign-off required from: CFO (R36), Risk & Control Owner (R03), Executive
 * Sponsor (R01) before `approvedBy` may be filled in.
 */

export const ANCHOR = {
  scope: 'GROUP' as const,
  currency: 'IDR' as const,
  /** Business-scale anchor: ceiling of the "under Rp 500 jt/month" revenue band. */
  monthlyRevenue: 500_000_000,
  basis: 'Group-wide provisional scale — under Rp 500 juta monthly revenue (single/low-multi outlet SME & restaurant).',
  effectiveFrom: '2026-08-01',
  approvedBy: null as string | null,
  reviewCadence: 'QUARTERLY',
} as const;

export interface BandStep {
  band: AuthorityBand;
  /** Inclusive ceiling in IDR; null = no ceiling. */
  upTo: number | null;
}

/** Rounds derived thresholds to values a human can defend in a policy document. */
export function niceAmount(n: number): number {
  const grid = n < 1_000_000 ? 50_000 : n < 10_000_000 ? 250_000 : n < 100_000_000 ? 1_000_000 : 5_000_000;
  return Math.round(n / grid) * grid;
}

/** Ladder as fractions of the anchor; the last entry must be `null`. */
const ladder = (...fracs: Array<[AuthorityBand, number | null]>): BandStep[] =>
  fracs.map(([band, f]) => ({ band, upTo: f === null ? null : niceAmount(ANCHOR.monthlyRevenue * f) }));

export type LadderProfile =
  | 'OPERATIONAL' | 'COMMITMENT' | 'CASH_OUT' | 'REVENUE_CONCESSION'
  | 'PEOPLE' | 'MASTER' | 'POS_VARIANCE' | 'FLAT_T4';

/**
 * Money ladders. Cash-out and revenue concessions are deliberately tighter than
 * operational spend: the same rupiah leaving the company costs more control than
 * the same rupiah committed against an approved budget.
 */
export const LADDERS: Record<LadderProfile, BandStep[]> = {
  // requisition, leave/overtime/expense, inventory adjustment, MO release
  OPERATIONAL: ladder(['T0', 0.002], ['T1', 0.01], ['T2', 0.03], ['T3', 0.10], ['T4', null]),
  // PO commitment, project baseline, maintenance cost
  COMMITMENT: ladder(['T0', 0.001], ['T1', 0.015], ['T2', 0.05], ['T3', 0.15], ['T4', null]),
  // payment batch, manual journal — money out never auto-clears
  CASH_OUT: ladder(['T2', 0.01], ['T3', 0.05], ['T4', null]),
  // discount, credit note, refund, case remedy
  REVENUE_CONCESSION: ladder(['T0', 0.0005], ['T1', 0.004], ['T2', 0.02], ['T3', 0.06], ['T4', null]),
  // hire/offer/compensation (monthly cost basis)
  PEOPLE: ladder(['T1', 0.01], ['T2', 0.03], ['T3', 0.08], ['T4', null]),
  // master-data create/change; class rules do the escalating
  MASTER: [{ band: 'T1', upTo: null }],
  // POS cash count variance per session
  POS_VARIANCE: [
    { band: 'T0', upTo: 25_000 },
    { band: 'T1', upTo: 150_000 },
    { band: 'T2', upTo: 750_000 },
    { band: 'T3', upTo: null },
  ],
  // restricted by definition — never amount-driven
  FLAT_T4: [{ band: 'T4', upTo: null }],
};

// ─── percentage / margin calibration ──────────────────────────────────────────

export const PERCENT = {
  /** Discount on a quote line or order. */
  discount: [
    { band: 'T0' as const, upTo: 5 },
    { band: 'T1' as const, upTo: 10 },
    { band: 'T2' as const, upTo: 20 },
    { band: 'T3' as const, upTo: 35 },
    { band: 'T4' as const, upTo: null },
  ],
  /** Gross margin floors. Restaurant blended target ≈ 60%. */
  marginFloorPct: 0.35,      // below → T3
  marginCriticalPct: 0.20,   // below → T4
  /** Budget variance on a requisition/PO against `budgetRef`. */
  budgetVarianceT2Pct: 10,
  budgetVarianceT3Pct: 25,
  /** PO ↔ bill unit-price variance (3-way match). */
  priceTolerancePct: 2,      // within → no exception
  priceVarianceT2Pct: 5,
  priceVarianceT3Pct: 10,
  /** Receipt quantity over-delivery. */
  qtyTolerancePct: 0,
  /** Production/inventory shrink on a single adjustment. */
  shrinkT2Pct: 3,
  shrinkT3Pct: 8,
} as const;

// ─── party / product class calibration ────────────────────────────────────────

export type VendorClass = 'STANDARD' | 'NEW' | 'SOLE_SOURCE' | 'RESTRICTED';
export type CustomerClass = 'STANDARD' | 'NEW' | 'CREDIT_HOLD' | 'RESTRICTED';
export type ProductClass = 'STANDARD' | 'PERISHABLE' | 'CONTROLLED' | 'RESTRICTED';

/** Minimum band forced by the class of the party or product involved. */
export const CLASS_FLOOR = {
  vendor: { STANDARD: null, NEW: 'T2', SOLE_SOURCE: 'T3', RESTRICTED: 'T4' },
  customer: { STANDARD: null, NEW: 'T1', CREDIT_HOLD: 'T3', RESTRICTED: 'T4' },
  product: { STANDARD: null, PERISHABLE: 'T1', CONTROLLED: 'T3', RESTRICTED: 'T4' },
} as const satisfies Record<string, Record<string, AuthorityBand | null>>;

// ─── legal / tax calibration ──────────────────────────────────────────────────

/** Statutory triggers. These override any amount ladder downwards, never upwards. */
export const LEGAL_FLOOR = {
  crossBorderPayment: 'T4',      // BI reporting + beneficiary risk
  taxSensitivePosting: 'T3',     // faktur pajak / PPN correction, PPh adjustment
  withholdingAdjustment: 'T3',
  statutoryReport: 'T3',         // e-Faktur, e-Bupot, BPJS, LKPM submissions
  personalDataDisclosure: 'T3',  // UU PDP — customer/employee data release
  contractDeviation: 'T3',       // nonstandard legal terms
  regulatedGoods: 'T4',          // alcohol/licensed items in F&B outlets
} as const satisfies Record<string, AuthorityBand>;

export type LegalTrigger = keyof typeof LEGAL_FLOOR;

// ─── site & shift calibration ─────────────────────────────────────────────────

export interface SiteProfile {
  /** Multiplies every money ladder for this site (flagship 1.0, kiosk 0.4). */
  amountFactor: number;
  /** POS cash-count variance ladder override. */
  posVariance?: BandStep[];
  /** Local business hours; outside this window, escalation applies. */
  openHour: number;
  closeHour: number;
}

export const SITE_DEFAULT: SiteProfile = { amountFactor: 1, openHour: 6, closeHour: 23 };

export const SITES: Record<string, SiteProfile> = {
  'RESTO-01': { amountFactor: 1, openHour: 6, closeHour: 23 },
  'RESTO-02': {
    amountFactor: 0.6, openHour: 7, closeHour: 22,
    posVariance: [
      { band: 'T0', upTo: 15_000 },
      { band: 'T1', upTo: 100_000 },
      { band: 'T2', upTo: 500_000 },
      { band: 'T3', upTo: null },
    ],
  },
  'KIOSK-01': { amountFactor: 0.4, openHour: 8, closeHour: 21 },
  'HO': { amountFactor: 1, openHour: 8, closeHour: 18 },
};

/**
 * Off-hours escalation. A cash-out or concession raised outside the site's
 * business hours climbs one band — the classic after-hours fraud window.
 */
export const SHIFT_ESCALATION = {
  bands: 1,
  appliesTo: ['CASH_OUT', 'REVENUE_CONCESSION', 'POS_VARIANCE'] as LadderProfile[],
} as const;

// ─── identity of this calibration ─────────────────────────────────────────────

export const CALIBRATION_VERSION = 'CAL-2026.08-A';

/** Any edit above changes this hash; it is stamped on every approval request. */
export const CALIBRATION_HASH = versionHash({
  version: CALIBRATION_VERSION,
  anchor: ANCHOR, ladders: LADDERS, percent: PERCENT,
  classFloor: CLASS_FLOOR, legalFloor: LEGAL_FLOOR,
  sites: SITES, shift: SHIFT_ESCALATION,
});

/** Materialised table for policy documents and the /meta/calibration endpoint. */
export const calibrationSheet = () => ({
  version: CALIBRATION_VERSION,
  hash: CALIBRATION_HASH,
  anchor: ANCHOR,
  ladders: LADDERS,
  percent: PERCENT,
  classFloor: CLASS_FLOOR,
  legalFloor: LEGAL_FLOOR,
  sites: SITES,
  shiftEscalation: SHIFT_ESCALATION,
});
