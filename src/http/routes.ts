import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../core/db.js';
import { ROLES } from '../config/roles.js';
import { SOD_RULES } from '../config/sod.js';
import { APPROVAL_FAMILIES } from '../config/approval-families.js';
import { FUNCTIONS } from '../config/functions.js';
import { KPI_DEFS } from '../kpi/registry.js';
import { DecisionInput, decide, expireOverdue } from '../approval/approval.service.js';
import { bandMatrix, resolveBand } from '../approval/band.js';
import { calibrationSheet } from '../config/calibration.js';
import { effectiveFunctions, assertCan } from '../iam/rbac.js';
import { evaluateRoleSet, selfCheckRoleCatalogue, syncUserConflicts } from '../iam/sod.service.js';
import * as masters from '../masters/service.js';
import { AccountSchema, BankAccountSchema, PartySchema, ProductSchema, UomSchema } from '../masters/schemas.js';
import * as o2c from '../domains/o2c/service.js';
import { SyncRequest, setCashierPin, syncTill, tillBootstrap } from '../domains/o2c/pos-sync.js';
import {
  AvailabilityInput, BumpInput, bumpTicket, kitchenStats, listTickets,
  menuStatus, setAvailability, setLineReady,
} from '../domains/kitchen/service.js';
import * as manage from '../domains/manage/service.js';
import * as finance from '../domains/finance/service.js';

/** Rentang tanggal opsional; layanan memakai bulan berjalan bila kosong. */
const TANGGAL = z.object({
  dari: z.coerce.date().optional(),
  sampai: z.coerce.date().optional(),
});
import {
  ClockInput, LeaveInput, clockIn, clockOut, myAttendance, myLeaveBalance,
  myLeaves, myPayslips, myProfile, myShifts, requestLeave,
} from '../domains/hr/ess.service.js';
import * as p2p from '../domains/p2p/service.js';
import { PurchaseOrderInput, ReceiptInput, RequisitionInput, VendorBillInput } from '../domains/p2p/service.js';
import * as r2r from '../domains/r2r/service.js';
import { JournalInput, PayrollInput } from '../domains/r2r/service.js';
import * as kpi from '../kpi/service.js';
import * as auth from '../iam/auth.js';
import * as jml from '../iam/jml.js';
import { PLANS, provisionTenant, suspendTenant } from '../tenancy/provision.js';
import { activeSheet, publishCalibration } from '../config/calibration-store.js';
import { currentTenant } from '../core/tenant.js';

const WindowQuery = z.object({
  companyId: z.string(),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // ── meta / config (no auth) ────────────────────────────────────────────────
  app.get('/health', async () => ({ ok: true }));
  app.get('/meta/roles', async () => ROLES);
  app.get('/meta/functions', async () => FUNCTIONS);
  app.get('/meta/sod', async () => SOD_RULES);
  app.get('/meta/approval-families', async () => APPROVAL_FAMILIES);
  app.get('/meta/kpi', async () => KPI_DEFS);
  app.get('/meta/calibration', async () => activeSheet());
  app.get('/meta/plans', async () => PLANS);
  app.get('/meta/calibration/template', async () => calibrationSheet());
  app.get('/meta/calibration/matrix', async () => bandMatrix());
  app.get('/meta/sod/self-check', async () => selfCheckRoleCatalogue());

  // ── platform (tenant-less; protect with a platform key at the edge) ────────
  app.post('/platform/tenants', async (req) => {
    const b = z.object({
      slug: z.string(), name: z.string(),
      plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS']).optional(),
      companyCode: z.string(), companyName: z.string(),
      sites: z.array(z.object({ code: z.string(), name: z.string(), isPos: z.boolean().optional() })).min(1),
      admin: z.object({
        subjectId: z.string(), displayName: z.string(),
        email: z.string().email().optional(), password: z.string().min(12),
      }),
      currency: z.string().optional(), timezone: z.string().optional(),
    }).parse(req.body);
    return provisionTenant(b);
  });

  app.post('/platform/tenants/:id/suspend', async (req) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);
    return suspendTenant((req.params as { id: string }).id, reason);
  });

  // ── tenant calibration ────────────────────────────────────────────────────
  app.get('/tenant/calibration', async (req) => {
    assertCan(req.actor, 'kpi.read');
    return { tenant: currentTenant()?.slug, sheet: activeSheet() };
  });

  app.post('/tenant/calibration', async (req) => {
    assertCan(req.actor, 'role.approve');
    const sheet = z.object({ version: z.string(), hash: z.string() }).passthrough().parse(req.body);
    const ctx = currentTenant()!;
    await publishCalibration(ctx.tenantId, sheet as never, req.actor.userId);
    return { published: sheet.version };
  });

  /**
   * Konteks pemakai setelah masuk: perusahaan dan outlet yang boleh diaksesnya.
   * Tanpa ini klien tidak punya cara mengetahui companyId, dan setiap panggilan
   * KPI diam-diam dilewati — dashboard lalu menampilkan angka contoh tanpa
   * satu pun galat yang bisa dilihat.
   */
  app.get('/me/context', async (req) => {
    const [companies, sites] = await Promise.all([
      prisma.company.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
      prisma.site.findMany({ select: { id: true, code: true, name: true, isPos: true }, orderBy: { code: 'asc' } }),
    ]);
    return {
      userId: req.actor.userId,
      roleCodes: req.actor.roleCodes,
      companies,
      sites,
    };
  });

  // ── auth ──────────────────────────────────────────────────────────────────
  /**
   * Penguncian akun sudah menahan tebakan terhadap SATU akun. Yang tidak
   * ditahannya adalah penyemprotan sandi: satu tebakan populer dicoba ke ratusan
   * subjectId, tak satu pun mencapai lima kegagalan. Batas per-IP inilah yang
   * menutupnya, dan sekaligus melindungi scrypt — tiap percobaan kini menghabiskan
   * 60 ms CPU server, jadi login yang tak dibatasi adalah pintu DoS.
   */
  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const b = z.object({ subjectId: z.string(), password: z.string() }).parse(req.body);
    const r = await auth.login(b.subjectId, b.password, { ip: req.ip, userAgent: req.headers['user-agent'] });
    return reply.send({
      token: r.token, expiresAt: r.expiresAt, mustChange: r.mustChange,
      actor: { userId: r.actor.userId, roleCodes: r.actor.roleCodes },
    });
  });

  app.post('/auth/logout', async (req) => {
    const header = req.headers.authorization ?? '';
    await auth.logout(header.replace(/^Bearer /, ''));
    return { ok: true };
  });

  app.post('/auth/password', async (req) => {
    const b = z.object({ current: z.string(), next: z.string() }).parse(req.body);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: req.actor.userId } });
    await auth.login(me.subjectId, b.current, { ip: req.ip }); // proves possession
    await auth.setPassword(req.actor.userId, b.next, false);
    await auth.revokeAllSessions(req.actor.userId);
    return { ok: true, reLoginRequired: true };
  });

  // ── JML ───────────────────────────────────────────────────────────────────
  app.post('/iam/joiner', async (req) => {
    const b = z.object({
      subjectId: z.string(), displayName: z.string(), email: z.string().email().optional(),
      employeeNo: z.string().optional(), department: z.string().optional(),
      companyId: z.string(), siteId: z.string().optional(),
      roleCodes: z.array(z.string()).min(1), joinedAt: z.coerce.date().optional(),
      sodMitigation: z.string().optional(),
    }).parse(req.body);
    return jml.joiner(req.actor, b);
  });

  app.post('/iam/mover', async (req) => {
    const b = z.object({
      userId: z.string(), addRoles: z.array(z.string()).optional(),
      removeRoles: z.array(z.string()).optional(), department: z.string().optional(),
      companyId: z.string(), siteId: z.string().optional(),
      sodMitigation: z.string().optional(),
    }).parse(req.body);
    return jml.mover(req.actor, b);
  });

  app.post('/iam/leaver', async (req) => {
    const b = z.object({ userId: z.string(), terminatedAt: z.coerce.date().optional() }).parse(req.body);
    return jml.leaver(req.actor, b.userId, b.terminatedAt);
  });

  app.post('/iam/recertify', async (req) => {
    const b = z.object({ userId: z.string(), keepRoleCodes: z.array(z.string()), reasonCode: z.string().min(2) }).parse(req.body);
    return jml.recertify(req.actor, b.userId, b.keepRoleCodes, b.reasonCode);
  });

  // ── IAM ───────────────────────────────────────────────────────────────────
  app.get('/iam/me', async (req) => ({
    actor: req.actor,
    functions: [...effectiveFunctions(req.actor)],
    conflicts: evaluateRoleSet(req.actor.roleCodes),
  }));

  app.post('/iam/assignments', async (req) => {
    const body = z.object({ userId: z.string(), roleCode: z.string(), companyId: z.string().optional(), siteId: z.string().optional() }).parse(req.body);
    assertCan(req.actor, 'role.admin');
    const role = await prisma.role.findUniqueOrThrow({ where: { code: body.roleCode } });
    const existing = await prisma.userRole.findMany({ where: { userId: body.userId, revokedAt: null }, include: { role: true } });
    const next = [...existing.map((e) => e.role.code), body.roleCode];
    const conflicts = evaluateRoleSet(next);
    const assignment = await prisma.userRole.create({
      data: { userId: body.userId, roleId: role.id, companyId: body.companyId ?? null, siteId: body.siteId ?? null, grantedBy: req.actor.userId },
    });
    await syncUserConflicts(body.userId, next);
    return { assignment, conflicts, requiresApproval: role.privileged || conflicts.length > 0 };
  });

  app.get('/iam/sod/conflicts', async (req) => {
    assertCan(req.actor, 'audit.read');
    return prisma.sodConflict.findMany({ where: { status: 'OPEN' }, orderBy: { detectedAt: 'desc' }, take: 200 });
  });

  // ── approvals ─────────────────────────────────────────────────────────────
  app.get('/approvals/pending', async (req) =>
    prisma.approvalRequest.findMany({
      where: { status: 'PENDING', makerId: { not: req.actor.userId } },
      orderBy: { createdAt: 'asc' }, take: 100, include: { decisions: true },
    }));

  app.get('/approvals/:id', async (req) => {
    const { id } = req.params as { id: string };
    return prisma.approvalRequest.findUniqueOrThrow({ where: { id }, include: { decisions: true } });
  });

  app.post('/approvals/decide', async (req) => decide(DecisionInput.parse(req.body), req.actor));
  app.post('/approvals/expire', async (req) => { assertCan(req.actor, 'audit.read'); return { expired: await expireOverdue() }; });
  app.post('/approvals/simulate-band', async (req) => {
    const body = z.object({
      familyCode: z.string(),
      amount: z.number().optional(),
      percent: z.object({
        discountPct: z.number().optional(), marginPct: z.number().optional(),
        budgetVariancePct: z.number().optional(), priceVariancePct: z.number().optional(),
        shrinkPct: z.number().optional(),
      }).optional(),
      classes: z.object({
        vendor: z.enum(['STANDARD', 'NEW', 'SOLE_SOURCE', 'RESTRICTED']).optional(),
        customer: z.enum(['STANDARD', 'NEW', 'CREDIT_HOLD', 'RESTRICTED']).optional(),
        product: z.enum(['STANDARD', 'PERISHABLE', 'CONTROLLED', 'RESTRICTED']).optional(),
      }).optional(),
      legal: z.record(z.boolean()).optional(),
      siteCode: z.string().optional(),
      at: z.coerce.date().optional(),
      flags: z.record(z.boolean()).optional(),
    }).parse(req.body);
    const r = resolveBand(body.familyCode, body);
    return { familyCode: r.family.code, band: r.band, quorum: r.quorum, drivers: r.drivers, calibration: r.calibration };
  });

  // ── master data ───────────────────────────────────────────────────────────
  app.post('/masters/parties', async (req) => masters.createParty(req.actor, PartySchema.parse(req.body)));
  app.post('/masters/parties/:id/activate', async (req) => masters.activateParty(req.actor, (req.params as { id: string }).id));
  app.post('/masters/bank-accounts', async (req) => masters.requestBankChange(req.actor, BankAccountSchema.parse(req.body)));
  app.post('/masters/bank-accounts/:id/verify', async (req) => {
    const { callbackRef } = z.object({ callbackRef: z.string().min(3) }).parse(req.body);
    return masters.verifyBankChange(req.actor, (req.params as { id: string }).id, callbackRef);
  });
  app.post('/masters/bank-accounts/:id/activate', async (req) => masters.activateBankAccount(req.actor, (req.params as { id: string }).id));
  app.post('/masters/uoms', async (req) => masters.createUom(req.actor, UomSchema.parse(req.body)));
  app.post('/masters/products', async (req) => masters.createProduct(req.actor, ProductSchema.parse(req.body)));
  app.post('/masters/products/:id/activate', async (req) => masters.activateProduct(req.actor, (req.params as { id: string }).id));
  app.post('/masters/accounts', async (req) => masters.createAccount(req.actor, AccountSchema.parse(req.body)));

  // ── O2C / POS ─────────────────────────────────────────────────────────────
  app.post('/o2c/orders', async (req) => o2c.createOrder(req.actor, o2c.SalesOrderInput.parse(req.body)));
  app.post('/o2c/orders/:id/submit', async (req) => o2c.submitOrder(req.actor, (req.params as { id: string }).id));
  app.post('/o2c/orders/:id/confirm', async (req) => o2c.confirmOrder(req.actor, (req.params as { id: string }).id));
  app.post('/o2c/orders/:id/:step', async (req) => {
    const { id, step } = req.params as { id: string; step: 'reserve' | 'deliver' | 'bill' | 'settle' };
    return o2c.advanceOrder(req.actor, id, step, (req.body ?? {}) as Record<string, unknown>);
  });

  app.post('/pos/sessions', async (req) => {
    const b = z.object({ siteId: z.string(), companyId: z.string(), openingFloat: z.number().nonnegative().default(0) }).parse(req.body);
    return o2c.openPosSession(req.actor, b.siteId, b.companyId, b.openingFloat);
  });
  app.post('/pos/sessions/:id/orders', async (req) => {
    // Baris pesanan WAJIB ikut: tanpanya dapur tidak pernah menerima tiket dan
    // menu engineering tidak punya apa pun untuk dihitung. Skema rute yang lebih
    // sempit daripada layanannya membuang data tanpa satu pun pesan galat.
    const b = z.object({
      total: z.number().positive(),
      tenderType: z.enum(['CASH', 'CARD', 'QRIS', 'EWALLET']),
      gatewayRef: z.string().optional(),
      clientRef: z.string().min(6).optional(),
      orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).optional(),
      tableNo: z.string().optional(),
      cashierRef: z.string().optional(),
      lines: z.array(z.object({
        productCode: z.string(),
        name: z.string(),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative(),
        note: z.string().optional(),
      })).min(1),
    }).parse(req.body);
    return o2c.addPosOrder(req.actor, (req.params as { id: string }).id, b);
  });
  app.post('/pos/sessions/:id/close', async (req) => {
    const b = o2c.PosCloseInput.parse(req.body);
    return o2c.closePosSession(req.actor, (req.params as { id: string }).id, b.countedCash);
  });
  app.post('/pos/gateway/reconcile', async (req) => {
    const b = z.object({
      companyId: z.string(),
      rows: z.array(z.object({
        gateway: z.string(), batchRef: z.string(), gatewayRef: z.string(),
        grossAmount: z.number(), feeAmount: z.number().optional(), netAmount: z.number(),
        settledAt: z.coerce.date(),
      })),
    }).parse(req.body);
    return o2c.reconcileGateway(req.actor, b.companyId, b.rows);
  });

  app.get('/pos/till/bootstrap', async (req) => {
    const q = z.object({ siteCode: z.string() }).parse(req.query);
    return tillBootstrap(req.actor, q.siteCode);
  });

  app.post('/pos/till/sync', async (req) => syncTill(req.actor, SyncRequest.parse(req.body)));

  app.post('/pos/till/pin', async (req) => {
    const b = z.object({ employeeNo: z.string(), pin: z.string().regex(/^\d{6}$/) }).parse(req.body);
    return setCashierPin(req.actor, b.employeeNo, b.pin);
  });

  // ── ESS: karyawan hanya melihat dirinya sendiri ───────────────────────────
  // Tidak satu pun rute di bawah menerima employeeId dari klien.
  app.get('/ess/me', async (req) => myProfile(req.actor));
  app.get('/ess/attendance', async (req) => {
    const q = z.object({ hari: z.coerce.number().min(1).max(120).default(30) }).parse(req.query);
    return myAttendance(req.actor, q.hari);
  });
  app.post('/ess/clock-in', async (req) => clockIn(req.actor, ClockInput.parse(req.body)));
  app.post('/ess/clock-out', async (req) => clockOut(req.actor));
  app.get('/ess/shifts', async (req) => {
    const q = z.object({ hari: z.coerce.number().min(1).max(60).default(14) }).parse(req.query);
    return myShifts(req.actor, q.hari);
  });
  app.get('/ess/leave/balance', async (req) => myLeaveBalance(req.actor));
  app.get('/ess/leave', async (req) => myLeaves(req.actor));
  app.post('/ess/leave', async (req) => requestLeave(req.actor, LeaveInput.parse(req.body)));
  app.get('/ess/payslips', async (req) => myPayslips(req.actor));

  // ── dapur ─────────────────────────────────────────────────────────────────
  app.get('/kitchen/tickets', async (req) => {
    const q = z.object({ siteCode: z.string() }).parse(req.query);
    return listTickets(req.actor, q.siteCode);
  });

  app.post('/kitchen/lines/:id/ready', async (req) => {
    const b = z.object({ ready: z.boolean() }).parse(req.body);
    return setLineReady(req.actor, (req.params as { id: string }).id, b.ready);
  });

  app.post('/kitchen/tickets/bump', async (req) => bumpTicket(req.actor, BumpInput.parse(req.body)));

  app.get('/kitchen/menu', async (req) => menuStatus(req.actor));

  app.post('/kitchen/menu/availability', async (req) =>
    setAvailability(req.actor, AvailabilityInput.parse(req.body)));

  app.get('/kitchen/stats', async (req) => {
    const q = z.object({ siteCode: z.string() }).parse(req.query);
    return kitchenStats(req.actor, q.siteCode);
  });

  // ── manajemen ruang: meja, reservasi, acara, menu engineering ─────────────
  app.get('/manage/tables', async (req) => {
    const q = z.object({ siteCode: z.string() }).parse(req.query);
    return manage.listTables(req.actor, q.siteCode);
  });

  app.post('/manage/tables/:code/status', async (req) =>
    manage.setTableStatus(req.actor, (req.params as { code: string }).code,
      manage.TableStatusInput.parse(req.body)));

  app.get('/manage/reservations', async (req) => {
    const q = z.object({
      siteCode: z.string(),
      dari: z.coerce.date().optional(),
      sampai: z.coerce.date().optional(),
    }).parse(req.query);
    return manage.listReservations(req.actor, q.siteCode, q.dari, q.sampai);
  });

  app.post('/manage/reservations', async (req) =>
    manage.createReservation(req.actor, manage.ReservationInput.parse(req.body)));

  app.post('/manage/reservations/:id/status', async (req) => {
    const b = z.object({ status: z.string() }).parse(req.body);
    return manage.setReservationStatus(req.actor, (req.params as { id: string }).id, b.status);
  });

  app.get('/manage/events', async (req) => {
    const q = z.object({ siteCode: z.string() }).parse(req.query);
    return manage.listEvents(req.actor, q.siteCode);
  });

  app.post('/manage/events', async (req) =>
    manage.createEvent(req.actor, manage.EventInput.parse(req.body)));

  app.post('/manage/events/:id/status', async (req) => {
    const b = z.object({ status: z.string() }).parse(req.body);
    return manage.setEventStatus(req.actor, (req.params as { id: string }).id, b.status);
  });

  // ── keuangan (baca saja; pembukuan tetap lewat jalur R2R berkontrol) ──────
  app.get('/finance/summary', async (req) => {
    const q = TANGGAL.parse(req.query);
    return finance.summary(req.actor, q.dari, q.sampai);
  });
  app.get('/finance/accounts', async (req) => finance.chartOfAccounts(req.actor));
  app.get('/finance/transactions', async (req) => {
    const q = TANGGAL.parse(req.query);
    return finance.transactions(req.actor, q.dari, q.sampai);
  });
  app.get('/finance/ledger', async (req) => {
    const q = TANGGAL.parse(req.query);
    return finance.ledger(req.actor, q.dari, q.sampai);
  });
  app.get('/finance/income-statement', async (req) => {
    const q = TANGGAL.parse(req.query);
    return finance.incomeStatement(req.actor, q.dari, q.sampai);
  });
  app.get('/finance/cash-position', async (req) => {
    const q = TANGGAL.parse(req.query);
    return finance.cashPosition(req.actor, q.dari, q.sampai);
  });
  app.get('/finance/payables', async (req) => finance.payables(req.actor));
  app.get('/finance/cash-deposits', async (req) => {
    const q = z.object({ hari: z.coerce.number().int().positive().max(365).default(30) }).parse(req.query);
    return finance.cashDeposits(req.actor, q.hari);
  });
  app.get('/finance/periods', async (req) => finance.periods(req.actor));
  app.get('/finance/trend', async (req) => {
    const q = z.object({ bulan: z.coerce.number().int().positive().max(24).default(7) }).parse(req.query);
    return finance.monthlyTrend(req.actor, q.bulan);
  });
  app.get('/finance/sales-mix', async (req) => {
    const q = z.object({ hari: z.coerce.number().int().positive().max(365).default(30) }).parse(req.query);
    return finance.salesMix(req.actor, q.hari);
  });

  app.get('/manage/menu-performance', async (req) => {
    const q = z.object({ siteCode: z.string(), hari: z.coerce.number().int().positive().max(365).default(30) })
      .parse(req.query);
    return manage.menuPerformance(req.actor, q.siteCode, q.hari);
  });

  // ── P2P ───────────────────────────────────────────────────────────────────
  app.post('/p2p/requisitions', async (req) => p2p.createRequisition(req.actor, RequisitionInput.parse(req.body)));
  app.post('/p2p/requisitions/:id/submit', async (req) => p2p.submitRequisition(req.actor, (req.params as { id: string }).id, (req.body ?? {}) as { budgetVariancePct?: number }));
  app.post('/p2p/purchase-orders', async (req) => p2p.createPurchaseOrder(req.actor, PurchaseOrderInput.parse(req.body)));
  app.post('/p2p/purchase-orders/:id/submit', async (req) => p2p.submitPurchaseOrder(req.actor, (req.params as { id: string }).id, (req.body ?? {}) as { offContract?: boolean }));
  app.post('/p2p/receipts', async (req) => p2p.createReceipt(req.actor, ReceiptInput.parse(req.body)));
  app.post('/p2p/receipts/:id/putaway', async (req) => p2p.putawayReceipt(req.actor, (req.params as { id: string }).id));
  app.post('/p2p/bills', async (req) => p2p.createBill(req.actor, VendorBillInput.parse(req.body)));
  app.get('/p2p/bills/:id/match', async (req) => p2p.threeWayMatch((req.params as { id: string }).id));
  app.post('/p2p/bills/:id/submit', async (req) => p2p.submitBill(req.actor, (req.params as { id: string }).id));
  app.post('/p2p/payments', async (req) => {
    const b = z.object({ companyId: z.string(), billIds: z.array(z.string()).min(1), currency: z.string().default('IDR') }).parse(req.body);
    return p2p.preparePaymentBatch(req.actor, b.companyId, b.billIds, b.currency);
  });
  app.post('/p2p/payments/:id/submit', async (req) => p2p.submitPaymentBatch(req.actor, (req.params as { id: string }).id));
  app.post('/p2p/payments/:id/approve', async (req) => p2p.approvePaymentBatch(req.actor, (req.params as { id: string }).id));
  app.post('/p2p/payments/:id/release', async (req) => {
    const { bankRef } = z.object({ bankRef: z.string().min(3) }).parse(req.body);
    return p2p.releasePaymentBatch(req.actor, (req.params as { id: string }).id, bankRef);
  });

  // ── R2R ───────────────────────────────────────────────────────────────────
  app.post('/r2r/journals', async (req) => r2r.createJournal(req.actor, JournalInput.parse(req.body)));
  app.post('/r2r/journals/subledger', async (req) => {
    const body = JournalInput.extend({ sourceDocType: z.string(), sourceDocId: z.string() }).parse(req.body);
    return r2r.postSubledgerEvent(req.actor, body);
  });
  app.post('/r2r/journals/:id/submit', async (req) => r2r.submitJournal(req.actor, (req.params as { id: string }).id));
  app.post('/r2r/journals/:id/post', async (req) => r2r.postJournal(req.actor, (req.params as { id: string }).id));
  app.post('/r2r/journals/:id/reverse', async (req) => {
    const { reasonCode } = z.object({ reasonCode: z.string().min(2) }).parse(req.body);
    return r2r.reverseJournal(req.actor, (req.params as { id: string }).id, reasonCode);
  });
  app.post('/r2r/periods/:id/lock', async (req) => r2r.lockPeriod(req.actor, (req.params as { id: string }).id));
  app.post('/r2r/periods/:id/reopen-request', async (req) => {
    const { reason } = z.object({ reason: z.string().min(5) }).parse(req.body);
    return r2r.requestReopen(req.actor, (req.params as { id: string }).id, reason);
  });
  app.post('/r2r/periods/:id/reopen', async (req) => r2r.executeReopen(req.actor, (req.params as { id: string }).id));
  app.post('/r2r/bank/reconcile', async (req) => {
    const b = z.object({
      companyId: z.string(),
      lines: z.array(z.object({ bankRef: z.string(), valueDate: z.coerce.date(), amount: z.number(), description: z.string().optional() })),
    }).parse(req.body);
    return r2r.reconcileBank(req.actor, b.companyId, b.lines);
  });
  app.post('/hr/payroll', async (req) => r2r.runPayroll(req.actor, PayrollInput.parse(req.body)));
  app.post('/hr/payroll/:id/submit', async (req) => r2r.submitPayroll(req.actor, (req.params as { id: string }).id));
  app.post('/hr/payroll/:id/pay', async (req) => r2r.payPayroll(req.actor, (req.params as { id: string }).id));

  // ── KPI ───────────────────────────────────────────────────────────────────
  app.get('/kpi/executive', async (req) => {
    const q = WindowQuery.parse(req.query);
    assertCan(req.actor, 'kpi.read');
    return kpi.executivePack({ companyId: q.companyId, from: q.from, to: q.to });
  });
  app.get('/kpi/:code', async (req) => {
    const q = WindowQuery.parse(req.query);
    assertCan(req.actor, 'kpi.read');
    return kpi.computeKpi((req.params as { code: string }).code.toUpperCase(), { companyId: q.companyId, from: q.from, to: q.to });
  });
  app.post('/kpi/snapshot', async (req) => {
    const b = WindowQuery.extend({ codes: z.array(z.string()).default(kpi.IMPLEMENTED_KPIS) }).parse(req.body);
    return kpi.snapshot(req.actor, { companyId: b.companyId, from: b.from, to: b.to }, b.codes);
  });
  app.post('/kpi/snapshots/:id/certify', async (req) => kpi.certify(req.actor, (req.params as { id: string }).id));

  // ── audit ─────────────────────────────────────────────────────────────────
  app.get('/audit/:docType/:docId', async (req) => {
    assertCan(req.actor, 'audit.read');
    const { docType, docId } = req.params as { docType: string; docId: string };
    return prisma.auditEvent.findMany({ where: { docType, docId }, orderBy: { at: 'asc' } });
  });
}
