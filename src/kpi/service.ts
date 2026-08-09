import { prisma } from '../core/db.js';
import { versionHash } from '../core/hash.js';
import { num, ratio, round2 } from '../core/seq.js';
import { ControlError } from '../core/errors.js';
import type { Actor } from '../core/types.js';
import { assertCan } from '../iam/rbac.js';
import { audit } from '../core/audit.js';
import { CONTROL_HEALTH_WEIGHTS, KPI_BY_CODE, KPI_DEFS, type KpiDef } from './registry.js';

export interface Window { companyId: string; from: Date; to: Date }

export interface KpiResult {
  code: string;
  name: string;
  version: string;
  unit: KpiDef['unit'];
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  target: number | null;
  lineage: {
    formula: string;
    sources: readonly string[];
    filters: Record<string, unknown>;
    components?: Record<string, unknown>;
    inputHash: string;
  };
}

const DAYS = (w: Window) => Math.max(1, Math.round((w.to.getTime() - w.from.getTime()) / 86_400_000));

function build(def: KpiDef, w: Window, num_: number | null, den: number | null, value: number | null, extra: Record<string, unknown> = {}, target: number | null = null): KpiResult {
  return {
    code: def.code, name: def.name, version: def.version, unit: def.unit,
    value, numerator: num_, denominator: den, target,
    lineage: {
      formula: def.formula, sources: def.sources,
      filters: { companyId: w.companyId, from: w.from.toISOString(), to: w.to.toISOString() },
      components: extra,
      inputHash: versionHash({ code: def.code, w, num_, den, extra }),
    },
  };
}

const rangeOf = (w: Window) => ({ gte: w.from, lte: w.to });

// ─── K01 net revenue vs plan ──────────────────────────────────────────────────

export async function netRevenue(w: Window): Promise<number> {
  const agg = await prisma.invoice.aggregate({
    _sum: { total: true },
    where: { companyId: w.companyId, status: 'EXECUTED', issuedAt: rangeOf(w) },
  });
  return round2(num(agg._sum.total));
}

export async function k01(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K01')!;
  const revenue = await netRevenue(w);
  const plan = await prisma.kpiPlan.findFirst({
    where: { kpiCode: 'K01', companyId: w.companyId, periodStart: { lte: w.from }, periodEnd: { gte: w.to } },
  });
  const target = plan ? num(plan.target) : null;
  return build(def, w, revenue, target, target ? Number(ratio(revenue, target).toFixed(4)) : null, { planApprovedBy: plan?.approvedBy ?? null }, target);
}

// ─── K02 gross margin ─────────────────────────────────────────────────────────

export async function k02(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K02')!;
  const orders = await prisma.salesOrder.findMany({
    where: { companyId: w.companyId, billedAt: rangeOf(w), status: { notIn: ['CANCELLED', 'REVERSED'] } },
    include: { lines: true },
  });
  let net = 0, cogs = 0;
  for (const o of orders) {
    for (const l of o.lines) {
      const gross = num(l.qty) * num(l.unitPrice);
      net += gross - gross * (num(l.discPct) / 100);
      cogs += num(l.qty) * num(l.unitCost);
    }
  }
  net = round2(net); cogs = round2(cogs);
  return build(def, w, round2(net - cogs), net, Number(ratio(net - cogs, net).toFixed(4)), { orders: orders.length, cogs });
}

// ─── K37 DSO, K40 DPO, K03 CCC ────────────────────────────────────────────────

export async function k37(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K37')!;
  const days = DAYS(w);
  const [openAr, sales] = await Promise.all([
    prisma.invoice.aggregate({ _sum: { total: true, settled: true }, where: { companyId: w.companyId, status: 'EXECUTED', issuedAt: { lte: w.to } } }),
    netRevenue(w),
  ]);
  const ar = round2(num(openAr._sum.total) - num(openAr._sum.settled));
  const dso = sales === 0 ? 0 : round2((ar / sales) * days);
  return build(def, w, ar, sales, dso, { days });
}

export async function k40(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K40')!;
  const days = DAYS(w);
  const [openAp, purchases] = await Promise.all([
    prisma.vendorBill.aggregate({ _sum: { total: true }, where: { companyId: w.companyId, status: 'EXECUTED', billDate: { lte: w.to } } }),
    prisma.vendorBill.aggregate({ _sum: { total: true }, where: { companyId: w.companyId, status: 'EXECUTED', billDate: rangeOf(w) } }),
  ]);
  const paid = await prisma.paymentItem.aggregate({
    _sum: { amount: true },
    where: { batch: { companyId: w.companyId, status: 'EXECUTED', releasedAt: { lte: w.to } } },
  });
  const ap = round2(num(openAp._sum.total) - num(paid._sum.amount));
  const purch = round2(num(purchases._sum.total));
  const dpo = purch === 0 ? 0 : round2((ap / purch) * days);
  return build(def, w, ap, purch, dpo, { days });
}

/** DIO proxy: received-not-yet-delivered value / COGS × days (documented in lineage). */
export async function k03(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K03')!;
  const days = DAYS(w);
  const [dsoR, dpoR, marginR] = await Promise.all([k37(w), k40(w), k02(w)]);
  const cogs = num(marginR.lineage.components?.cogs);
  const receipts = await prisma.goodsReceiptLine.findMany({
    where: { receipt: { status: 'EXECUTED', receivedAt: { lte: w.to } } },
    include: { receipt: { select: { poId: true } } },
  });
  const poLines = await prisma.purchaseOrderLine.findMany({ where: { po: { companyId: w.companyId } } });
  const priceOf = new Map(poLines.map((l) => [l.id, num(l.unitPrice)]));
  const receivedValue = round2(receipts.reduce((s, r) => s + num(r.qtyAccepted) * (priceOf.get(r.poLineId) ?? 0), 0));
  const inventory = Math.max(0, round2(receivedValue - cogs));
  const dio = cogs === 0 ? 0 : round2((inventory / cogs) * days);
  const ccc = round2(dio + num(dsoR.value) - num(dpoR.value));
  return build(def, w, null, null, ccc, {
    dio, dso: dsoR.value, dpo: dpoR.value, inventoryProxy: inventory, cogs, days,
    assumption: 'DIO uses received-value minus COGS as inventory proxy (no perpetual stock ledger)',
  });
}

// ─── K04 OTIF ─────────────────────────────────────────────────────────────────

export async function k04(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K04')!;
  const orders = await prisma.salesOrder.findMany({
    where: { companyId: w.companyId, deliveredAt: rangeOf(w) },
    include: { lines: true },
  });
  let ok = 0;
  for (const o of orders) {
    const onTime = o.promisedAt ? o.deliveredAt! <= o.promisedAt : true;
    const inFull = o.lines.every((l) => num(l.qtyShipped) >= num(l.qty));
    if (onTime && inFull) ok++;
  }
  return build(def, w, ok, orders.length, Number(ratio(ok, orders.length).toFixed(4)));
}

// ─── K17 / K43 / K44 / K47 / K63 / K20 ────────────────────────────────────────

export async function k17(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K17')!;
  const where = { companyId: w.companyId, matchedAt: rangeOf(w) };
  const [total, first] = await Promise.all([
    prisma.vendorBill.count({ where }),
    prisma.vendorBill.count({ where: { ...where, firstPassMatch: true } }),
  ]);
  return build(def, w, first, total, Number(ratio(first, total).toFixed(4)));
}

export async function k43(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K43')!;
  const [manual, all] = await Promise.all([
    prisma.journalLine.count({ where: { entry: { companyId: w.companyId, source: 'MANUAL', status: 'EXECUTED', postingDate: rangeOf(w) } } }),
    prisma.journalLine.count({ where: { entry: { companyId: w.companyId, status: 'EXECUTED', postingDate: rangeOf(w) } } }),
  ]);
  return build(def, w, manual, all, Number(ratio(manual, all).toFixed(4)));
}

export async function k44(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K44')!;
  const where = { companyId: w.companyId, createdAt: rangeOf(w) };
  const [attempts, failed] = await Promise.all([
    prisma.paymentBatch.count({ where }),
    prisma.paymentBatch.count({ where: { ...where, status: { in: ['REVERSED', 'CANCELLED'] } } }),
  ]);
  return build(def, w, failed, attempts, Number(ratio(failed, attempts).toFixed(4)));
}

export async function k47(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K47')!;
  const runs = await prisma.payrollRun.findMany({
    where: { companyId: w.companyId, status: 'EXECUTED', paidAt: rangeOf(w) },
    select: { id: true },
  });
  const ids = runs.map((r) => r.id);
  const [total, corrected] = await Promise.all([
    prisma.payslip.count({ where: { runId: { in: ids } } }),
    prisma.payslip.count({ where: { runId: { in: ids }, corrected: true } }),
  ]);
  return build(def, w, total - corrected, total, Number(ratio(total - corrected, total).toFixed(4)), { runs: ids.length, corrected });
}

export async function k63(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K63')!;
  const open = await prisma.sodConflict.count({ where: { status: 'OPEN', detectedAt: { lte: w.to } } });
  return build(def, w, open, null, open, { target: 0 }, 0);
}

export async function k20(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K20')!;
  const rows = await prisma.goodsReceipt.findMany({
    where: { status: 'EXECUTED', availableAt: rangeOf(w) },
    select: { receivedAt: true, availableAt: true },
  });
  const hours = rows.map((r) => (r.availableAt!.getTime() - r.receivedAt.getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = hours.length === 0 ? 0 : hours[Math.floor(hours.length / 2)]!;
  return build(def, w, rows.length, null, Number((median / 24).toFixed(4)), { medianHours: round2(median) });
}

// ─── K05 control health index ─────────────────────────────────────────────────

export async function k05(w: Window): Promise<KpiResult> {
  const def = KPI_BY_CODE.get('K05')!;
  const range = rangeOf(w);

  const [openSod, approvals, lateApprovals, matchR, batches, reconciled, periods, lockedPeriods] = await Promise.all([
    prisma.sodConflict.count({ where: { status: 'OPEN' } }),
    prisma.approvalRequest.count({ where: { companyId: w.companyId, createdAt: range, status: { in: ['APPROVED', 'REJECTED'] } } }),
    prisma.approvalRequest.count({ where: { companyId: w.companyId, createdAt: range, status: 'EXPIRED' } }),
    k17(w),
    prisma.paymentBatch.count({ where: { companyId: w.companyId, status: 'EXECUTED', releasedAt: range } }),
    prisma.paymentBatch.count({ where: { companyId: w.companyId, status: 'EXECUTED', releasedAt: range, reconciledAt: { not: null } } }),
    prisma.period.count({ where: { companyId: w.companyId } }),
    prisma.period.count({ where: { companyId: w.companyId, status: { in: ['LOCKED', 'SOFT_CLOSED'] } } }),
  ]);

  const components = {
    sodClean: openSod === 0 ? 1 : 0,
    approvalOnTime: ratio(approvals, approvals + lateApprovals),
    matchFirstPass: matchR.value ?? 1,
    bankReconciled: ratio(reconciled, batches || 1),
    periodLocked: ratio(lockedPeriods, periods || 1),
  };

  let weighted = 0, weight = 0;
  for (const [k, wgt] of Object.entries(CONTROL_HEALTH_WEIGHTS)) {
    weighted += wgt * (components[k as keyof typeof components] ?? 0);
    weight += wgt;
  }
  const index = Number(ratio(weighted, weight).toFixed(4));
  return build(def, w, round2(weighted), weight, index, { ...components, openSodConflicts: openSod, weights: CONTROL_HEALTH_WEIGHTS }, 1);
}

// ─── executive pack + persistence ─────────────────────────────────────────────

const COMPUTERS: Record<string, (w: Window) => Promise<KpiResult>> = {
  K01: k01, K02: k02, K03: k03, K04: k04, K05: k05,
  K17: k17, K20: k20, K37: k37, K40: k40, K43: k43, K44: k44, K47: k47, K63: k63,
};

export const IMPLEMENTED_KPIS = Object.keys(COMPUTERS);

export async function computeKpi(code: string, w: Window): Promise<KpiResult> {
  const fn = COMPUTERS[code];
  if (!fn) throw new ControlError('KPI_NOT_IMPLEMENTED', `KPI ${code} has a definition but no computer`, 501, { code, defined: KPI_DEFS.some((d) => d.code === code) });
  return fn(w);
}

export async function executivePack(w: Window, codes: string[] = ['K01', 'K02', 'K03', 'K04', 'K05', 'K47']): Promise<KpiResult[]> {
  return Promise.all(codes.map((c) => computeKpi(c, w)));
}

/** Persisted snapshot = the certifiable artefact (SOD14 splits define vs certify). */
export async function snapshot(actor: Actor, w: Window, codes: string[]): Promise<KpiResult[]> {
  assertCan(actor, 'kpi.read');
  const results = await Promise.all(codes.map((c) => computeKpi(c, w)));
  for (const r of results) {
    await prisma.kpiSnapshot.upsert({
      where: {
        kpiCode_companyId_periodStart_periodEnd_defVersion: {
          kpiCode: r.code, companyId: w.companyId, periodStart: w.from, periodEnd: w.to, defVersion: r.version,
        },
      },
      create: {
        kpiCode: r.code, defVersion: r.version, companyId: w.companyId,
        periodStart: w.from, periodEnd: w.to, value: r.value, numerator: r.numerator,
        denominator: r.denominator, target: r.target, lineage: r.lineage as object,
      },
      update: { value: r.value, numerator: r.numerator, denominator: r.denominator, target: r.target, lineage: r.lineage as object, computedAt: new Date() },
    });
  }
  await audit({ actor, action: 'kpi.snapshot', docType: 'KpiSnapshot', docId: w.companyId, meta: { codes, from: w.from, to: w.to } });
  return results;
}

/** SOD14: the actor who defined/computed may not be the sole certifier. */
export async function certify(actor: Actor, snapshotId: string) {
  assertCan(actor, 'kpi.certify');
  const snap = await prisma.kpiSnapshot.findUniqueOrThrow({ where: { id: snapshotId } });
  const { assertChain } = await import('../iam/sod.service.js');
  await assertChain(actor, 'KpiSnapshot', snapshotId, 'kpi.certify', ['kpi.define']);
  const updated = await prisma.kpiSnapshot.update({
    where: { id: snapshotId },
    data: { certifiedBy: actor.userId, certifiedAt: new Date() },
  });
  await audit({ actor, action: 'kpi.certify', docType: 'KpiSnapshot', docId: snapshotId, versionHash: (snap.lineage as { inputHash?: string }).inputHash ?? null });
  return updated;
}
