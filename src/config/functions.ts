/**
 * Function catalogue — the atomic unit of authorization and of SoD analysis.
 * Format: `<object>.<action>`. Permissions are granted to ROLES only (R01–R51).
 * Wildcards are allowed in grants (`party.*`), never in checks.
 */
export const FUNCTIONS = [
  // master data
  'party.create', 'party.approve', 'party.block', 'party.read',
  'party.bank.change', 'party.bank.verify', 'party.bank.approve',
  'product.create', 'product.approve', 'product.read', 'menu.availability',
  'account.create', 'account.approve', 'account.read',
  'role.admin', 'role.approve', 'audit.read',

  // O2C / POS / subscription
  'so.create', 'so.submit', 'so.approve', 'so.reserve', 'so.deliver',
  'so.bill', 'so.settle', 'so.cancel', 'so.read',
  'discount.request', 'discount.approve',
  'invoice.create', 'invoice.post', 'invoice.creditnote.approve',
  'pos.session.open', 'pos.session.close', 'pos.session.variance.approve',
  'pos.order.create', 'pos.gateway.reconcile',

  // manajemen ruang: meja, reservasi, acara
  'reservation.read', 'reservation.write', 'event.read', 'event.write',
  'subscription.create', 'subscription.approve', 'subscription.cancel',

  // P2P
  'req.create', 'req.approve',
  'po.create', 'po.approve', 'po.cancel', 'po.read',
  'receipt.create', 'receipt.approve',
  'bill.create', 'bill.match', 'bill.approve',
  'payment.prepare', 'payment.approve', 'payment.release', 'payment.reconcile',

  // R2R
  'journal.prepare', 'journal.approve', 'journal.post', 'journal.reverse',
  'period.close', 'period.reopen', 'bank.reconcile',

  // HR / payroll
  'payroll.run', 'payroll.approve', 'payroll.pay', 'payroll.reconcile',
  'employee.create', 'compensation.approve',

  // reporting
  'kpi.define', 'kpi.read', 'kpi.certify',
] as const;

export type FunctionCode = (typeof FUNCTIONS)[number];

const FUNCTION_SET = new Set<string>(FUNCTIONS);

export const isFunctionCode = (v: string): v is FunctionCode => FUNCTION_SET.has(v);

/** Expands `party.*` style grants against the catalogue. */
export function expandGrants(grants: readonly string[]): Set<FunctionCode> {
  const out = new Set<FunctionCode>();
  for (const g of grants) {
    if (g === '*') { FUNCTIONS.forEach((f) => out.add(f)); continue; }
    if (g.endsWith('.*')) {
      const prefix = g.slice(0, -1); // keep trailing dot
      FUNCTIONS.filter((f) => f.startsWith(prefix)).forEach((f) => out.add(f));
      continue;
    }
    if (g.startsWith('*.')) {
      const suffix = g.slice(1); // keep leading dot
      FUNCTIONS.filter((f) => f.endsWith(suffix)).forEach((f) => out.add(f));
      continue;
    }
    if (isFunctionCode(g)) out.add(g);
    else throw new Error(`Unknown function code in grant: ${g}`);
  }
  return out;
}
