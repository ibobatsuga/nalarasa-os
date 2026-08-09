import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBand } from '../src/approval/band.js';
import { ANCHOR, CALIBRATION_VERSION, LADDERS, niceAmount } from '../src/config/calibration.js';

/**
 * Boundary matrix. Sesi-4 §3.1: "Boundary values must be tested."
 * Every ceiling is tested at the ceiling (inclusive) and one rupiah above.
 */
const band = (family: string, ctx: Parameters<typeof resolveBand>[1]) => resolveBand(family, ctx).band;

test('ladders derive from the single revenue anchor', () => {
  assert.equal(ANCHOR.monthlyRevenue, 500_000_000);
  assert.deepEqual(LADDERS.OPERATIONAL.map((s) => s.upTo), [1_000_000, 5_000_000, 15_000_000, 50_000_000, null]);
  assert.deepEqual(LADDERS.COMMITMENT.map((s) => s.upTo), [500_000, 7_500_000, 25_000_000, 75_000_000, null]);
  assert.deepEqual(LADDERS.CASH_OUT.map((s) => s.upTo), [5_000_000, 25_000_000, null]);
  assert.deepEqual(LADDERS.REVENUE_CONCESSION.map((s) => s.upTo), [250_000, 2_000_000, 10_000_000, 30_000_000, null]);
  assert.deepEqual(LADDERS.PEOPLE.map((s) => s.upTo), [5_000_000, 15_000_000, 40_000_000, null]);
  assert.equal(niceAmount(1_234_567), 1_250_000);
});

test('AR09 operational boundaries', () => {
  assert.equal(band('AR09', { amount: 1_000_000 }), 'T0');
  assert.equal(band('AR09', { amount: 1_000_001 }), 'T1');
  assert.equal(band('AR09', { amount: 5_000_000 }), 'T1');
  assert.equal(band('AR09', { amount: 5_000_001 }), 'T2');
  assert.equal(band('AR09', { amount: 15_000_000 }), 'T2');
  assert.equal(band('AR09', { amount: 15_000_001 }), 'T3');
  assert.equal(band('AR09', { amount: 50_000_000 }), 'T3');
  assert.equal(band('AR09', { amount: 50_000_001 }), 'T4');
  assert.equal(resolveBand('AR09', { amount: 1_000_000 }).quorum, 0);
  assert.equal(resolveBand('AR09', { amount: 50_000_001 }).quorum, 2);
});

test('AR10 commitment boundaries', () => {
  assert.equal(band('AR10', { amount: 500_000 }), 'T0');
  assert.equal(band('AR10', { amount: 500_001 }), 'T1');
  assert.equal(band('AR10', { amount: 7_500_000 }), 'T1');
  assert.equal(band('AR10', { amount: 25_000_000 }), 'T2');
  assert.equal(band('AR10', { amount: 75_000_000 }), 'T3');
  assert.equal(band('AR10', { amount: 75_000_001 }), 'T4');
});

test('cash-out never auto-clears: AR18/AR19 start at T2', () => {
  assert.equal(band('AR19', { amount: 1 }), 'T2');
  assert.equal(band('AR19', { amount: 5_000_000 }), 'T2');
  assert.equal(band('AR19', { amount: 5_000_001 }), 'T3');
  assert.equal(band('AR19', { amount: 25_000_001 }), 'T4');
  assert.equal(band('AR18', { amount: 100_000 }), 'T2');
  assert.equal(resolveBand('AR19', { amount: 1 }).quorum, 1);
});

test('discount % and margin floors escalate AR06', () => {
  assert.equal(band('AR06', { amount: 100_000, percent: { discountPct: 5 } }), 'T0');
  assert.equal(band('AR06', { amount: 100_000, percent: { discountPct: 5.1 } }), 'T1');
  assert.equal(band('AR06', { amount: 100_000, percent: { discountPct: 20 } }), 'T2');
  assert.equal(band('AR06', { amount: 100_000, percent: { discountPct: 35.1 } }), 'T4');
  assert.equal(band('AR06', { amount: 100_000, percent: { marginPct: 0.36 } }), 'T0');
  assert.equal(band('AR06', { amount: 100_000, percent: { marginPct: 0.34 } }), 'T3');
  assert.equal(band('AR06', { amount: 100_000, percent: { marginPct: 0.19 } }), 'T4');
});

test('3-way-match price variance ladders AR11', () => {
  assert.equal(band('AR11', { amount: 100_000, percent: { priceVariancePct: 2 } }), 'T0');
  assert.equal(band('AR11', { amount: 100_000, percent: { priceVariancePct: 2.1 } }), 'T1');
  assert.equal(band('AR11', { amount: 100_000, percent: { priceVariancePct: 6 } }), 'T2');
  assert.equal(band('AR11', { amount: 100_000, percent: { priceVariancePct: 11 } }), 'T3');
});

test('party and product class floors', () => {
  assert.equal(band('AR10', { amount: 100_000, classes: { vendor: 'STANDARD' } }), 'T0');
  assert.equal(band('AR10', { amount: 100_000, classes: { vendor: 'NEW' } }), 'T2');
  assert.equal(band('AR10', { amount: 100_000, classes: { vendor: 'SOLE_SOURCE' } }), 'T3');
  assert.equal(band('AR10', { amount: 100_000, classes: { vendor: 'RESTRICTED' } }), 'T4');
  assert.equal(band('AR06', { amount: 100_000, classes: { customer: 'CREDIT_HOLD' } }), 'T3');
  assert.equal(band('AR09', { amount: 100_000, classes: { product: 'CONTROLLED' } }), 'T3');
});

test('legal and tax triggers cannot be undercut by amount', () => {
  assert.equal(band('AR19', { amount: 1, legal: { crossBorderPayment: true } }), 'T4');
  assert.equal(band('AR18', { amount: 1, legal: { taxSensitivePosting: true } }), 'T3');
  assert.equal(band('AR09', { amount: 1, legal: { regulatedGoods: true } }), 'T4');
  assert.equal(band('AR06', { amount: 1, legal: { personalDataDisclosure: true } }), 'T3');
});

test('site factor tightens smaller outlets', () => {
  assert.equal(band('AR09', { amount: 600_000 }), 'T0');                        // HO / default
  assert.equal(band('AR09', { amount: 600_000, siteCode: 'KIOSK-01' }), 'T1');  // ×0.4 → eff 1.5 jt
  assert.equal(band('AR09', { amount: 600_000, siteCode: 'RESTO-02' }), 'T0');  // ×0.6 → eff exactly 1 jt
  assert.equal(band('AR09', { amount: 600_001, siteCode: 'RESTO-02' }), 'T1');
  assert.equal(band('AR09', { amount: 600_000, siteCode: 'RESTO-01' }), 'T0');
});

test('POS variance ladders are per site', () => {
  const noon = new Date(2026, 7, 6, 12, 0, 0);
  assert.equal(band('AR25P', { amount: 25_000, siteCode: 'RESTO-01', at: noon }), 'T0');
  assert.equal(band('AR25P', { amount: 25_001, siteCode: 'RESTO-01', at: noon }), 'T1');
  assert.equal(band('AR25P', { amount: 750_001, siteCode: 'RESTO-01', at: noon }), 'T3');
  assert.equal(band('AR25P', { amount: 15_000, siteCode: 'RESTO-02', at: noon }), 'T0');
  assert.equal(band('AR25P', { amount: 15_001, siteCode: 'RESTO-02', at: noon }), 'T1');
});

test('off-hours transactions climb one band', () => {
  const night = new Date(2026, 7, 6, 2, 0, 0);
  const noon = new Date(2026, 7, 6, 12, 0, 0);
  assert.equal(band('AR25P', { amount: 10_000, siteCode: 'RESTO-01', at: noon }), 'T0');
  assert.equal(band('AR25P', { amount: 10_000, siteCode: 'RESTO-01', at: night }), 'T1');
  assert.equal(band('AR19', { amount: 1_000_000, at: night }), 'T3');   // T2 → T3
  assert.equal(band('AR19', { amount: 1_000_000, at: noon }), 'T2');
  // Operational spend is not escalated by the clock.
  assert.equal(band('AR09', { amount: 500_000, at: night }), 'T0');
});

test('restricted families stay T4 dual control', () => {
  for (const f of ['AR04', 'AR20', 'AR23']) {
    const r = resolveBand(f, { amount: 0 });
    assert.equal(r.band, 'T4', f);
    assert.equal(r.quorum, 2, f);
  }
});

test('minBand floors change control and access families', () => {
  assert.equal(band('AR26', {}), 'T2');
  assert.equal(band('AR26', { flags: { privileged: true } }), 'T4');
  assert.equal(band('AR27', {}), 'T2');
  assert.equal(band('AR27', { flags: { production: true } }), 'T3');
  assert.equal(band('AR07', { amount: 1 }), 'T3');
});

test('routing is reproducible: drivers and calibration stamp', () => {
  const r = resolveBand('AR06', {
    amount: 100_000, percent: { discountPct: 25, marginPct: 0.18 },
    classes: { customer: 'CREDIT_HOLD' }, siteCode: 'RESTO-01',
    at: new Date(2026, 7, 6, 12, 0, 0),
  });
  assert.equal(r.band, 'T4');
  assert.equal(r.quorum, 2);
  assert.equal(r.calibration.version, CALIBRATION_VERSION);
  assert.ok(r.calibration.hash.length === 32);
  assert.ok(r.drivers.some((d) => d.startsWith('amount')));
  assert.ok(r.drivers.some((d) => d.includes('discount 25%')));
  assert.ok(r.drivers.some((d) => d.includes('margin')));
});
