import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRoleSet, selfCheckRoleCatalogue } from '../src/iam/sod.service.js';
import { can, bandOf } from '../src/iam/rbac.js';
import { priceOrder } from '../src/domains/o2c/service.js';
import { CHAIN_INDEX } from '../src/config/sod.js';
import { versionHash } from '../src/core/hash.js';

test('no single role carries both sides of an SoD rule', () => {
  assert.deepEqual(selfCheckRoleCatalogue(), []);
});

test('toxic role combinations are detected', () => {
  const sod08 = evaluateRoleSet(['R34', 'R35']); // Treasury preparer + approver
  assert.ok(sod08.some((f) => f.ruleId === 'SOD08'));
  const sod07 = evaluateRoleSet(['R32', 'R33']); // Journal preparer + Controller
  assert.ok(sod07.some((f) => f.ruleId === 'SOD07'));
  const sod09 = evaluateRoleSet(['R41', 'R42']); // Payroll run + approve
  assert.ok(sod09.some((f) => f.ruleId === 'SOD09'));
  const sod01 = evaluateRoleSet(['R34', 'R36']); // Bank change + payment approve
  assert.ok(sod01.some((f) => f.ruleId === 'SOD01'));
});

test('SoD chains are registered order-insensitively', () => {
  assert.equal(CHAIN_INDEX.get('PaymentBatch:payment.prepare:payment.release'), 'SOD08');
  assert.equal(CHAIN_INDEX.get('PaymentBatch:payment.release:payment.prepare'), 'SOD08');
  assert.equal(CHAIN_INDEX.get('JournalEntry:journal.approve:journal.post'), 'SOD07');
  assert.equal(CHAIN_INDEX.get('PayrollRun:payroll.run:payroll.pay'), 'SOD09');
});

test('default deny: unassigned functions are refused', () => {
  const cashier = { userId: 'u1', roleCodes: ['R12'] };
  assert.equal(can(cashier, 'pos.order.create'), true);
  assert.equal(can(cashier, 'payment.release'), false);
  assert.equal(can(cashier, 'journal.post'), false);
  assert.equal(bandOf(cashier), 'T0');
  assert.equal(bandOf({ userId: 'u2', roleCodes: ['R36'] }), 'T4');
});

test('the target market cannot separate roles — the product must handle it', () => {
  // A cafe owner who also keeps the books. This is the customer, not an edge case.
  const owner = evaluateRoleSet(['R06', 'R09', 'R12', 'R31', 'R32', 'R33', 'R34', 'R41']);
  assert.ok(owner.length > 0, 'expected overlap for a one-person back office');
  assert.deepEqual(new Set(owner.map((f) => f.ruleId)), new Set(['SOD02', 'SOD04', 'SOD07']));

  // An outlet supervisor who also receives deliveries.
  assert.deepEqual(evaluateRoleSet(['R12', 'R18', 'R20', 'R31']).map((f) => f.ruleId), ['SOD03']);

  // Under STRICT these are refused; under SMALL_BUSINESS they are accepted with
  // a written mitigation. Either way the DYNAMIC chain still holds: the same
  // person may never sit at both ends of one document.
  assert.equal(CHAIN_INDEX.get('PaymentBatch:payment.prepare:payment.approve'), 'SOD08');
});

test('order pricing drives margin and discount triggers', () => {
  const t = priceOrder([
    { productId: 'p1', qty: 2, unitPrice: 100_000, unitCost: 60_000, discPct: 25, taxAmount: 15_000 },
  ]);
  assert.equal(t.subtotal, 200_000);
  assert.equal(t.discount, 50_000);
  assert.equal(t.total, 165_000);
  assert.equal(t.maxDiscPct, 25);
  assert.equal(t.marginPct, 0.2); // (150k - 120k) / 150k
});

test('version hash is canonical and order-independent', () => {
  assert.equal(versionHash({ a: 1, b: [1, 2] }), versionHash({ b: [1, 2], a: 1 }));
  assert.notEqual(versionHash({ a: 1 }), versionHash({ a: 2 }));
});
