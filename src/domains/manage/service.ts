import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { num, round2 } from '../../core/seq.js';
import { ControlError } from '../../core/errors.js';
import { versionHash } from '../../core/hash.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';

/**
 * Manajemen kafe/restoran: meja, reservasi, acara, dan menu engineering.
 *
 * Menu engineering di sini TIDAK memakai angka contoh. Ia dihitung dari
 * PosOrderLine yang benar-benar tercatat kasir, dengan HPP dari Product.stdCost.
 * Itulah bedanya saran yang berguna dan saran yang mengarang.
 */

// ─── meja ─────────────────────────────────────────────────────────────────────

const STATUS_MEJA = ['KOSONG', 'TERISI', 'DIPESAN', 'PERLU_BERSIH', 'DIGABUNG'] as const;

export const TableStatusInput = z.object({
  status: z.enum(STATUS_MEJA),
  guests: z.number().int().positive().optional(),
  waiter: z.string().optional(),
});

export async function listTables(actor: Actor, siteCode: string) {
  assertCan(actor, 'reservation.read');
  const site = await mustSite(siteCode);
  const tables = await prisma.diningTable.findMany({
    where: { siteId: site.id },
    orderBy: [{ area: 'asc' }, { code: 'asc' }],
  });
  const now = Date.now();
  return tables.map((t) => ({
    kode: t.code, area: t.area, kursi: t.seats, status: t.status,
    // Menit sejak tamu duduk dihitung di server: jam perangkat kasir sering meleset.
    dudukSejak: t.seatedAt ? Math.max(0, Math.round((now - t.seatedAt.getTime()) / 60_000)) : undefined,
    tamu: t.guests ?? undefined,
    pramusaji: t.waiter ?? undefined,
  }));
}

export async function setTableStatus(
  actor: Actor, code: string, input: z.infer<typeof TableStatusInput>,
) {
  assertCan(actor, 'reservation.write');
  const table = await prisma.diningTable.findFirst({ where: { code } });
  if (!table) throw new ControlError('NOT_FOUND', `Meja ${code} tidak ditemukan`, 404);

  const updated = await prisma.diningTable.update({
    where: { id: table.id },
    data: {
      status: input.status,
      // Jam duduk hanya dimulai saat meja benar-benar terisi, dan dihapus saat
      // kosong — kalau tidak, perputaran meja terhitung dari sisa shift kemarin.
      seatedAt: input.status === 'TERISI' ? (table.seatedAt ?? new Date()) : null,
      guests: input.status === 'TERISI' ? (input.guests ?? table.guests) : null,
      waiter: input.status === 'TERISI' ? (input.waiter ?? table.waiter) : null,
    },
  });
  await audit({
    actor, action: 'table.status', docType: 'DiningTable', docId: table.id,
    fromStatus: table.status, toStatus: input.status,
  });
  return { kode: updated.code, status: updated.status };
}

// ─── reservasi ────────────────────────────────────────────────────────────────

const STATUS_RESERVASI = ['DIKONFIRMASI', 'MENUNGGU', 'DATANG', 'TIDAK_DATANG', 'BATAL'] as const;

/**
 * Transisi yang sah. Reservasi tidak pernah dihapus — yang berubah statusnya.
 * DATANG, TIDAK_DATANG, dan BATAL bersifat final: mengubahnya berarti mengubah
 * catatan yang sudah dipakai menghitung tingkat no-show.
 */
const TRANSISI: Record<string, readonly string[]> = {
  MENUNGGU: ['DIKONFIRMASI', 'BATAL'],
  DIKONFIRMASI: ['DATANG', 'TIDAK_DATANG', 'BATAL'],
  DATANG: [],
  TIDAK_DATANG: [],
  BATAL: [],
};

export const ReservationInput = z.object({
  siteCode: z.string(),
  guestName: z.string().min(2),
  phone: z.string().min(6),
  bookedFor: z.coerce.date(),
  pax: z.number().int().positive().max(500),
  tableCode: z.string().optional(),
  source: z.enum(['TELEPON', 'WALK_IN', 'WHATSAPP', 'ONLINE']).default('TELEPON'),
  note: z.string().max(500).optional(),
});

export async function createReservation(actor: Actor, input: z.infer<typeof ReservationInput>) {
  assertCan(actor, 'reservation.write');
  const site = await mustSite(input.siteCode);

  const table = input.tableCode
    ? await prisma.diningTable.findFirst({ where: { code: input.tableCode } })
    : null;
  if (input.tableCode && !table) {
    throw new ControlError('NOT_FOUND', `Meja ${input.tableCode} tidak ditemukan`, 404);
  }
  if (table && table.seats < input.pax) {
    throw new ControlError('TABLE_TOO_SMALL', `Meja ${table.code} hanya ${table.seats} kursi`, 409,
      { seats: table.seats, pax: input.pax });
  }

  // Tamu berulang dikenali dari nomor telepon; dipakai untuk prioritas dan sapaan.
  const kunjunganSebelumnya = await prisma.reservation.count({
    where: { phone: input.phone, status: 'DATANG' },
  });

  const vh = versionHash({ phone: input.phone, bookedFor: input.bookedFor, pax: input.pax });
  const created = await prisma.reservation.create({
    data: {
      siteId: site.id, guestName: input.guestName, phone: input.phone,
      bookedFor: input.bookedFor, pax: input.pax, tableId: table?.id ?? null,
      source: input.source, note: input.note ?? null,
      visitCount: kunjunganSebelumnya + 1, versionHash: vh,
    },
  });
  await audit({
    actor, action: 'reservation.create', docType: 'Reservation', docId: created.id,
    toStatus: 'MENUNGGU', versionHash: vh, meta: { pax: input.pax, table: table?.code ?? null },
  });
  return bentukReservasi(created, table?.code);
}

export async function setReservationStatus(actor: Actor, id: string, status: string) {
  assertCan(actor, 'reservation.write');
  if (!(STATUS_RESERVASI as readonly string[]).includes(status)) {
    throw new ControlError('INVALID_STATUS', `Status ${status} tidak dikenal`, 400);
  }
  const r = await prisma.reservation.findFirst({ where: { id }, include: { table: true } });
  if (!r) throw new ControlError('NOT_FOUND', 'Reservasi tidak ditemukan', 404);

  const sah = TRANSISI[r.status] ?? [];
  if (!sah.includes(status)) {
    throw new ControlError('INVALID_TRANSITION', `Reservasi ${r.status} tidak bisa menjadi ${status}`, 409,
      { from: r.status, to: status, allowed: sah });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.reservation.update({
      where: { id: r.id },
      data: { status, cancelledAt: status === 'BATAL' ? new Date() : null },
    });
    // Tamu datang menempati mejanya; batal atau tidak datang melepaskannya.
    if (r.tableId && status === 'DATANG') {
      await tx.diningTable.update({
        where: { id: r.tableId },
        data: { status: 'TERISI', seatedAt: new Date(), guests: r.pax },
      });
    }
    if (r.tableId && (status === 'BATAL' || status === 'TIDAK_DATANG')) {
      await tx.diningTable.updateMany({
        where: { id: r.tableId, status: 'DIPESAN' },
        data: { status: 'KOSONG' },
      });
    }
    return row;
  });

  await audit({
    actor, action: 'reservation.status', docType: 'Reservation', docId: r.id,
    fromStatus: r.status, toStatus: status, versionHash: r.versionHash,
  });
  return bentukReservasi(updated, r.table?.code);
}

export async function listReservations(actor: Actor, siteCode: string, dari?: Date, sampai?: Date) {
  assertCan(actor, 'reservation.read');
  const site = await mustSite(siteCode);
  const rows = await prisma.reservation.findMany({
    where: {
      siteId: site.id,
      ...(dari || sampai ? { bookedFor: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
    },
    include: { table: true },
    orderBy: { bookedFor: 'asc' },
  });
  return rows.map((r) => bentukReservasi(r, r.table?.code));
}

// ─── acara ────────────────────────────────────────────────────────────────────

export const EventInput = z.object({
  siteCode: z.string(),
  name: z.string().min(2),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  area: z.string(),
  pax: z.number().int().positive().max(2000),
  kind: z.enum(['PRIVATE_DINING', 'MUSIK', 'GATHERING', 'ULANG_TAHUN', 'MEETING']),
  value: z.number().nonnegative().default(0),
  owner: z.string(),
  note: z.string().max(500).optional(),
});

export async function createEvent(actor: Actor, input: z.infer<typeof EventInput>) {
  assertCan(actor, 'event.write');
  if (input.endsAt <= input.startsAt) {
    throw new ControlError('INVALID_RANGE', 'Jam selesai harus setelah jam mulai', 400);
  }
  const site = await mustSite(input.siteCode);

  // Satu area tidak bisa dipakai dua acara pada jam yang bertumpang tindih.
  const bentrok = await prisma.venueEvent.findFirst({
    where: {
      siteId: site.id, area: input.area,
      status: { in: ['TENTATIF', 'PASTI'] },
      startsAt: { lt: input.endsAt },
      endsAt: { gt: input.startsAt },
    },
    select: { id: true, name: true, startsAt: true },
  });
  if (bentrok) {
    throw new ControlError('AREA_CLASH', `Area ${input.area} sudah dipakai "${bentrok.name}"`, 409,
      { conflictId: bentrok.id, startsAt: bentrok.startsAt });
  }

  const vh = versionHash({ name: input.name, startsAt: input.startsAt, area: input.area });
  const created = await prisma.venueEvent.create({
    data: {
      siteId: site.id, name: input.name, startsAt: input.startsAt, endsAt: input.endsAt,
      area: input.area, pax: input.pax, kind: input.kind, value: input.value,
      owner: input.owner, note: input.note ?? null, versionHash: vh,
    },
  });
  await audit({
    actor, action: 'event.create', docType: 'VenueEvent', docId: created.id,
    toStatus: 'TENTATIF', versionHash: vh, meta: { area: input.area, pax: input.pax },
  });
  return bentukAcara(created);
}

/**
 * TENTATIF → PASTI mengunci area pada jam itu; SELESAI dan BATAL bersifat final.
 * Acara yang sudah lewat tidak bisa dinaikkan menjadi PASTI — itu akan
 * memesan ruang di masa lalu dan merusak hitungan okupansi.
 */
const TRANSISI_ACARA: Record<string, readonly string[]> = {
  TENTATIF: ['PASTI', 'BATAL'],
  PASTI: ['SELESAI', 'BATAL'],
  SELESAI: [],
  BATAL: [],
};

export async function setEventStatus(actor: Actor, id: string, status: string) {
  assertCan(actor, 'event.write');
  const e = await prisma.venueEvent.findFirst({ where: { id } });
  if (!e) throw new ControlError('NOT_FOUND', 'Acara tidak ditemukan', 404);

  const sah = TRANSISI_ACARA[e.status] ?? [];
  if (!sah.includes(status)) {
    throw new ControlError('INVALID_TRANSITION', `Acara ${e.status} tidak bisa menjadi ${status}`, 409,
      { from: e.status, to: status, allowed: sah });
  }
  if (status === 'PASTI' && e.startsAt < new Date()) {
    throw new ControlError('EVENT_PAST', 'Acara yang sudah lewat tidak bisa dipastikan', 409,
      { startsAt: e.startsAt });
  }

  const updated = await prisma.venueEvent.update({ where: { id: e.id }, data: { status } });
  await audit({
    actor, action: 'event.status', docType: 'VenueEvent', docId: e.id,
    fromStatus: e.status, toStatus: status, versionHash: e.versionHash,
  });
  return bentukAcara(updated);
}

export async function listEvents(actor: Actor, siteCode: string) {
  assertCan(actor, 'event.read');
  const site = await mustSite(siteCode);
  const rows = await prisma.venueEvent.findMany({
    where: { siteId: site.id },
    orderBy: { startsAt: 'asc' },
  });
  return rows.map(bentukAcara);
}

// ─── menu engineering ─────────────────────────────────────────────────────────

/**
 * Kinerja menu dari penjualan sungguhan.
 *
 * Baris yang dibatalkan (void) dikeluarkan: order pembalik bernilai negatif,
 * dan kalau ikut terhitung, menu yang sering salah input justru terlihat laris.
 */
export async function menuPerformance(actor: Actor, siteCode: string, hari = 30) {
  assertCan(actor, 'kpi.read');
  const site = await mustSite(siteCode);
  const sejak = new Date(Date.now() - hari * 86_400_000);

  const lines = await prisma.posOrderLine.findMany({
    where: {
      order: {
        session: { siteId: site.id },
        createdAt: { gte: sejak },
        voidedAt: null,
        voidOfRef: null,
      },
    },
    select: { productCode: true, name: true, qty: true, unitPrice: true },
  });

  const products = await prisma.product.findMany({
    select: { code: true, name: true, category: true, stdCost: true, listPrice: true },
  });
  const byCode = new Map(products.map((p) => [p.code, p]));

  const agg = new Map<string, { nama: string; kategori: string; terjual: number; omzet: number }>();
  for (const l of lines) {
    const p = byCode.get(l.productCode);
    const key = l.productCode;
    const cur = agg.get(key) ?? {
      nama: p?.name ?? l.name, kategori: p?.category ?? 'Lain-lain', terjual: 0, omzet: 0,
    };
    cur.terjual += num(l.qty);
    cur.omzet += num(l.qty) * num(l.unitPrice);
    agg.set(key, cur);
  }

  return [...agg.entries()].map(([kode, v]) => {
    const p = byCode.get(kode);
    // Harga rata-rata tertimbang, bukan harga daftar: diskon dan harga promo
    // ikut menentukan margin yang benar-benar diterima.
    const harga = v.terjual > 0 ? round2(v.omzet / v.terjual) : num(p?.listPrice ?? 0);
    return {
      kode, nama: v.nama, kategori: v.kategori,
      terjual: v.terjual, harga, hpp: round2(num(p?.stdCost ?? 0)),
    };
  }).sort((a, b) => b.terjual - a.terjual);
}

// ─── bantu ────────────────────────────────────────────────────────────────────

async function mustSite(code: string) {
  const site = await prisma.site.findFirst({ where: { code } });
  if (!site) throw new ControlError('UNKNOWN_SITE', `Site ${code} tidak ditemukan`, 404);
  return site;
}

type ReservationRow = {
  id: string; guestName: string; phone: string; bookedFor: Date; pax: number;
  status: string; source: string; note: string | null; visitCount: number;
};

const bentukReservasi = (r: ReservationRow, mejaKode?: string) => ({
  id: r.id, nama: r.guestName, telepon: r.phone,
  tanggal: r.bookedFor.toISOString().slice(0, 10),
  waktu: r.bookedFor.toISOString().slice(11, 16),
  pax: r.pax, meja: mejaKode, status: r.status, sumber: r.source,
  catatan: r.note ?? undefined, kunjunganKe: r.visitCount,
});

type EventRow = {
  id: string; name: string; startsAt: Date; endsAt: Date; area: string; pax: number;
  kind: string; value: unknown; status: string; owner: string; note: string | null;
};

const bentukAcara = (e: EventRow) => ({
  id: e.id, nama: e.name,
  tanggal: e.startsAt.toISOString().slice(0, 10),
  mulai: e.startsAt.toISOString().slice(11, 16),
  selesai: e.endsAt.toISOString().slice(11, 16),
  area: e.area, pax: e.pax, jenis: e.kind, nilai: num(e.value as never),
  status: e.status, penanggungJawab: e.owner, catatan: e.note ?? undefined,
});
