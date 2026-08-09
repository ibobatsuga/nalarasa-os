import { z } from 'zod';
import { prisma, type Tx } from '../../core/db.js';
import { runTransition } from '../../core/controller.js';
import { audit } from '../../core/audit.js';
import { versionHash } from '../../core/hash.js';
import { nextDocNo, num, round2 } from '../../core/seq.js';
import { ControlError, DenyPeriodLocked } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';
import { requestApproval } from '../../approval/approval.service.js';
import type { DocState } from '../../core/statemachine.js';
import { journalDoc, payrollDoc, periodDoc } from './machine.js';

export const JournalLineInput = z.object({
  accountId: z.string(),
  debit: z.number().nonnegative().default(0),
  credit: z.number().nonnegative().default(0),
  dimension: z.string().optional(),
});

export const JournalInput = z.object({
  companyId: z.string(),
  journalCode: z.string(),
  postingDate: z.coerce.date(),
  memo: z.string().max(500).optional(),
  source: z.enum(['MANUAL', 'SUBLEDGER']).default('MANUAL'),
  sourceDocType: z.string().optional(),
  sourceDocId: z.string().optional(),
  lines: z.array(JournalLineInput).min(2),
});
export type JournalInput = z.infer<typeof JournalInput>;

// ─── period control ───────────────────────────────────────────────────────────

export async function periodOf(companyId: string, date: Date, tx: Tx = prisma) {
  const year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
  return tx.period.upsert({
    where: { companyId_year_month: { companyId, year, month } },
    create: { companyId, year, month },
    update: {},
  });
}

export async function assertPeriodOpen(companyId: string, date: Date, tx: Tx = prisma) {
  const p = await periodOf(companyId, date, tx);
  if (p.status === 'LOCKED') throw DenyPeriodLocked(p.id);
  return p;
}

export async function lockPeriod(actor: Actor, periodId: string) {
  assertCan(actor, periodDoc.get("period.lock").fn);
  const p = await prisma.period.findUniqueOrThrow({ where: { id: periodId } });
  const open = await prisma.journalEntry.count({ where: { periodId, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } } });
  if (open > 0) throw new ControlError('OPEN_JOURNALS', `${open} journal(s) not posted`, 409, { open });
  return runTransition({
    actor, machine: periodDoc, action: 'period.lock', docId: p.id,
    current: p.status, versionHash: `${p.companyId}:${p.year}-${p.month}`,
    apply: (tx) => tx.period.update({ where: { id: p.id }, data: { status: 'LOCKED', lockedBy: actor.userId, lockedAt: new Date() } }),
  });
}

/** Reopen is AR20/T4: two independent executives, never the locker. */
export async function requestReopen(actor: Actor, periodId: string, reason: string) {
  assertCan(actor, 'period.reopen');
  const p = await prisma.period.findUniqueOrThrow({ where: { id: periodId } });
  if (p.status !== 'LOCKED') throw new ControlError('NOT_LOCKED', 'Only a locked period can be reopened', 409);
  return prisma.$transaction(async (tx) => {
    const approval = await requestApproval({
      familyCode: 'AR20', docType: 'Period', docId: p.id, companyId: p.companyId,
      payload: { year: p.year, month: p.month, reason }, actor,
    }, tx);
    await tx.period.update({ where: { id: p.id }, data: { reopenApprovalId: approval.approvalId } });
    return approval;
  });
}

export async function executeReopen(actor: Actor, periodId: string) {
  assertCan(actor, periodDoc.get("period.reopen").fn);
  const p = await prisma.period.findUniqueOrThrow({ where: { id: periodId } });
  return runTransition({
    actor, machine: periodDoc, action: 'period.reopen', docId: p.id,
    current: p.status, versionHash: `${p.companyId}:${p.year}-${p.month}`,
    apply: (tx) => tx.period.update({
      where: { id: p.id },
      data: { status: 'REOPENED', reopenedBy: actor.userId, reopenedAt: new Date() },
    }),
  });
}

// ─── journals ─────────────────────────────────────────────────────────────────

function assertBalanced(lines: z.infer<typeof JournalLineInput>[]) {
  const d = round2(lines.reduce((s, l) => s + l.debit, 0));
  const c = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (d !== c) throw new ControlError('UNBALANCED', `Debit ${d} ≠ credit ${c}`, 400, { debit: d, credit: c });
  if (lines.some((l) => l.debit > 0 && l.credit > 0)) {
    throw new ControlError('MIXED_LINE', 'A line carries either a debit or a credit, not both', 400);
  }
  return d;
}

export async function createJournal(actor: Actor, input: JournalInput) {
  assertCan(actor, input.source === 'MANUAL' ? 'journal.prepare' : 'journal.post');
  const amount = assertBalanced(input.lines);
  return prisma.$transaction(async (tx) => {
    const period = await assertPeriodOpen(input.companyId, input.postingDate, tx as Tx);
    const docNo = await nextDocNo('JV', tx as Tx);
    const vh = versionHash({ docNo, ...input, amount });
    const je = await tx.journalEntry.create({
      data: {
        docNo, companyId: input.companyId, periodId: period.id, journalCode: input.journalCode,
        postingDate: input.postingDate, source: input.source,
        sourceDocType: input.sourceDocType ?? null, sourceDocId: input.sourceDocId ?? null,
        memo: input.memo ?? null, preparedBy: actor.userId, versionHash: vh,
        lines: { create: input.lines },
      },
    });
    await audit({ actor, action: 'journal.create', docType: 'JournalEntry', docId: je.id, toStatus: 'DRAFT', versionHash: vh, meta: { amount, source: input.source } }, tx as Tx);
    return { entry: je, amount };
  });
}

/** Subledger events post straight through (T0) — no manual journal exposure. */
export async function postSubledgerEvent(actor: Actor, input: JournalInput & { sourceDocType: string; sourceDocId: string }) {
  const { entry, amount } = await createJournal(actor, { ...input, source: 'SUBLEDGER' });
  return prisma.$transaction(async (tx) => {
    await tx.journalEntry.update({
      where: { id: entry.id },
      data: { status: 'EXECUTED', postedBy: actor.userId, postedAt: new Date() },
    });
    await audit({ actor, action: 'journal.post', docType: 'JournalEntry', docId: entry.id, fromStatus: 'DRAFT', toStatus: 'EXECUTED', reasonCode: 'T0_SUBLEDGER', versionHash: entry.versionHash, meta: { amount } }, tx as Tx);
    return entry;
  });
}

export async function submitJournal(actor: Actor, entryId: string) {
  assertCan(actor, journalDoc.get("journal.prepare").fn);
  const je = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: { include: { account: true } } } });
  const amount = round2(je.lines.reduce((s, l) => s + num(l.debit), 0));
  const restricted = je.lines.some((l) => l.account.restricted);
  const priorPeriod = je.postingDate < new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const taxSensitive = /TAX|PPN|PPH|FAKTUR/i.test(je.journalCode) ||
    je.lines.some((l) => /pajak|tax|ppn|pph/i.test(l.account.name));

  return runTransition({
    actor, machine: journalDoc, action: 'journal.prepare', docId: je.id,
    current: je.status as DocState, versionHash: je.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR18', docType: 'JournalEntry', docId: je.id, companyId: je.companyId,
        amount,
        legal: { taxSensitivePosting: taxSensitive },
        flags: { restrictedAccount: restricted, priorPeriod },
        at: new Date(),
        payload: { docNo: je.docNo, amount, lines: je.lines.length, taxSensitive }, actor,
      }, tx);
      return tx.journalEntry.update({
        where: { id: je.id },
        data: { status: 'SUBMITTED', approvalId: approval.approvalId, versionHash: approval.versionHash },
      });
    },
  });
}

export async function postJournal(actor: Actor, entryId: string) {
  assertCan(actor, journalDoc.get("journal.post").fn);
  const je = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId } });
  await assertPeriodOpenById(je.periodId);
  return runTransition({
    actor, machine: journalDoc, action: 'journal.post', docId: je.id,
    current: je.status as DocState, versionHash: je.versionHash,
    apply: (tx) => tx.journalEntry.update({
      where: { id: je.id },
      data: { status: 'EXECUTED', postedBy: actor.userId, postedAt: new Date() },
    }),
  });
}

/** Zero hard-delete: correction = mirrored reversing entry, never an update. */
export async function reverseJournal(actor: Actor, entryId: string, reasonCode: string) {
  assertCan(actor, journalDoc.get("journal.reverse").fn);
  const je = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
  await assertPeriodOpenById(je.periodId);
  return runTransition({
    actor, machine: journalDoc, action: 'journal.reverse', docId: je.id,
    current: je.status as DocState, versionHash: je.versionHash, reasonCode,
    apply: async (tx) => {
      const docNo = await nextDocNo('JVR', tx as Tx);
      const mirror = await tx.journalEntry.create({
        data: {
          docNo, companyId: je.companyId, periodId: je.periodId, journalCode: je.journalCode,
          postingDate: new Date(), source: 'SUBLEDGER', sourceDocType: 'JournalEntry', sourceDocId: je.id,
          memo: `Reversal of ${je.docNo}`, status: 'EXECUTED', preparedBy: actor.userId,
          postedBy: actor.userId, postedAt: new Date(), reversalOfId: je.id,
          versionHash: versionHash({ docNo, reversalOf: je.id }),
          lines: { create: je.lines.map((l) => ({ accountId: l.accountId, debit: num(l.credit), credit: num(l.debit), dimension: l.dimension })) },
        },
      });
      await tx.journalEntry.update({ where: { id: je.id }, data: { status: 'REVERSED' } });
      return mirror;
    },
  });
}

async function assertPeriodOpenById(periodId: string) {
  const p = await prisma.period.findUniqueOrThrow({ where: { id: periodId } });
  if (p.status === 'LOCKED') throw DenyPeriodLocked(p.id);
}

// ─── bank / GL reconciliation ─────────────────────────────────────────────────

export async function reconcileBank(actor: Actor, companyId: string, lines: Array<{
  bankRef: string; valueDate: Date; amount: number; description?: string;
}>) {
  assertCan(actor, 'bank.reconcile');
  const summary = { matched: 0, unmatched: 0 };
  await prisma.$transaction(async (tx) => {
    for (const l of lines) {
      const batch = await tx.paymentBatch.findFirst({ where: { companyId, bankRef: l.bankRef, status: 'EXECUTED' } });
      const matched = batch && Math.abs(num(batch.total) + l.amount) < 0.01;
      if (matched) summary.matched++; else summary.unmatched++;
      await tx.bankStatementLine.upsert({
        where: { companyId_bankRef: { companyId, bankRef: l.bankRef } },
        create: {
          companyId, bankRef: l.bankRef, valueDate: l.valueDate, amount: l.amount,
          description: l.description ?? null,
          matchedType: matched ? 'PaymentBatch' : null, matchedId: matched ? batch!.id : null,
          reconciledAt: matched ? new Date() : null,
        },
        update: { matchedType: matched ? 'PaymentBatch' : null, matchedId: matched ? batch?.id ?? null : null, reconciledAt: matched ? new Date() : null },
      });
      if (matched) await tx.paymentBatch.update({ where: { id: batch!.id }, data: { reconciledAt: new Date() } });
    }
    await audit({ actor, action: 'bank.reconcile', docType: 'BankStatementLine', docId: companyId, meta: summary }, tx as Tx);
  });
  return summary;
}

// ─── payroll (SOD09 / K47) ────────────────────────────────────────────────────

export const PayrollInput = z.object({
  companyId: z.string(),
  postingDate: z.coerce.date(),
  payslips: z.array(z.object({
    employeeNo: z.string(), gross: z.number().nonnegative(), net: z.number().nonnegative(),
  })).min(1),
});

export async function runPayroll(actor: Actor, input: z.infer<typeof PayrollInput>) {
  assertCan(actor, 'payroll.run');
  return prisma.$transaction(async (tx) => {
    const period = await assertPeriodOpen(input.companyId, input.postingDate, tx as Tx);
    const docNo = await nextDocNo('PRL', tx as Tx);
    const grossTotal = round2(input.payslips.reduce((s, p) => s + p.gross, 0));
    const netTotal = round2(input.payslips.reduce((s, p) => s + p.net, 0));
    const vh = versionHash({ docNo, ...input, grossTotal, netTotal });
    const run = await tx.payrollRun.create({
      data: {
        docNo, companyId: input.companyId, periodId: period.id, grossTotal, netTotal,
        headcount: input.payslips.length, runBy: actor.userId, versionHash: vh,
        payslips: { create: input.payslips },
      },
    });
    await audit({ actor, action: 'payroll.create', docType: 'PayrollRun', docId: run.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return run;
  });
}

export async function submitPayroll(actor: Actor, runId: string) {
  assertCan(actor, payrollDoc.get("payroll.run").fn);
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  return runTransition({
    actor, machine: payrollDoc, action: 'payroll.run', docId: run.id,
    current: run.status as DocState, versionHash: run.versionHash,
    apply: async (tx) => {
      const approval = await requestApproval({
        familyCode: 'AR23', docType: 'PayrollRun', docId: run.id, companyId: run.companyId,
        amount: num(run.netTotal),
        payload: { docNo: run.docNo, headcount: run.headcount, netTotal: num(run.netTotal) }, actor,
      }, tx);
      return tx.payrollRun.update({
        where: { id: run.id },
        data: { status: 'SUBMITTED', approvalId: approval.approvalId, versionHash: approval.versionHash },
      });
    },
  });
}

export async function payPayroll(actor: Actor, runId: string) {
  assertCan(actor, payrollDoc.get("payroll.pay").fn);
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  return runTransition({
    actor, machine: payrollDoc, action: 'payroll.pay', docId: run.id,
    current: run.status as DocState, versionHash: run.versionHash,
    apply: (tx) => tx.payrollRun.update({
      where: { id: run.id },
      data: { status: 'EXECUTED', paidBy: actor.userId, paidAt: new Date() },
    }),
  });
}
