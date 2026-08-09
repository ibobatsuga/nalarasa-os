import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { num } from '../../core/seq.js';
import { ControlError } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';

/**
 * Jembatan dapur ↔ kasir.
 *
 * Satu aturan yang membentuk seluruh modul ini: **dapur adalah pemilik sah
 * ketersediaan menu**. Kasir hanya membaca. Kalau arahnya dibalik — kasir boleh
 * mematikan menu — dua sumber kebenaran akan bertabrakan tepat pada jam sibuk,
 * dan yang menanggung adalah tamu yang memesan sesuatu yang tidak ada.
 */

export const PrepStatus = z.enum(['BARU', 'DIMASAK', 'SIAP', 'DIANTAR']);
export type PrepStatus = z.infer<typeof PrepStatus>;

export const Station = z.enum(['PANAS', 'DINGIN', 'BAR', 'DESSERT']);

// ─── daftar 86 ────────────────────────────────────────────────────────────────

export const AvailabilityInput = z.object({
  productCode: z.string(),
  available: z.boolean(),
  /** Wajib saat mematikan: kasir perlu tahu apa yang dikatakan ke tamu. */
  reason: z.string().max(120).optional(),
});

export async function setAvailability(actor: Actor, input: z.infer<typeof AvailabilityInput>) {
  assertCan(actor, 'menu.availability');
  if (!input.available && !input.reason?.trim()) {
    throw new ControlError('REASON_REQUIRED', 'Alasan wajib diisi saat mematikan menu', 400);
  }

  const product = await prisma.product.findFirst({ where: { code: input.productCode } });
  if (!product) throw new ControlError('NOT_FOUND', `Produk ${input.productCode} tidak ditemukan`, 404);
  if (product.available === input.available) {
    return { productCode: product.code, available: product.available, unchanged: true };
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: {
      available: input.available,
      unavailableReason: input.available ? null : input.reason!.trim(),
      unavailableAt: input.available ? null : new Date(),
      unavailableBy: input.available ? null : actor.userId,
    },
  });

  // Dicatat sebagai kejadian, bukan sekadar perubahan kolom: pemilik perlu bisa
  // menghitung berapa sering menu mati dan siapa yang mematikannya.
  await audit({
    actor, action: input.available ? 'menu.available' : 'menu.86',
    docType: 'Product', docId: product.id,
    fromStatus: product.available ? 'ADA' : '86',
    toStatus: input.available ? 'ADA' : '86',
    reasonCode: input.available ? 'RESTOCKED' : 'OUT_OF_STOCK',
    meta: { code: product.code, name: product.name, reason: input.reason ?? null },
  });

  return {
    productCode: updated.code,
    available: updated.available,
    reason: updated.unavailableReason,
    at: updated.unavailableAt,
  };
}

/** Dibaca dapur untuk layar Menu & 86. */
export async function menuStatus(actor: Actor) {
  assertCan(actor, 'product.read');
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', kind: { in: ['GOODS', 'SERVICE'] } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
    select: {
      code: true, name: true, category: true, listPrice: true,
      available: true, unavailableReason: true, unavailableAt: true,
      station: true, prepMinutes: true,
    },
  });
  return products.map((p) => ({
    kode: p.code, nama: p.name, kategori: p.category, harga: num(p.listPrice),
    tersedia: p.available, alasan: p.unavailableReason,
    sejak: p.unavailableAt, stasiun: p.station ?? 'PANAS',
    waktuMasakMenit: p.prepMinutes,
  }));
}

// ─── antrean tiket ────────────────────────────────────────────────────────────

/**
 * Tiket dapur diturunkan dari pesanan POS, bukan disimpan terpisah. Karena itu
 * dapur tidak pernah bisa melihat pesanan yang tidak ada di kasir, dan
 * sebaliknya — tidak ada antrean bayangan.
 */
export async function listTickets(actor: Actor, siteCode: string) {
  assertCan(actor, 'so.read');
  const site = await prisma.site.findFirst({ where: { code: siteCode } });
  if (!site) throw new ControlError('UNKNOWN_SITE', `Outlet ${siteCode} tidak ditemukan`, 404);

  const orders = await prisma.posOrder.findMany({
    where: {
      session: { siteId: site.id },
      prepStatus: { in: ['BARU', 'DIMASAK', 'SIAP'] },
      voidedAt: null,
      total: { gt: 0 },
    },
    include: { lines: true },
    orderBy: { createdAt: 'asc' },
    take: 60,
  });

  return orders.map((o) => ({
    id: o.id,
    nomor: o.docNo,
    jenis: o.orderType,
    meja: o.tableNo,
    masukPada: o.createdAt.toISOString(),
    status: o.prepStatus as PrepStatus,
    pramusaji: o.cashierRef,
    targetMenit: targetMenit(o.orderType),
    items: o.lines.map((l) => ({
      id: l.id,
      nama: l.name,
      qty: num(l.qty),
      stasiun: l.station ?? 'PANAS',
      catatan: l.note ?? undefined,
      siap: l.readyAt !== null,
    })),
  }));
}

/** Janji waktu berbeda per kanal; antar lebih longgar karena ada perjalanan. */
const targetMenit = (jenis: string) => (jenis === 'DELIVERY' ? 18 : jenis === 'TAKEAWAY' ? 12 : 15);

export async function setLineReady(actor: Actor, lineId: string, ready: boolean) {
  assertCan(actor, 'so.read');
  const line = await prisma.posOrderLine.findFirst({ where: { id: lineId } });
  if (!line) throw new ControlError('NOT_FOUND', 'Baris pesanan tidak ditemukan', 404);

  await prisma.posOrderLine.update({
    where: { id: line.id },
    data: { readyAt: ready ? new Date() : null },
  });

  // Satu tiket dianggap siap hanya kalau seluruh barisnya siap.
  const sisa = await prisma.posOrderLine.count({
    where: { orderId: line.orderId, readyAt: null },
  });
  const order = await prisma.posOrder.update({
    where: { id: line.orderId },
    data: {
      prepStatus: sisa === 0 ? 'SIAP' : 'DIMASAK',
      readyAt: sisa === 0 ? new Date() : null,
    },
  });

  return { lineId, ready, ticketStatus: order.prepStatus, sisaBaris: sisa };
}

export const BumpInput = z.object({ orderId: z.string(), to: PrepStatus });

export async function bumpTicket(actor: Actor, input: z.infer<typeof BumpInput>) {
  assertCan(actor, 'so.read');
  const order = await prisma.posOrder.findFirst({ where: { id: input.orderId } });
  if (!order) throw new ControlError('NOT_FOUND', 'Tiket tidak ditemukan', 404);

  const now = new Date();
  const updated = await prisma.posOrder.update({
    where: { id: order.id },
    data: {
      prepStatus: input.to,
      readyAt: input.to === 'SIAP' ? (order.readyAt ?? now) : order.readyAt,
      servedAt: input.to === 'DIANTAR' ? now : order.servedAt,
      ...(input.to === 'SIAP' ? {} : {}),
    },
  });

  if (input.to === 'SIAP') {
    await prisma.posOrderLine.updateMany({
      where: { orderId: order.id, readyAt: null }, data: { readyAt: now },
    });
  }

  await audit({
    actor, action: `kitchen.${input.to.toLowerCase()}`, docType: 'PosOrder', docId: order.id,
    fromStatus: order.prepStatus, toStatus: input.to,
    meta: {
      docNo: order.docNo,
      menitSiap: order.readyAt ? Math.round((order.readyAt.getTime() - order.createdAt.getTime()) / 60_000) : null,
    },
  });

  return { orderId: updated.id, status: updated.prepStatus };
}

/** Ringkasan untuk kartu KPI dapur dan dashboard pemilik. */
export async function kitchenStats(actor: Actor, siteCode: string) {
  const tiket = await listTickets(actor, siteCode);
  const menu = await menuStatus(actor);
  const now = Date.now();
  const lewat = tiket.filter((t) =>
    (now - new Date(t.masukPada).getTime()) / 60_000 >= t.targetMenit).length;
  return {
    antrean: tiket.length,
    lewatWaktu: lewat,
    menuMati: menu.filter((m) => !m.tersedia).length,
    menuTotal: menu.length,
  };
}
