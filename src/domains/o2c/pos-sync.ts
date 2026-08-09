import { pbkdf2 as pbkdf2Cb, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { num } from '../../core/seq.js';
import { ControlError } from '../../core/errors.js';
import { currentTenantId } from '../../core/tenant.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';
import { requestApproval } from '../../approval/approval.service.js';

/**
 * Till sync. The register works offline and queues every event locally; this
 * endpoint replays that queue. Each item carries a client-minted `clientRef`,
 * so a retry after a dropped connection can never double-post a sale.
 */

const OrderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);

const LineSchema = z.object({
  productCode: z.string(),
  name: z.string(),
  qty: z.number(),
  unitPrice: z.number().nonnegative(),
  note: z.string().optional(),
});

export const SyncItem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ORDER'),
    clientRef: z.string().min(6),
    at: z.coerce.date(),
    sessionRef: z.string(),
    total: z.number().nonnegative(),
    tenderType: z.enum(['CASH', 'CARD', 'QRIS', 'EWALLET']),
    gatewayRef: z.string().optional(),
    orderType: OrderTypeEnum.default('DINE_IN'),
    tableNo: z.string().optional(),
    cashierRef: z.string().optional(),
    lines: z.array(LineSchema).min(1),
  }),
  z.object({
    type: z.literal('VOID'),
    clientRef: z.string().min(6),
    at: z.coerce.date(),
    sessionRef: z.string(),
    voidOfRef: z.string().min(6),
    total: z.number(), // negative — the reversal amount
    reason: z.string().min(3),
    cashierRef: z.string().optional(),
    lines: z.array(LineSchema).min(1),
  }),
  z.object({
    type: z.literal('SESSION_OPEN'),
    clientRef: z.string().min(6),
    at: z.coerce.date(),
    siteCode: z.string(),
    openingFloat: z.number().nonnegative(),
    cashierRef: z.string().optional(),
  }),
  z.object({
    type: z.literal('SESSION_CLOSE'),
    clientRef: z.string().min(6),
    at: z.coerce.date(),
    sessionRef: z.string(),
    countedCash: z.number().nonnegative(),
  }),
]);
export type SyncItem = z.infer<typeof SyncItem>;

export const SyncRequest = z.object({
  deviceId: z.string().min(3),
  companyId: z.string(),
  items: z.array(SyncItem).max(500),
});

export interface SyncOutcome {
  clientRef: string;
  status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED';
  serverId?: string;
  docNo?: string;
  reason?: string;
}

export async function syncTill(
  actor: Actor, input: z.infer<typeof SyncRequest>,
): Promise<{ results: SyncOutcome[]; accepted: number; duplicates: number; rejected: number }> {
  assertCan(actor, 'pos.order.create');
  const results: SyncOutcome[] = [];

  // Sequential on purpose: SESSION_OPEN must land before the orders it carries.
  for (const item of input.items) {
    try {
      results.push(await applyItem(actor, input, item));
    } catch (e) {
      const err = e as ControlError;
      results.push({ clientRef: item.clientRef, status: 'REJECTED', reason: err.message });
    }
  }

  await audit({
    actor, action: 'pos.sync', docType: 'PosSession', docId: input.deviceId,
    meta: {
      deviceId: input.deviceId, count: input.items.length,
      accepted: results.filter((r) => r.status === 'ACCEPTED').length,
      rejected: results.filter((r) => r.status === 'REJECTED').length,
    },
  });

  return {
    results,
    accepted: results.filter((r) => r.status === 'ACCEPTED').length,
    duplicates: results.filter((r) => r.status === 'DUPLICATE').length,
    rejected: results.filter((r) => r.status === 'REJECTED').length,
  };
}

async function applyItem(
  actor: Actor, req: z.infer<typeof SyncRequest>, item: SyncItem,
): Promise<SyncOutcome> {
  if (item.type === 'SESSION_OPEN') {
    const existing = await prisma.posSession.findFirst({ where: { clientRef: item.clientRef } });
    if (existing) return { clientRef: item.clientRef, status: 'DUPLICATE', serverId: existing.id };

    const site = await prisma.site.findFirst({ where: { code: item.siteCode } });
    if (!site) throw new ControlError('UNKNOWN_SITE', `Site ${item.siteCode} not found`, 404);

    const { openPosSession } = await import('./service.js');
    const session = await openPosSession(actor, site.id, req.companyId, item.openingFloat, item.clientRef);
    return { clientRef: item.clientRef, status: 'ACCEPTED', serverId: session.id };
  }

  if (item.type === 'ORDER' || item.type === 'VOID') {
    const existing = await prisma.posOrder.findFirst({ where: { clientRef: item.clientRef } });
    if (existing) return { clientRef: item.clientRef, status: 'DUPLICATE', serverId: existing.id, docNo: existing.docNo };

    const session = await mustSession(item.sessionRef);
    const { addPosOrder } = await import('./service.js');

    if (item.type === 'VOID') {
      const original = await prisma.posOrder.findFirst({ where: { clientRef: item.voidOfRef } });
      if (!original) throw new ControlError('ORIGINAL_NOT_SYNCED', 'Original sale has not synced yet', 409);
      if (original.voidedAt) return { clientRef: item.clientRef, status: 'DUPLICATE', serverId: original.id };

      const reversal = await addPosOrder(actor, session.id, {
        total: item.total, tenderType: original.tenderType as 'CASH',
        clientRef: item.clientRef, at: item.at, lines: item.lines,
        orderType: original.orderType as 'DINE_IN',
        tableNo: original.tableNo ?? undefined,
        cashierRef: item.cashierRef,
        voidOfRef: item.voidOfRef, voidReason: item.reason,
      });
      await prisma.posOrder.update({
        where: { id: original.id },
        data: { voidedAt: item.at, voidReason: item.reason },
      });

      // A refund is a revenue concession: AR25 routes it by value and hour.
      await requestApproval({
        familyCode: 'AR25', docType: 'PosSession', docId: session.id,
        companyId: session.companyId, amount: Math.abs(item.total), at: item.at,
        payload: { voidOf: original.docNo, reversal: reversal.docNo, reason: item.reason },
        actor,
      });

      return { clientRef: item.clientRef, status: 'ACCEPTED', serverId: reversal.id, docNo: reversal.docNo };
    }

    const order = await addPosOrder(actor, session.id, {
      total: item.total, tenderType: item.tenderType,
      gatewayRef: item.gatewayRef, clientRef: item.clientRef,
      lines: item.lines, at: item.at,
      orderType: item.orderType, tableNo: item.tableNo, cashierRef: item.cashierRef,
    });
    return { clientRef: item.clientRef, status: 'ACCEPTED', serverId: order.id, docNo: order.docNo };
  }

  // SESSION_CLOSE
  const session = await mustSession(item.sessionRef);
  if (session.status !== 'DRAFT') {
    return { clientRef: item.clientRef, status: 'DUPLICATE', serverId: session.id };
  }
  const { closePosSession } = await import('./service.js');
  const closed = await closePosSession(actor, session.id, item.countedCash);
  return { clientRef: item.clientRef, status: 'ACCEPTED', serverId: closed.session.id };
}

async function mustSession(ref: string) {
  const session = await prisma.posSession.findFirst({ where: { clientRef: ref } });
  if (!session) throw new ControlError('SESSION_NOT_SYNCED', `Session ${ref} has not been synced yet`, 409);
  return session;
}

// ─── cashier PIN ──────────────────────────────────────────────────────────────

const pbkdf2 = promisify(pbkdf2Cb);

/**
 * Jumlah iterasi PBKDF2. Dikirim ke till bersama digest supaya perangkat lama
 * tetap bisa memverifikasi PIN lawas ketika angkanya dinaikkan kelak.
 */
export const PIN_ITERATIONS = 210_000;

/**
 * Digest PIN kasir.
 *
 * PIN enam angka hanya punya 10^6 kemungkinan. Dengan SHA-256 sekali jalan,
 * seluruh ruang itu habis ditelusuri dalam 1,8 detik di satu inti — dan till
 * menyimpan daftar digest seluruh kasir di localStorage komputer kasir, tempat
 * yang di sebuah kafe praktis bisa disentuh siapa saja. Garam acak per karyawan
 * memaksa penyerang mengulang pekerjaan untuk setiap orang, dan PBKDF2 210 ribu
 * iterasi menaikkan ongkos satu ruang dari detik menjadi belasan jam.
 *
 * Ini tetap bukan kredensial API: token perangkat yang mengautentikasi ke server.
 */
export async function pinHash(salt: string, pin: string): Promise<string> {
  const buf = await pbkdf2(pin, salt, PIN_ITERATIONS, 32, 'sha256') as Buffer;
  return buf.toString('hex');
}

export const newPinSalt = (): string => randomBytes(16).toString('hex');

export async function setCashierPin(actor: Actor, employeeNo: string, pin: string) {
  assertCan(actor, 'employee.create');
  if (!/^\d{6}$/.test(pin)) throw new ControlError('WEAK_PIN', 'PIN kasir harus tepat 6 angka', 400);
  const employee = await prisma.employee.findFirst({ where: { employeeNo } });
  if (!employee) throw new ControlError('NOT_FOUND', `Employee ${employeeNo} not found`, 404);

  // Garam baru setiap kali PIN diganti: digest lama tidak bisa dipakai ulang.
  const salt = newPinSalt();
  await prisma.employee.update({
    where: { id: employee.id },
    data: { posPinSalt: salt, posPinHash: await pinHash(salt, pin) },
  });
  await audit({ actor, action: 'pos.pin.set', docType: 'Employee', docId: employee.id });
  return { employeeNo, ok: true };
}

/** What the till downloads on start-up: menu, cashiers, and its open session. */
export async function tillBootstrap(actor: Actor, siteCode: string) {
  assertCan(actor, 'pos.order.create');
  const site = await prisma.site.findFirst({ where: { code: siteCode } });
  if (!site) throw new ControlError('UNKNOWN_SITE', `Site ${siteCode} not found`, 404);

  const [products, cashiers, openSession] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'ACTIVE', kind: { in: ['GOODS', 'SERVICE'] } },
      select: {
        code: true, name: true, category: true, listPrice: true, taxCode: true,
        available: true, unavailableReason: true,
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { status: { in: ['ACTIVE', 'PROBATION'] }, posPinHash: { not: null }, siteId: site.id },
      select: { employeeNo: true, fullName: true, position: true, posPinHash: true, posPinSalt: true },
    }),
    prisma.posSession.findFirst({
      where: { siteId: site.id, status: 'DRAFT' },
      select: { id: true, clientRef: true, openingFloat: true, openedAt: true, expectedCash: true },
    }),
  ]);

  return {
    // The till needs the tenant id to reproduce the PIN digest offline.
    tenantId: currentTenantId(),
    site: { id: site.id, code: site.code, name: site.name, companyId: site.companyId },
    // Menu yang dimatikan dapur tetap dikirim, tapi ditandai — kasir perlu bisa
    // menjawab "kenapa tidak ada", bukan sekadar melihatnya hilang.
    catalog: products.map((p) => ({
      code: p.code, name: p.name, category: p.category,
      price: num(p.listPrice), taxCode: p.taxCode,
      available: p.available, unavailableReason: p.unavailableReason,
    })),
    cashiers: cashiers.map((c) => ({
      employeeNo: c.employeeNo, name: c.fullName,
      position: c.position, pinHash: c.posPinHash!,
      pinSalt: c.posPinSalt ?? '', pinIter: PIN_ITERATIONS,
    })),
    openSession: openSession
      ? { ...openSession, openingFloat: num(openSession.openingFloat), expectedCash: num(openSession.expectedCash) }
      : null,
    tenders: ['CASH', 'QRIS', 'CARD', 'EWALLET'],
  };
}

export type Tender = 'CASH' | 'CARD' | 'QRIS' | 'EWALLET';
