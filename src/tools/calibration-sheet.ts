/**
 * Emits the calibration annex for CFO/Risk/Executive sign-off.
 * The document is generated FROM the code, so policy and runtime cannot drift.
 *   npm run calibration:sheet > docs/CALIBRATION.md
 */
import {
  ANCHOR, CALIBRATION_HASH, CALIBRATION_VERSION, CLASS_FLOOR, LADDERS,
  LEGAL_FLOOR, PERCENT, SHIFT_ESCALATION, SITES,
} from '../config/calibration.js';
import { APPROVAL_FAMILIES, quorumFor } from '../config/approval-families.js';
import { BAND_ORDER } from '../core/types.js';

const idr = (n: number | null) => (n === null ? '—' : `Rp ${n.toLocaleString('id-ID')}`);
const out: string[] = [];
const w = (s = '') => out.push(s);

w(`# T0–T4 Calibration — ${CALIBRATION_VERSION}`);
w();
w(`Generated from \`src/config/calibration.ts\`. Hash \`${CALIBRATION_HASH}\`.`);
w();
w(`| Field | Value |`);
w(`|---|---|`);
w(`| Scope | ${ANCHOR.scope} (single group-wide table) |`);
w(`| Currency | ${ANCHOR.currency} |`);
w(`| Revenue anchor | ${idr(ANCHOR.monthlyRevenue)} / month |`);
w(`| Basis | ${ANCHOR.basis} |`);
w(`| Effective from | ${ANCHOR.effectiveFrom} |`);
w(`| Review cadence | ${ANCHOR.reviewCadence} |`);
w(`| Approved by | ${ANCHOR.approvedBy ?? '**PENDING — CFO (R36), Risk & Control Owner (R03), Executive Sponsor (R01)**'} |`);
w();
w(`> Every amount below is derived from the revenue anchor. Change the anchor and the whole matrix moves coherently; no threshold is an independent constant.`);
w();

w(`## 1. Amount ladders`);
w();
w(`| Profile | T0 ≤ | T1 ≤ | T2 ≤ | T3 ≤ | T4 |`);
w(`|---|---:|---:|---:|---:|---:|`);
for (const [name, steps] of Object.entries(LADDERS)) {
  const cell = (b: string) => {
    const s = steps.find((x) => x.band === b);
    if (!s) return '—';
    return s.upTo === null ? 'above' : idr(s.upTo);
  };
  w(`| ${name} | ${cell('T0')} | ${cell('T1')} | ${cell('T2')} | ${cell('T3')} | ${cell('T4')} |`);
}
w();
w(`\`—\` means the band is not reachable for that profile: cash-out never clears below T2, and restricted families are T4 only.`);
w();

w(`## 2. Percentage thresholds`);
w();
w(`| Rule | Value |`);
w(`|---|---|`);
w(`| Discount ladder | ≤${PERCENT.discount.map((d) => `${d.upTo ?? '∞'}%→${d.band}`).join(' · ≤')} |`);
w(`| Margin floor → T3 | ${(PERCENT.marginFloorPct * 100).toFixed(0)}% |`);
w(`| Margin critical → T4 | ${(PERCENT.marginCriticalPct * 100).toFixed(0)}% |`);
w(`| Budget variance → T2 / T3 | ${PERCENT.budgetVarianceT2Pct}% / ${PERCENT.budgetVarianceT3Pct}% |`);
w(`| PO↔bill price tolerance | ${PERCENT.priceTolerancePct}% (→T1 above, T2 >${PERCENT.priceVarianceT2Pct}%, T3 >${PERCENT.priceVarianceT3Pct}%) |`);
w(`| Receipt qty tolerance | ${PERCENT.qtyTolerancePct}% |`);
w(`| Shrink/scrap → T2 / T3 | ${PERCENT.shrinkT2Pct}% / ${PERCENT.shrinkT3Pct}% |`);
w();

w(`## 3. Party & product class floors`);
w();
w(`| Dimension | ${Object.keys(CLASS_FLOOR.vendor).join(' | ')} |`);
w(`|---|---|---|---|---|`);
for (const [dim, table] of Object.entries(CLASS_FLOOR)) {
  w(`| ${dim} | ${Object.values(table).map((v) => v ?? '—').join(' | ')} |`);
}
w();

w(`## 4. Legal & tax floors`);
w();
w(`| Trigger | Minimum band |`);
w(`|---|---|`);
for (const [k, v] of Object.entries(LEGAL_FLOOR)) w(`| ${k} | ${v} |`);
w();

w(`## 5. Site & shift`);
w();
w(`| Site | Amount factor | Business hours | POS variance ladder |`);
w(`|---|---:|---|---|`);
for (const [code, s] of Object.entries(SITES)) {
  const pos = s.posVariance ? s.posVariance.map((x) => `${x.band}≤${x.upTo === null ? '∞' : idr(x.upTo)}`).join(' · ') : 'group default';
  w(`| ${code} | ×${s.amountFactor} | ${String(s.openHour).padStart(2, '0')}:00–${String(s.closeHour).padStart(2, '0')}:00 | ${pos} |`);
}
w();
w(`Off-hours escalation: +${SHIFT_ESCALATION.bands} band for ${SHIFT_ESCALATION.appliesTo.join(', ')} raised outside the site's business hours. An explicit per-site ladder is absolute and is never additionally scaled by the amount factor.`);
w();

w(`## 6. Family routing`);
w();
w(`| Family | Name | Ladder | Min band | Triggers | Quorum T1/T2/T3/T4 | SLA (h) | SoD |`);
w(`|---|---|---|---|---|---|---:|---|`);
for (const f of APPROVAL_FAMILIES) {
  const trig = Object.entries(f.triggers).map(([k, v]) => `${k}→${v}`).join(', ') || '—';
  const quorum = BAND_ORDER.slice(1).map((b) => quorumFor(f, b)).join('/');
  w(`| ${f.code} | ${f.name} | ${f.ladder} | ${f.minBand ?? '—'} | ${trig} | ${quorum} | ${f.slaHours ?? '—'} | ${f.sodRules.join(', ') || '—'} |`);
}
w();
w(`## 7. Resolution order`);
w();
w(`Each step may only RAISE the band, never lower it, and each raise is recorded in \`ApprovalRequest.bandDrivers\`:`);
w();
w(`1. Amount ladder (site factor applied)`);
w(`2. Family minimum band`);
w(`3. Percentages — discount, margin, budget variance, price variance, shrink`);
w(`4. Party / product class floor`);
w(`5. Legal & tax floor`);
w(`6. Family boolean triggers`);
w(`7. Off-hours escalation`);
w();
w(`T0 quorum = 0 (system validation + maker accountability). T4 quorum = 2 and the second approver must hold a different role. Timeout never auto-approves.`);

console.log(out.join('\n'));
