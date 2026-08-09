import { z } from 'zod';
import { prisma, type Tx } from '../../core/db.js';
import { runTransition } from '../../core/controller.js';
import { audit } from '../../core/audit.js';
import { versionHash } from '../../core/hash.js';
import { nextDocNo, num, round2 } from '../../core/seq.js';
import { ControlError, DenySod } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';
import { recordConflict } from '../../iam/sod.service.js';
import { requestApproval } from '../../approval/approval.service.js';
import { PERCENT } from '../../config/calibration.js';
import type { DocState } from '../../core/statemachine.js';
import { goodsReceiptDoc, paymentBatchDoc, purchaseOrderDoc, requisitionDoc, vendorBillDoc } from './machine.js';

// ─── schemas ──────────────────────────────────────────────────────────────────

export const RequisitionInput = z.object({
  companyId: z.string(),
  costCenter: z.string().optional(),
  budgetRef: z.string().optional(),
  urgency: z.enum(['NORMAL', 'EMERGENCY']).default('NORMAL'),
  lines: z.array(z.object({ productId: z.string(), qty: z.number().positive(), estUnitPrice: z.number().nonnegative() })).min(1),
});

export const PurchaseOrderInput = z.object({
  companyId: z.string(),
  vendorId: z.string(),
  requisitionId: z.string().optional(),
  currency: z.string().default('IDR'),
  promisedAt: z.coerce.date().optional(),
  offContract: z.boolean().default(false),
  lines: z.array(z.object({ productId: z.string(), qty: z.number().positive(), unitPrice: z.number().nonnegative() })).min(1),
});

export const ReceiptInput = z.object({
  poId: z.string(),
  siteId: z.string(),
  lines: z.array(z.object({
    poLineId: z.string(), qtyAccepted: z.number().nonnegative(),
    qtyRejected: z.number().nonnegative().default(0), lotRef: z.string().optional(),
  })).min(1),
});

export const VendorBillInput = z.object({
  poId: z.string().optional(),
  vendorId: z.string(),
  companyId: z.string(),
  docNo: z.string().min(1), // supplier's number — duplicate guard
  billDate: z.coerce.date(),
  lines: z.array(z.object({
    poLineId: z.string().optional(), productId: z.string(),
    qty: z.number().positive(), unitPrice: z.number().nonnegative(),
  })).min(1),
});

// Match tolerances come from the group calibration sheet.
const QTY_TOLERANCE = PERCENT.qtyTolerancePct / 100;
const PRICE_TOLERANCE_PCT = PERCENT.priceTolerancePct;

// ─── SOP05 requisition ────────────────────────────────────────────────────────

export async function createRequisition(actor: Actor, input: z.infer<typeof RequisitionInput>) {
  assertCan(actor, 'req.create');
  const total = round2(input.lines.reduce((s, l) => s + l.qty * l.estUnitPrice, 0));
  return prisma.$transaction(async (tx) => {
    const docNo = await nextDocNo('PR', tx as Tx);
    const vh = versionHash({ docNo, ...input, total });
    const req = await tx.requisition.create({
      data: {
        docNo, companyId: input.companyId, requesterId: actor.userId,
        costCenter: input.costCenter ?? null, budgetRef: input.budgetRef ?? null,
        total, urgency: input.urgency, versionHash: vh,
        lines: { create: input.lines },
      },
    });
    await audit({ actor, action: 'req.create', docType: 'Requisition', docId: req.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return req;
  });
}

export async function submitRequisition(
  actor: Actor, id: string, opts: { budgetVariancePct?: number } = {},
) {
  assertCan(actor, requisitionDoc.get("req.submit").fn);
  const req = await prisma.requisition.findUniqueOrThrow({ where: { id } });
  return runTransition({
    actor, machine: requisitionDoc, action: 'req.submit', docId: req.id,
    current: req.status as DocState, versionHash: req.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR09', docType: 'Requisition', docId: req.id, companyId: req.companyId,
        amount: num(req.total),
        percent: { budgetVariancePct: opts.budgetVariancePct },
        flags: { emergency: req.urgency === 'EMERGENCY' },
        at: new Date(),
        payload: { docNo: req.docNo, total: num(req.total), budgetVariancePct: opts.budgetVariancePct ?? null }, actor,
      }, tx);
      return tx.requisition.update({
        where: { id: req.id },
        data: { status: approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'SUBMITTED', versionHash: approval.versionHash },
      });
    },
  });
}

// ─── SOP06 purchase order ─────────────────────────────────────────────────────

export async function createPurchaseOrder(actor: Actor, input: z.infer<typeof PurchaseOrderInput>) {
  assertCan(actor, 'po.create');
  const total = round2(input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  return prisma.$transaction(async (tx) => {
    const docNo = await nextDocNo('PO', tx as Tx);
    const vh = versionHash({ docNo, ...input, total });
    const po = await tx.purchaseOrder.create({
      data: {
        docNo, companyId: input.companyId, vendorId: input.vendorId,
        requisitionId: input.requisitionId ?? null, currency: input.currency,
        total, buyerId: actor.userId, promisedAt: input.promisedAt ?? null, versionHash: vh,
        lines: { create: input.lines },
      },
      include: { lines: true },
    });
    await audit({ actor, action: 'po.create', docType: 'PurchaseOrder', docId: po.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return po;
  });
}

export async function submitPurchaseOrder(actor: Actor, id: string, flags: { offContract?: boolean } = {}) {
  assertCan(actor, purchaseOrderDoc.get("po.submit").fn);
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
  const [vendorPoCount, vendor] = await Promise.all([
    prisma.purchaseOrder.count({ where: { vendorId: po.vendorId, status: 'EXECUTED' } }),
    prisma.party.findUnique({ where: { id: po.vendorId }, select: { restricted: true, status: true } }),
  ]);
  const vendorClass = vendor?.restricted ? 'RESTRICTED' as const
    : vendorPoCount === 0 ? 'NEW' as const : 'STANDARD' as const;
  return runTransition({
    actor, machine: purchaseOrderDoc, action: 'po.submit', docId: po.id,
    current: po.status as DocState, versionHash: po.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR10', docType: 'PurchaseOrder', docId: po.id, companyId: po.companyId,
        amount: num(po.total), currency: po.currency,
        classes: { vendor: vendorClass },
        legal: { crossBorderPayment: po.currency !== 'IDR' },
        flags: { offContract: flags.offContract ?? false },
        at: new Date(),
        payload: { docNo: po.docNo, vendorId: po.vendorId, vendorClass, total: num(po.total), lines: po.lines.length }, actor,
      }, tx);
      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'SUBMITTED',
          approvalId: approval.approvalId, versionHash: approval.versionHash,
        },
      });
    },
  });
}

// ─── SOP07 dock receipt ───────────────────────────────────────────────────────

export async function createReceipt(actor: Actor, input: z.infer<typeof ReceiptInput>) {
  assertCan(actor, 'receipt.create');
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: input.poId }, include: { lines: true } });
  if (po.status !== 'EXECUTED') throw new ControlError('PO_NOT_ISSUED', 'Receipt requires an issued PO', 409);

  return prisma.$transaction(async (tx) => {
    const docNo = await nextDocNo('GR', tx as Tx);
    const vh = versionHash({ docNo, ...input });
    const gr = await tx.goodsReceipt.create({
      data: {
        docNo, poId: po.id, siteId: input.siteId, receivedBy: actor.userId,
        versionHash: vh, lines: { create: input.lines },
      },
    });
    for (const l of input.lines) {
      await tx.purchaseOrderLine.update({ where: { id: l.poLineId }, data: { qtyReceived: { increment: l.qtyAccepted } } });
    }
    await audit({ actor, action: 'receipt.create', docType: 'GoodsReceipt', docId: gr.id, toStatus: 'DRAFT', versionHash: vh, meta: { poId: po.id } }, tx as Tx);
    // SOD02/SOD03 chain is enforced on the PO document as well.
    await audit({ actor, action: 'receipt.create', docType: 'PurchaseOrder', docId: po.id, versionHash: po.versionHash, meta: { receiptId: gr.id } }, tx as Tx);
    return gr;
  });
}

/** Dock-to-stock: putaway stamps availableAt (K20 numerator source). */
export async function putawayReceipt(actor: Actor, receiptId: string) {
  assertCan(actor, goodsReceiptDoc.get("receipt.putaway").fn);
  const gr = await prisma.goodsReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  return runTransition({
    actor, machine: goodsReceiptDoc, action: 'receipt.putaway', docId: gr.id,
    current: gr.status as DocState, versionHash: gr.versionHash,
    apply: (tx) => tx.goodsReceipt.update({ where: { id: gr.id }, data: { status: 'EXECUTED', availableAt: new Date() } }),
  });
}

// ─── 3-way match (PO ↔ Receipt ↔ Bill) ────────────────────────────────────────

export type MatchOutcome = 'MATCHED' | 'QTY_EXCEPTION' | 'PRICE_EXCEPTION' | 'MISSING_RECEIPT' | 'DUPLICATE';

export interface MatchReport {
  result: MatchOutcome;
  firstPass: boolean;
  exceptions: Array<{ poLineId: string; kind: string; po: number; received: number; billed: number; delta: number }>;
}

export async function threeWayMatch(billId: string, tx: Tx = prisma): Promise<MatchReport> {
  const bill = await tx.vendorBill.findUniqueOrThrow({ where: { id: billId }, include: { lines: true } });
  const exceptions: MatchReport['exceptions'] = [];

  const dup = await tx.vendorBill.findFirst({
    where: { vendorId: bill.vendorId, docNo: bill.docNo, id: { not: bill.id }, status: { notIn: ['CANCELLED', 'REVERSED'] } },
    select: { id: true },
  });
  if (dup) return { result: 'DUPLICATE', firstPass: false, exceptions: [] };

  if (!bill.poId) return { result: 'MISSING_RECEIPT', firstPass: false, exceptions: [] };

  const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: bill.poId }, include: { lines: true } });
  const receipts = await tx.goodsReceiptLine.findMany({ where: { receipt: { poId: po.id, status: { in: ['APPROVED', 'EXECUTED'] } } } });

  const receivedByLine = new Map<string, number>();
  for (const r of receipts) receivedByLine.set(r.poLineId, (receivedByLine.get(r.poLineId) ?? 0) + num(r.qtyAccepted));

  for (const bl of bill.lines) {
    if (!bl.poLineId) { exceptions.push({ poLineId: '-', kind: 'UNLINKED_LINE', po: 0, received: 0, billed: num(bl.qty), delta: num(bl.qty) }); continue; }
    const pol = po.lines.find((l) => l.id === bl.poLineId);
    if (!pol) { exceptions.push({ poLineId: bl.poLineId, kind: 'PO_LINE_NOT_FOUND', po: 0, received: 0, billed: num(bl.qty), delta: num(bl.qty) }); continue; }

    const received = receivedByLine.get(pol.id) ?? 0;
    const billed = num(bl.qty) + num(pol.qtyBilled);
    if (billed > received * (1 + QTY_TOLERANCE)) {
      exceptions.push({ poLineId: pol.id, kind: 'QTY', po: num(pol.qty), received, billed, delta: round2(billed - received) });
    }
    const priceDeltaPct = num(pol.unitPrice) === 0 ? 0 : Math.abs(num(bl.unitPrice) - num(pol.unitPrice)) / num(pol.unitPrice) * 100;
    if (priceDeltaPct > PRICE_TOLERANCE_PCT) {
      exceptions.push({ poLineId: pol.id, kind: 'PRICE', po: num(pol.unitPrice), received, billed: num(bl.unitPrice), delta: round2(priceDeltaPct) });
    }
  }

  const kinds = new Set(exceptions.map((e) => e.kind));
  const result: MatchOutcome = exceptions.length === 0 ? 'MATCHED'
    : kinds.has('PRICE') ? 'PRICE_EXCEPTION' : 'QTY_EXCEPTION';
  return { result, firstPass: result === 'MATCHED', exceptions };
}

export async function createBill(actor: Actor, input: z.infer<typeof VendorBillInput>) {
  assertCan(actor, 'bill.create');

  // Faktur ganda adalah cara paling umum uang keluar dua kali. Unique index
  // (vendorId, docNo) memang menahannya, tapi tanpa cek ini pemakai hanya
  // melihat P2002 mentah — tidak ada jejak audit, tidak ada nomor tagihan asli.
  const kembar = await prisma.vendorBill.findFirst({
    where: { vendorId: input.vendorId, docNo: input.docNo },
    select: { id: true, docNo: true, total: true, status: true, billDate: true },
  });
  if (kembar) {
    await audit({
      actor, action: 'bill.duplicate.blocked', docType: 'VendorBill', docId: kembar.id,
      reasonCode: 'DUPLICATE_DOCNO', meta: { docNo: input.docNo, vendorId: input.vendorId },
    });
    throw new ControlError(
      'DUPLICATE_BILL',
      `Faktur ${input.docNo} dari vendor ini sudah dicatat`,
      409,
      { existingBillId: kembar.id, existingStatus: kembar.status, existingTotal: num(kembar.total) },
    );
  }

  const total = round2(input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  return prisma.$transaction(async (tx) => {
    const vh = versionHash({ ...input, total });
    const bill = await tx.vendorBill.create({
      data: {
        docNo: input.docNo, poId: input.poId ?? null, vendorId: input.vendorId,
        companyId: input.companyId, billDate: input.billDate, total,
        preparedBy: actor.userId, versionHash: vh,
        lines: { create: input.lines.map((l) => ({ ...l, poLineId: l.poLineId ?? null })) },
      },
    });
    const match = await threeWayMatch(bill.id, tx as Tx);
    await tx.vendorBill.update({
      where: { id: bill.id },
      data: { matchResult: match.result, matchedAt: new Date(), firstPassMatch: match.firstPass },
    });
    await audit({ actor, action: 'bill.create', docType: 'VendorBill', docId: bill.id, toStatus: 'DRAFT', versionHash: vh, meta: { match } }, tx as Tx);
    return { bill, match };
  });
}

export async function submitBill(actor: Actor, billId: string) {
  assertCan(actor, vendorBillDoc.get("bill.submit").fn);
  const bill = await prisma.vendorBill.findUniqueOrThrow({ where: { id: billId } });
  const match = await threeWayMatch(billId);
  return runTransition({
    actor, machine: vendorBillDoc, action: 'bill.submit', docId: bill.id,
    current: bill.status as DocState, versionHash: bill.versionHash, meta: { match },
    apply: async (tx) => {
      if (match.result === 'DUPLICATE') throw new ControlError('DUPLICATE_BILL', 'Duplicate supplier invoice number', 409);
      const approval = await requestApproval({
        familyCode: 'AR11', docType: 'VendorBill', docId: bill.id, companyId: bill.companyId,
        amount: num(bill.total),
        percent: { priceVariancePct: maxPriceVariance(match) },
        flags: {
          qtyException: match.result === 'QTY_EXCEPTION',
          missingReceipt: match.result === 'MISSING_RECEIPT',
        },
        at: new Date(),
        payload: { docNo: bill.docNo, total: num(bill.total), match }, actor,
      }, tx);
      return tx.vendorBill.update({
        where: { id: bill.id },
        data: { status: approval.status === 'AUTO_APPROVED' ? 'APPROVED' : 'SUBMITTED', versionHash: approval.versionHash },
      });
    },
  });
}

// ─── payment batch (SOD01 + SOD08) ────────────────────────────────────────────

/** Largest unit-price deviation in the match report, in percent. */
function maxPriceVariance(match: MatchReport): number | undefined {
  const price = match.exceptions.filter((e) => e.kind === 'PRICE').map((e) => e.delta);
  return price.length ? Math.max(...price) : undefined;
}

export async function preparePaymentBatch(actor: Actor, companyId: string, billIds: string[], currency = 'IDR') {
  assertCan(actor, 'payment.prepare');
  const bills = await prisma.vendorBill.findMany({ where: { id: { in: billIds }, status: 'EXECUTED' }, include: { lines: true } });
  if (bills.length !== billIds.length) throw new ControlError('BILL_NOT_PAYABLE', 'All bills must be posted (EXECUTED)', 409);

  return prisma.$transaction(async (tx) => {
    const docNo = await nextDocNo('PAY', tx as Tx);
    const items: { billId: string; amount: number; bankAccountId: string }[] = [];
    for (const b of bills) {
      const bank = await tx.bankAccount.findFirst({ where: { partyId: b.vendorId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
      if (!bank) throw new ControlError('NO_ACTIVE_BANK', `Vendor ${b.vendorId} has no active approved bank account`, 409);
      // SOD01: the preparer must not be the creator of the beneficiary account.
      if (bank.createdBy === actor.userId) {
        await recordConflict('SOD01', 'DYNAMIC', bank.id, { actorId: actor.userId, bankAccountId: bank.id, stage: 'prepare' }, tx);
        throw DenySod('SOD01', { bankAccountId: bank.id, reason: 'preparer created the beneficiary bank account' });
      }
      items.push({ billId: b.id, amount: num(b.total), bankAccountId: bank.id });
    }
    const total = round2(items.reduce((s, i) => s + i.amount, 0));
    const vh = versionHash({ docNo, companyId, items, total });
    const batch = await tx.paymentBatch.create({
      data: { docNo, companyId, currency, total, preparedBy: actor.userId, versionHash: vh, items: { create: items } },
    });
    await audit({ actor, action: 'payment.create', docType: 'PaymentBatch', docId: batch.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return batch;
  });
}

export async function submitPaymentBatch(actor: Actor, batchId: string) {
  assertCan(actor, paymentBatchDoc.get("payment.prepare").fn);
  const batch = await prisma.paymentBatch.findUniqueOrThrow({ where: { id: batchId }, include: { items: true } });
  const recentBankChange = await prisma.bankAccount.findFirst({
    where: {
      id: { in: batch.items.map((i) => i.bankAccountId) },
      createdAt: { gt: new Date(Date.now() - 30 * 86_400_000) },
    },
    select: { id: true },
  });

  return runTransition({
    actor, machine: paymentBatchDoc, action: 'payment.prepare', docId: batch.id,
    current: batch.status as DocState, versionHash: batch.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR19', docType: 'PaymentBatch', docId: batch.id, companyId: batch.companyId,
        amount: num(batch.total), currency: batch.currency,
        legal: { crossBorderPayment: batch.currency !== 'IDR' },
        flags: { newBankAccount: Boolean(recentBankChange) },
        at: new Date(),
        payload: { docNo: batch.docNo, total: num(batch.total), items: batch.items.length }, actor,
      }, tx);
      return tx.paymentBatch.update({
        where: { id: batch.id },
        data: { status: 'SUBMITTED', approvalId: approval.approvalId, versionHash: approval.versionHash },
      });
    },
  });
}

export async function approvePaymentBatch(actor: Actor, batchId: string) {
  assertCan(actor, paymentBatchDoc.get("payment.approve").fn);
  const batch = await mustBatch(batchId);
  await assertNotBankChanger(actor, batch.items.map((i) => i.bankAccountId), 'approve');
  return runTransition({
    actor, machine: paymentBatchDoc, action: 'payment.approve', docId: batch.id,
    current: batch.status as DocState, versionHash: batch.versionHash,
    apply: (tx) => tx.paymentBatch.update({ where: { id: batch.id }, data: { status: 'APPROVED' } }),
  });
}

export async function releasePaymentBatch(actor: Actor, batchId: string, bankRef: string) {
  assertCan(actor, paymentBatchDoc.get("payment.release").fn);
  const batch = await mustBatch(batchId);
  await assertNotBankChanger(actor, batch.items.map((i) => i.bankAccountId), 'release');
  return runTransition({
    actor, machine: paymentBatchDoc, action: 'payment.release', docId: batch.id,
    current: batch.status as DocState, versionHash: batch.versionHash, meta: { bankRef },
    apply: (tx) => tx.paymentBatch.update({
      where: { id: batch.id },
      data: { status: 'EXECUTED', releasedBy: actor.userId, releasedAt: new Date(), bankRef },
    }),
  });
}

async function assertNotBankChanger(actor: Actor, bankAccountIds: string[], stage: string) {
  const own = await prisma.bankAccount.findFirst({
    where: { id: { in: bankAccountIds }, OR: [{ createdBy: actor.userId }, { verifiedBy: actor.userId }] },
    select: { id: true },
  });
  if (own) {
    await recordConflict('SOD01', 'DYNAMIC', own.id, { actorId: actor.userId, stage });
    throw DenySod('SOD01', { bankAccountId: own.id, stage });
  }
}

async function mustBatch(id: string) {
  return prisma.paymentBatch.findUniqueOrThrow({ where: { id }, include: { items: true } });
}
