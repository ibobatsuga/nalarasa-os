import { z } from 'zod';
import { prisma, type Tx } from '../../core/db.js';
import { runTransition } from '../../core/controller.js';
import { audit } from '../../core/audit.js';
import { versionHash } from '../../core/hash.js';
import { nextDocNo, num, ratio, round2 } from '../../core/seq.js';
import { siteCodeOf } from '../../core/site.js';
import { currentTenantId } from '../../core/tenant.js';
import { ControlError } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';
import { requestApproval } from '../../approval/approval.service.js';
import { salesOrderDoc, salesOrderStage, posSession, type OrderStage } from './machine.js';
import type { DocState } from '../../core/statemachine.js';

// ─── schemas ──────────────────────────────────────────────────────────────────

export const SalesOrderLineInput = z.object({
  productId: z.string(),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  unitCost: z.number().nonnegative().default(0),
  discPct: z.number().min(0).max(100).default(0),
  taxAmount: z.number().nonnegative().default(0),
});

export const SalesOrderInput = z.object({
  companyId: z.string(),
  siteId: z.string().optional(),
  partyId: z.string(),
  channel: z.enum(['SALES', 'POS', 'SUBSCRIPTION']).default('SALES'),
  currency: z.string().default('IDR'),
  promisedAt: z.coerce.date().optional(),
  planRef: z.string().optional(),
  lines: z.array(SalesOrderLineInput).min(1),
});
export type SalesOrderInput = z.infer<typeof SalesOrderInput>;

// Discount %, margin floors and POS variance limits live in config/calibration.ts.

// ─── totals + version ─────────────────────────────────────────────────────────

export function priceOrder(lines: z.infer<typeof SalesOrderLineInput>[]) {
  let subtotal = 0, discount = 0, tax = 0, cost = 0;
  for (const l of lines) {
    const gross = l.qty * l.unitPrice;
    const disc = gross * (l.discPct / 100);
    subtotal += gross;
    discount += disc;
    tax += l.taxAmount;
    cost += l.qty * l.unitCost;
  }
  const net = subtotal - discount;
  return {
    subtotal: round2(subtotal), discount: round2(discount), tax: round2(tax),
    total: round2(net + tax), cost: round2(cost),
    marginPct: Number(ratio(net - cost, net).toFixed(4)),
    maxDiscPct: Math.max(0, ...lines.map((l) => l.discPct)),
  };
}

// ─── SOP02 Lead-to-Order ──────────────────────────────────────────────────────

export async function createOrder(actor: Actor, input: SalesOrderInput) {
  assertCan(actor, 'so.create');
  const t = priceOrder(input.lines);
  return prisma.$transaction(async (tx) => {
    const docNo = await nextDocNo('SO', tx as Tx);
    const vh = versionHash({ docNo, ...input, totals: t });
    const so = await tx.salesOrder.create({
      data: {
        docNo, companyId: input.companyId, siteId: input.siteId ?? null,
        partyId: input.partyId, channel: input.channel, currency: input.currency,
        subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total,
        marginPct: t.marginPct, promisedAt: input.promisedAt ?? null,
        planRef: input.planRef ?? null, versionHash: vh, createdBy: actor.userId,
        lines: { create: input.lines.map((l) => ({ ...l })) },
      },
      include: { lines: true },
    });
    await audit({ actor, action: 'so.create', docType: 'SalesOrder', docId: so.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return so;
  });
}

/** Submit routes to AR06 on value, discount %, margin floor, customer class and site. */
export async function submitOrder(actor: Actor, orderId: string) {
  assertCan(actor, salesOrderDoc.get("so.submit").fn);
  const so = await mustOrder(orderId);
  const [siteCode, party] = await Promise.all([
    siteCodeOf(so.siteId),
    prisma.party.findUnique({ where: { id: so.partyId }, select: { restricted: true, status: true, creditLimit: true } }),
  ]);
  const lines = so.lines.map((l) => ({
    productId: l.productId, qty: num(l.qty), unitPrice: num(l.unitPrice),
    unitCost: num(l.unitCost), discPct: num(l.discPct), taxAmount: num(l.taxAmount),
  }));
  const t = priceOrder(lines);

  return runTransition({
    actor, machine: salesOrderDoc, action: 'so.submit', docId: so.id,
    current: so.status as DocState, versionHash: so.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR06', docType: 'SalesOrder', docId: so.id,
        companyId: so.companyId, currency: so.currency, amount: t.total,
        percent: { discountPct: t.maxDiscPct, marginPct: t.marginPct },
        classes: { customer: party?.restricted ? 'RESTRICTED' : party?.status === 'BLOCKED' ? 'CREDIT_HOLD' : 'STANDARD' },
        siteCode, at: new Date(),
        payload: { docNo: so.docNo, totals: t, lines }, actor,
      }, tx);
      const updated = await tx.salesOrder.update({
        where: { id: so.id },
        data: { status: approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'SUBMITTED', versionHash: approval.versionHash },
      });
      return { order: updated, approval };
    },
  });
}

/** Post-approval confirmation; locks approved terms and opens fulfilment. */
export async function confirmOrder(actor: Actor, orderId: string) {
  assertCan(actor, salesOrderDoc.get("so.execute").fn);
  const so = await mustOrder(orderId);
  return runTransition({
    actor, machine: salesOrderDoc, action: 'so.execute', docId: so.id,
    current: so.status as DocState, versionHash: so.versionHash,
    apply: (tx) => tx.salesOrder.update({ where: { id: so.id }, data: { status: 'EXECUTED', stage: 'ORDER' } }),
  });
}

// ─── SOP03 Order-to-Cash stages ───────────────────────────────────────────────

const stageAction: Record<string, { action: string; patch: (now: Date, extra: Record<string, unknown>) => object }> = {
  reserve: { action: 'so.reserve', patch: (now) => ({ stage: 'RESERVED', reservedAt: now }) },
  deliver: { action: 'so.deliver', patch: (now, extra) => ({ stage: 'DELIVERED', deliveredAt: now, podRef: extra.podRef ?? null }) },
  bill: { action: 'so.bill', patch: (now) => ({ stage: 'BILLED', billedAt: now }) },
  settle: { action: 'so.settle', patch: (now) => ({ stage: 'SETTLED', settledAt: now }) },
};

export async function advanceOrder(
  actor: Actor, orderId: string, step: keyof typeof stageAction, extra: Record<string, unknown> = {},
) {
  const so = await mustOrder(orderId);
  if (so.status !== 'EXECUTED') throw new ControlError('ORDER_NOT_CONFIRMED', 'Order must be confirmed first', 409);
  const def = stageAction[step]!;
  if (step === 'deliver' && !extra.podRef) {
    throw new ControlError('POD_REQUIRED', 'Proof of delivery reference is mandatory', 400);
  }
  const now = new Date();
  return runTransition({
    actor, machine: salesOrderStage, action: def.action, docId: so.id,
    current: so.stage as OrderStage, versionHash: so.versionHash, meta: extra,
    apply: async (tx) => {
      const updated = await tx.salesOrder.update({ where: { id: so.id }, data: def.patch(now, extra) as never });
      if (step === 'deliver') {
        // Partial shipments are explicit; default is in-full (K04 denominator source).
        const shipped = (extra.shipped ?? {}) as Record<string, number>;
        for (const l of so.lines) {
          await tx.salesOrderLine.update({
            where: { id: l.id },
            data: { qtyShipped: shipped[l.id] ?? num(l.qty) },
          });
        }
      }
      if (step === 'bill') {
        const docNo = await nextDocNo('INV', tx as Tx);
        await tx.invoice.create({
          data: {
            docNo, orderId: so.id, partyId: so.partyId, companyId: so.companyId,
            issuedAt: now, dueAt: new Date(now.getTime() + 30 * 86_400_000),
            total: so.total, status: 'EXECUTED',
            versionHash: versionHash({ docNo, orderId: so.id, total: num(so.total) }),
            createdBy: actor.userId,
          },
        });
      }
      if (step === 'settle') {
        await tx.invoice.updateMany({ where: { orderId: so.id }, data: { settled: so.total } });
      }
      return updated;
    },
  });
}

// ─── SOP04 POS ────────────────────────────────────────────────────────────────

export const PosCloseInput = z.object({ countedCash: z.number().nonnegative() });

export async function openPosSession(
  actor: Actor, siteId: string, companyId: string, openingFloat: number, clientRef?: string,
) {
  assertCan(actor, 'pos.session.open');
  const vh = versionHash({ siteId, companyId, openingFloat, clientRef: clientRef ?? null });
  const s = await prisma.posSession.create({
    data: { siteId, companyId, openedBy: actor.userId, openingFloat, versionHash: vh, clientRef: clientRef ?? null },
  });
  await audit({ actor, action: 'pos.open', docType: 'PosSession', docId: s.id, toStatus: 'DRAFT', versionHash: vh });
  return s;
}

export async function addPosOrder(actor: Actor, sessionId: string, input: {
  total: number;
  tenderType: 'CASH' | 'CARD' | 'QRIS' | 'EWALLET';
  gatewayRef?: string;
  clientRef?: string;
  at?: Date;
  orderType?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  tableNo?: string;
  cashierRef?: string;
  voidOfRef?: string;
  voidReason?: string;
  lines?: Array<{ productCode: string; name: string; qty: number; unitPrice: number; note?: string }>;
}) {
  assertCan(actor, 'pos.order.create');
  return prisma.$transaction(async (tx) => {
    const session = await tx.posSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (session.status !== 'DRAFT') throw new ControlError('SESSION_CLOSED', 'POS session is not open', 409);
    const docNo = await nextDocNo('POS', tx as Tx);
    const order = await tx.posOrder.create({
      data: {
        sessionId, docNo, total: input.total, tenderType: input.tenderType,
        gatewayRef: input.gatewayRef ?? null, clientRef: input.clientRef ?? null,
        orderType: input.orderType ?? 'DINE_IN', tableNo: input.tableNo ?? null,
        cashierRef: input.cashierRef ?? null,
        voidOfRef: input.voidOfRef ?? null, voidReason: input.voidReason ?? null,
        createdBy: actor.userId, createdAt: input.at ?? new Date(),
        lines: input.lines ? { create: input.lines.map((l) => ({ ...l, note: l.note ?? null })) } : undefined,
      },
    });
    if (input.tenderType === 'CASH') {
      // A refund carries a negative total, so the same increment walks it back.
      await tx.posSession.update({ where: { id: sessionId }, data: { expectedCash: { increment: input.total } } });
    }
    await audit({ actor, action: 'pos.order.create', docType: 'PosSession', docId: sessionId, versionHash: session.versionHash, meta: { posOrderId: order.id, tender: input.tenderType } }, tx as Tx);
    return order;
  });
}

/** Close = count cash, compute variance, route AR25P by variance magnitude. */
export async function closePosSession(actor: Actor, sessionId: string, countedCash: number) {
  assertCan(actor, posSession.get("pos.close").fn);
  const s = await prisma.posSession.findUniqueOrThrow({ where: { id: sessionId } });
  const expected = num(s.expectedCash) + num(s.openingFloat);
  const variance = round2(countedCash - expected);
  const siteCode = await siteCodeOf(s.siteId);

  return runTransition({
    actor, machine: posSession, action: 'pos.close', docId: s.id,
    current: s.status as DocState, versionHash: s.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR25P', docType: 'PosSession', docId: s.id,
        companyId: s.companyId, amount: Math.abs(variance),
        siteCode, at: new Date(),
        payload: { expected, countedCash, variance, siteCode }, actor,
      }, tx);
      const updated = await tx.posSession.update({
        where: { id: s.id },
        data: {
          countedCash, variance, closedBy: actor.userId, closedAt: new Date(),
          approvalId: approval.approvalId, versionHash: approval.versionHash,
          status: approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'SUBMITTED',
        },
      });
      return { session: updated, variance, approval };
    },
  });
}

/** Gateway settlement reconciliation for card/QRIS/e-wallet tenders. */
export async function reconcileGateway(actor: Actor, companyId: string, rows: Array<{
  gateway: string; batchRef: string; gatewayRef: string; grossAmount: number;
  feeAmount?: number; netAmount: number; settledAt: Date;
}>) {
  assertCan(actor, 'pos.gateway.reconcile');
  const summary = { matched: 0, unmatched: 0, amountMismatch: 0 };
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      const posOrder = await tx.posOrder.findFirst({ where: { gatewayRef: r.gatewayRef } });
      const result = !posOrder
        ? 'UNMATCHED'
        : Math.abs(num(posOrder.total) - r.grossAmount) < 0.01 ? 'MATCHED' : 'AMOUNT_MISMATCH';
      if (result === 'MATCHED') summary.matched++;
      else if (result === 'UNMATCHED') summary.unmatched++;
      else summary.amountMismatch++;
      await tx.gatewaySettlement.upsert({
        where: { tenantId_gateway_gatewayRef: { tenantId: currentTenantId(), gateway: r.gateway, gatewayRef: r.gatewayRef } },
        create: {
          gateway: r.gateway, batchRef: r.batchRef, gatewayRef: r.gatewayRef,
          grossAmount: r.grossAmount, feeAmount: r.feeAmount ?? 0, netAmount: r.netAmount,
          settledAt: r.settledAt, matchedPosOrderId: posOrder?.id ?? null, matchResult: result,
        },
        update: { matchedPosOrderId: posOrder?.id ?? null, matchResult: result },
      });
    }
    await audit({ actor, action: 'pos.gateway.reconcile', docType: 'GatewaySettlement', docId: companyId, meta: summary }, tx as Tx);
  });
  return summary;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

async function mustOrder(id: string) {
  const so = await prisma.salesOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!so) throw new ControlError('NOT_FOUND', 'Sales order not found', 404);
  return so;
}
