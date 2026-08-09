import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';
import { ControlError } from './errors.js';

export interface TenantContext {
  tenantId: string;
  slug: string;
  /** System mode bypasses row scoping: login, provisioning, platform admin only. */
  system?: boolean;
}

const store = new AsyncLocalStorage<TenantContext>();

export const currentTenant = (): TenantContext | undefined => store.getStore();

export function currentTenantId(): string {
  const ctx = store.getStore();
  if (!ctx || ctx.system) {
    throw new ControlError('NO_TENANT_CONTEXT', 'Operation requires a tenant context', 500);
  }
  return ctx.tenantId;
}

/**
 * PrismaPromise itu lazy: query baru berjalan saat `.then()` dipanggil, bukan
 * saat dibuat. `store.run(ctx, () => prisma.x.count())` karenanya membangun
 * promise di dalam konteks tapi mengeksekusinya di luar — tenant hilang, dan
 * kalau ada konteks luar, query justru terbaca sebagai milik tenant lain.
 * Await di dalam `store.run` menahan konteks sampai query benar-benar selesai.
 */
export const withTenant = <T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> =>
  store.run(ctx, async () => await fn());

/**
 * Mengikat konteks ke SISA siklus permintaan.
 *
 * `store.enterWith` di dalam hook async tidak cukup: begitu promise hook itu
 * selesai, Fastify melanjutkan di sumber async yang berbeda dan ikatannya
 * hilang — handler lalu menabrak NO_TENANT_CONTEXT. Memanggil `next` DI DALAM
 * `store.run` membuat seluruh rantai hook dan handler berjalan di dalam konteks.
 */
export const bindTenant = (ctx: TenantContext, next: () => void): void => store.run(ctx, next);

/**
 * Escape hatch for the few paths that legitimately cross tenants:
 * session-token lookup, provisioning, and the platform admin console.
 * Everything else must run inside `withTenant`.
 */
export const runAsSystem = <T>(fn: () => Promise<T>): Promise<T> =>
  store.run({ tenantId: '', slug: '', system: true }, async () => await fn());

/** Models carrying a tenantId column. Role and Credential are deliberately global. */
export const TENANT_SCOPED = new Set([
  'DocSequence', 'Company', 'Site', 'User', 'Session', 'UserRole',
  'Party', 'BankAccount', 'Uom', 'Product', 'Account',
  'ApprovalRequest', 'ApprovalDecision', 'AuditEvent', 'SodConflict',
  'SalesOrder', 'SalesOrderLine', 'Invoice', 'PosSession', 'PosOrder',
  'PosOrderLine', 'GatewaySettlement', 'Subscription',
  'Requisition', 'RequisitionLine', 'PurchaseOrder', 'PurchaseOrderLine',
  'GoodsReceipt', 'GoodsReceiptLine', 'VendorBill', 'VendorBillLine',
  'PaymentBatch', 'PaymentItem',
  'Period', 'JournalEntry', 'JournalLine', 'BankStatementLine',
  'PayrollRun', 'Payslip', 'KpiPlan', 'KpiSnapshot',
  'Employee', 'EmploymentContract', 'ShiftAssignment', 'Attendance',
  'LeaveType', 'LeaveRequest',
  'DiningTable', 'Reservation', 'VenueEvent',
]);

const READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany', 'update', 'delete',
]);

type AnyRecord = Record<string, unknown>;

/** Stamps tenantId on a create payload, including nested creates. */
function stampCreate(data: unknown, tenantId: string): void {
  if (Array.isArray(data)) { data.forEach((d) => stampCreate(d, tenantId)); return; }
  if (!data || typeof data !== 'object') return;
  const row = data as AnyRecord;
  row.tenantId = tenantId;
  for (const value of Object.values(row)) {
    if (!value || typeof value !== 'object') continue;
    const nested = value as AnyRecord;
    if (nested.create) stampCreate(nested.create, tenantId);
    if (nested.connectOrCreate) stampCreate((nested.connectOrCreate as AnyRecord).create, tenantId);
    if (nested.createMany) stampCreate((nested.createMany as AnyRecord).data, tenantId);
  }
}

/**
 * Row-level isolation enforced once, at the client. A forgotten `where` clause
 * cannot leak another tenant's data because no service ever writes the filter.
 * `$use` is deprecated in Prisma 5 but is the only hook that preserves the
 * generated client types exactly; revisit when moving to client extensions.
 */
export function installTenantGuard(client: PrismaClient): void {
  client.$use(async (params, next) => {
    const model = params.model;
    if (!model || !TENANT_SCOPED.has(model)) return next(params);

    const ctx = store.getStore();
    if (!ctx) {
      throw new ControlError('NO_TENANT_CONTEXT', `${model}.${params.action} ran outside a tenant context`, 500);
    }
    if (ctx.system) return next(params);

    const tenantId = ctx.tenantId;
    const args = (params.args ?? {}) as AnyRecord;

    if (READ_OPS.has(params.action)) {
      args.where = { ...(args.where as AnyRecord | undefined), tenantId };
    }

    if (params.action === 'create' || params.action === 'createMany') {
      stampCreate(args.data, tenantId);
    }

    if (params.action === 'upsert') {
      args.where = { ...(args.where as AnyRecord | undefined), tenantId };
      stampCreate(args.create, tenantId);
    }

    params.args = args;
    return next(params);
  });
}
