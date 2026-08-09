/**
 * Server tiruan untuk pengembangan — BUKAN untuk produksi.
 *
 * Postgres belum tersedia di mesin pengembangan, sementara rantai
 * kasir → dapur → kasir perlu bisa dibuktikan jalan. Berkas ini menjawab
 * kontrak HTTP yang sama persis dengan server asli (`src/http/routes.ts`),
 * tetapi menyimpan datanya di memori.
 *
 * Aturannya satu: kalau kontraknya berubah di server asli, berkas ini ikut
 * berubah. Kalau tidak, ia berhenti berguna dan mulai menyesatkan.
 *
 *   node tools/dev-stub.mjs
 */
import { createServer } from 'node:http';
import { createHash, pbkdf2Sync, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 3000);

const menit = (m) => new Date(Date.now() - m * 60_000).toISOString();

const db = {
  tenantId: 'tnt_dev',
  site: { id: 'site_1', code: 'RESTO-01', name: 'Main Restaurant' },
  produk: [
    { code: 'MENU-NASI', name: 'Nasi Goreng Spesial', category: 'Makanan', price: 45_000, station: 'PANAS', prepMinutes: 8, available: true, unavailableReason: null },
    { code: 'MENU-AYAM', name: 'Ayam Bakar Madu', category: 'Makanan', price: 65_000, station: 'PANAS', prepMinutes: 14, available: true, unavailableReason: null },
    { code: 'MENU-GURAME', name: 'Gurame Bakar', category: 'Makanan', price: 95_000, station: 'PANAS', prepMinutes: 20, available: false, unavailableReason: 'Ikan segar belum datang' },
    { code: 'MENU-SOTO', name: 'Soto Ayam Kampung', category: 'Makanan', price: 38_000, station: 'PANAS', prepMinutes: 6, available: true, unavailableReason: null },
    { code: 'MENU-SATE', name: 'Sate Ayam (10 tusuk)', category: 'Makanan', price: 45_000, station: 'PANAS', prepMinutes: 12, available: true, unavailableReason: null },
    { code: 'MENU-CAPCAY', name: 'Capcay Seafood', category: 'Makanan', price: 52_000, station: 'PANAS', prepMinutes: 10, available: true, unavailableReason: null },
    { code: 'MENU-MIEGOR', name: 'Mie Goreng Jawa', category: 'Makanan', price: 36_000, station: 'PANAS', prepMinutes: 8, available: true, unavailableReason: null },
    { code: 'MENU-ESTEH', name: 'Es Teh Manis', category: 'Minuman', price: 8_000, station: 'BAR', prepMinutes: 2, available: true, unavailableReason: null },
    { code: 'MENU-ESJERUK', name: 'Es Jeruk Peras', category: 'Minuman', price: 15_000, station: 'BAR', prepMinutes: 3, available: true, unavailableReason: null },
    { code: 'MENU-LATTE', name: 'Es Kopi Susu', category: 'Minuman', price: 25_000, station: 'BAR', prepMinutes: 4, available: true, unavailableReason: null },
    { code: 'MENU-JUS-ALP', name: 'Jus Alpukat', category: 'Minuman', price: 28_000, station: 'BAR', prepMinutes: 5, available: false, unavailableReason: 'Alpukat belum matang' },
    { code: 'MENU-PISANG', name: 'Pisang Goreng Keju', category: 'Dessert', price: 28_000, station: 'DESSERT', prepMinutes: 7, available: true, unavailableReason: null },
    { code: 'MENU-KERUPUK', name: 'Kerupuk Udang', category: 'Tambahan', price: 8_000, station: 'DINGIN', prepMinutes: 1, available: true, unavailableReason: null },
  ],
  // PIN kasir enam angka. Yang dikirim ke perangkat hanya digest-nya,
  // sama seperti server asli — angkanya tidak pernah meninggalkan sini.
  kasir: [
    // Garam tetap di stub supaya PIN demo tidak berubah tiap kali proses restart.
    { employeeNo: 'EMP-0012', name: 'Tono Prasetyo', position: 'Kasir', pin: '246810', pinSalt: 'garam-demo-tono' },
    { employeeNo: 'EMP-0034', name: 'Rina Kusuma', position: 'Kasir', pin: '135791', pinSalt: 'garam-demo-rina' },
    { employeeNo: 'EMP-0009', name: 'Dewi Anggraini', position: 'Supervisor Outlet', pin: '778899', pinSalt: 'garam-demo-dewi' },
  ],
  sesi: [],
  order: [
    {
      id: 'o1', docNo: 'POS-0087', orderType: 'DINE_IN', tableNo: 'A5',
      createdAt: menit(14), prepStatus: 'DIMASAK', cashierRef: 'Sari', voidedAt: null, total: 260_000,
      lines: [
        { id: 'l1', name: 'Nasi Goreng Spesial', qty: 2, station: 'PANAS', note: 'satu tidak pedas', readyAt: menit(4) },
        { id: 'l2', name: 'Ayam Bakar Madu', qty: 1, station: 'PANAS', note: null, readyAt: null },
        { id: 'l3', name: 'Es Teh Manis', qty: 3, station: 'BAR', note: null, readyAt: menit(9) },
      ],
    },
    {
      id: 'o2', docNo: 'POS-0088', orderType: 'DINE_IN', tableNo: 'B2',
      createdAt: menit(6), prepStatus: 'BARU', cashierRef: 'Andi', voidedAt: null, total: 122_000,
      lines: [
        { id: 'l4', name: 'Soto Ayam Kampung', qty: 2, station: 'PANAS', note: null, readyAt: null },
        { id: 'l5', name: 'Es Jeruk Peras', qty: 2, station: 'BAR', note: null, readyAt: null },
        { id: 'l6', name: 'Kerupuk Udang', qty: 1, station: 'DINGIN', note: null, readyAt: null },
      ],
    },
    {
      id: 'o3', docNo: 'POS-0089', orderType: 'TAKEAWAY', tableNo: null,
      createdAt: menit(22), prepStatus: 'DIMASAK', cashierRef: null, voidedAt: null, total: 164_000,
      lines: [
        { id: 'l7', name: 'Mie Goreng Jawa', qty: 3, station: 'PANAS', note: 'tanpa sawi', readyAt: null },
        { id: 'l8', name: 'Pisang Goreng Keju', qty: 2, station: 'DESSERT', note: null, readyAt: null },
      ],
    },
  ],
  audit: [],
  // ESS: satu karyawan contoh, cukup untuk membuktikan alur absen dan cuti.
  karyawan: {
    employeeNo: 'EMP-0012', nama: 'Tono Prasetyo', posisi: 'Kasir', departemen: 'Outlet',
    outlet: { kode: 'RESTO-01', nama: 'Main Restaurant' },
    bergabung: '2025-01-12', status: 'ACTIVE',
    kontrak: { jenis: 'PKWTT', mulai: '2025-01-12', berakhir: null, gajiPokok: 3_800_000, sisaHari: null },
  },
  geofence: { lat: -7.7956, lng: 110.3695, radiusM: 150 },
  absen: [],
  shift: [
    { id: 's1', tanggal: hariISO(0), mulai: jamISO(0, 7), selesai: jamISO(0, 15), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
    { id: 's2', tanggal: hariISO(1), mulai: jamISO(1, 7), selesai: jamISO(1, 15), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
    { id: 's3', tanggal: hariISO(2), mulai: jamISO(2, 14), selesai: jamISO(2, 22), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
    { id: 's4', tanggal: hariISO(4), mulai: jamISO(4, 7), selesai: jamISO(4, 15), outlet: 'RESTO-02', peran: 'Kasir', terbit: false },
  ],
  jenisCuti: [
    { kode: 'TAHUNAN', nama: 'Cuti Tahunan', kuota: 12, dibayar: true },
    { kode: 'SAKIT', nama: 'Sakit', kuota: 14, dibayar: true },
    { kode: 'IZIN', nama: 'Izin', kuota: 6, dibayar: false },
  ],
  cuti: [
    { id: 'c1', kode: 'SAKIT', jenis: 'Sakit', mulai: hariISO(-20), selesai: hariISO(-20), hari: 1, alasan: 'Demam', status: 'APPROVED', diputusPada: hariISO(-20) },
    { id: 'c2', kode: 'TAHUNAN', jenis: 'Cuti Tahunan', mulai: hariISO(-45), selesai: hariISO(-43), hari: 3, alasan: 'Mudik', status: 'APPROVED', diputusPada: hariISO(-50) },
  ],
  slip: [
    { id: 'p1', nomorRun: 'PRL-202607-000007', dibayarPada: '2026-07-30', bruto: 4_700_000, neto: 4_512_000, potongan: 188_000, dikoreksi: false },
    { id: 'p2', nomorRun: 'PRL-202606-000006', dibayarPada: '2026-06-30', bruto: 4_560_000, neto: 4_378_000, potongan: 182_000, dikoreksi: false },
  ],
};

function hariISO(geser) {
  const d = new Date(); d.setDate(d.getDate() + geser);
  return d.toISOString().slice(0, 10);
}
function jamISO(geser, h, m = 0) {
  const d = new Date(); d.setDate(d.getDate() + geser); d.setHours(h, m, 0, 0);
  return d.toISOString();
}
/** Digest PIN — rumus yang sama dengan src/domains/o2c/pos-sync.ts. */
/** Sama persis dengan src/domains/o2c/pos-sync.ts — kalau menyimpang, PIN selalu salah. */
const PIN_ITERATIONS = 210_000;
const pinDigest = (salt, pin) =>
  pbkdf2Sync(pin, salt, PIN_ITERATIONS, 32, 'sha256').toString('hex');

/** Haversine, meter — sama persis dengan src/domains/hr/ess.service.ts. */
function jarakMeter(aLat, aLng, bLat, bLng) {
  const R = 6_371_000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
const absenTerbuka = () =>
  db.absen.find((a) => !a.keluar && new Date(a.masuk).toDateString() === new Date().toDateString());

const targetMenit = (jenis) => (jenis === 'DELIVERY' ? 18 : jenis === 'TAKEAWAY' ? 12 : 15);

const tiket = () => db.order
  .filter((o) => ['BARU', 'DIMASAK', 'SIAP'].includes(o.prepStatus) && !o.voidedAt)
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  .map((o) => ({
    id: o.id, nomor: o.docNo, jenis: o.orderType, meja: o.tableNo,
    masukPada: o.createdAt, status: o.prepStatus, pramusaji: o.cashierRef,
    targetMenit: targetMenit(o.orderType),
    items: o.lines.map((l) => ({
      id: l.id, nama: l.name, qty: l.qty, stasiun: l.station,
      catatan: l.note ?? undefined, siap: l.readyAt !== null,
    })),
  }));

const catat = (aksi, meta) => {
  db.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), action: aksi, meta });
  db.audit.length = Math.min(db.audit.length, 200);
};

const rute = {
  'GET /health': () => ({ ok: true, stub: true }),

  'GET /pos/till/bootstrap': () => ({
    tenantId: db.tenantId,
    site: db.site,
    catalog: db.produk.map((p) => ({
      code: p.code, name: p.name, category: p.category, price: p.price,
      available: p.available, unavailableReason: p.unavailableReason,
    })),
    cashiers: db.kasir.map((c) => ({
      employeeNo: c.employeeNo, name: c.name, position: c.position,
      pinHash: pinDigest(c.pinSalt, c.pin), pinSalt: c.pinSalt, pinIter: PIN_ITERATIONS,
    })),
    openSession: null,
    tenders: ['CASH', 'QRIS', 'CARD', 'EWALLET'],
  }),

  'POST /pos/till/sync': (body) => {
    const results = (body.items ?? []).map((it) => {
      if (it.type === 'ORDER' && !db.order.some((o) => o.clientRef === it.clientRef)) {
        db.order.push({
          id: randomUUID(), clientRef: it.clientRef,
          docNo: `POS-${String(db.order.length + 90).padStart(4, '0')}`,
          orderType: it.orderType ?? 'DINE_IN', tableNo: it.tableNo ?? null,
          createdAt: it.at, prepStatus: 'BARU', cashierRef: it.cashierRef ?? null,
          voidedAt: null, total: it.total,
          lines: (it.lines ?? []).map((l) => ({
            id: randomUUID(), name: l.name, qty: l.qty,
            station: db.produk.find((p) => p.code === l.productCode)?.station ?? 'PANAS',
            note: l.note ?? null, readyAt: null,
          })),
        });
        catat('pos.order', { clientRef: it.clientRef, total: it.total });
      }
      return { clientRef: it.clientRef, status: 'ACCEPTED' };
    });
    return { results, accepted: results.length, duplicates: 0, rejected: 0 };
  },

  'GET /kitchen/tickets': () => tiket(),

  'GET /kitchen/menu': () => db.produk.map((p) => ({
    kode: p.code, nama: p.name, kategori: p.category, harga: p.price,
    tersedia: p.available, alasan: p.unavailableReason,
    stasiun: p.station, waktuMasakMenit: p.prepMinutes,
  })),

  'POST /kitchen/menu/availability': (body) => {
    const p = db.produk.find((x) => x.code === body.productCode);
    if (!p) return { error: 'NOT_FOUND' };
    if (!body.available && !String(body.reason ?? '').trim()) {
      return { error: 'REASON_REQUIRED', message: 'Alasan wajib diisi saat mematikan menu' };
    }
    p.available = body.available;
    p.unavailableReason = body.available ? null : body.reason;
    catat(body.available ? 'menu.available' : 'menu.86', { code: p.code, reason: body.reason ?? null });
    return { productCode: p.code, available: p.available, reason: p.unavailableReason };
  },

  'POST /kitchen/lines/ready': (body) => {
    const o = db.order.find((x) => x.lines.some((l) => l.id === body.lineId));
    if (!o) return { error: 'NOT_FOUND' };
    const l = o.lines.find((x) => x.id === body.lineId);
    l.readyAt = body.ready ? new Date().toISOString() : null;
    const sisa = o.lines.filter((x) => x.readyAt === null).length;
    o.prepStatus = sisa === 0 ? 'SIAP' : 'DIMASAK';
    return { lineId: body.lineId, ready: body.ready, ticketStatus: o.prepStatus, sisaBaris: sisa };
  },

  'POST /kitchen/tickets/bump': (body) => {
    const o = db.order.find((x) => x.id === body.orderId);
    if (!o) return { error: 'NOT_FOUND' };
    o.prepStatus = body.to;
    if (body.to === 'SIAP') o.lines.forEach((l) => { l.readyAt ??= new Date().toISOString(); });
    catat(`kitchen.${String(body.to).toLowerCase()}`, { docNo: o.docNo });
    return { orderId: o.id, status: o.prepStatus };
  },

  'GET /kitchen/stats': () => {
    const t = tiket();
    const now = Date.now();
    return {
      antrean: t.length,
      lewatWaktu: t.filter((x) => (now - new Date(x.masukPada).getTime()) / 60_000 >= x.targetMenit).length,
      menuMati: db.produk.filter((p) => !p.available).length,
      menuTotal: db.produk.length,
    };
  },

  'GET /audit/recent': () => db.audit.slice(0, 50),

  // ── ESS ─────────────────────────────────────────────────────────────────
  'GET /ess/me': () => db.karyawan,

  'GET /ess/attendance': () => ({
    hariHadir: db.absen.length,
    totalTerlambatMenit: db.absen.reduce((s, a) => s + a.terlambatMenit, 0),
    totalLemburMenit: db.absen.reduce((s, a) => s + a.lemburMenit, 0),
    ditandai: db.absen.filter((a) => a.ditandai).length,
    riwayat: [...db.absen].reverse(),
  }),

  'POST /ess/clock-in': (body) => {
    if (absenTerbuka()) return { error: 'ALREADY_IN', message: 'Kamu sudah absen masuk hari ini' };
    const waktu = body.offlineAt ?? new Date().toISOString();
    let jarakM = null;
    const alasan = [];
    if (body.lat != null && body.lng != null) {
      jarakM = jarakMeter(body.lat, body.lng, db.geofence.lat, db.geofence.lng);
      if (jarakM > db.geofence.radiusM) alasan.push(`di luar radius (${jarakM} m)`);
    } else {
      alasan.push('lokasi tidak dikirim');
    }
    if (body.offlineAt) alasan.push('dikirim dari antrean offline');

    const shift = db.shift.find((s) => s.tanggal === new Date().toISOString().slice(0, 10));
    const terlambatMenit = shift
      ? Math.max(0, Math.round((new Date(waktu) - new Date(shift.mulai)) / 60_000)) : 0;

    const row = {
      id: randomUUID(), tanggal: waktu, masuk: waktu, keluar: null,
      terlambatMenit, lemburMenit: 0, jarakM,
      ditandai: alasan.length > 0, alasan: alasan.length ? alasan.join('; ') : null,
    };
    db.absen.push(row);
    catat('ess.clock_in', { jarakM, terlambatMenit, ditandai: row.ditandai });
    return row;
  },

  'POST /ess/clock-out': () => {
    const row = absenTerbuka();
    if (!row) return { error: 'NOT_IN', message: 'Belum ada absen masuk yang terbuka' };
    row.keluar = new Date().toISOString();
    const shift = db.shift.find((s) => s.tanggal === new Date().toISOString().slice(0, 10));
    row.lemburMenit = shift
      ? Math.max(0, Math.round((new Date(row.keluar) - new Date(shift.selesai)) / 60_000)) : 0;
    catat('ess.clock_out', { lemburMenit: row.lemburMenit });
    return { ...row, durasiMenit: Math.round((new Date(row.keluar) - new Date(row.masuk)) / 60_000) };
  },

  'GET /ess/shifts': () => db.shift,

  'GET /ess/leave/balance': () => db.jenisCuti.map((j) => {
    const pakai = db.cuti.filter((c) => c.kode === j.kode && c.status === 'APPROVED')
      .reduce((s, c) => s + c.hari, 0);
    return { kode: j.kode, nama: j.nama, kuota: j.kuota, terpakai: pakai, sisa: j.kuota - pakai, dibayar: j.dibayar };
  }),

  'GET /ess/leave': () => [...db.cuti].reverse(),

  'POST /ess/leave': (body) => {
    const j = db.jenisCuti.find((x) => x.kode === body.leaveTypeCode);
    if (!j) return { error: 'NOT_FOUND' };
    const hari = Math.round((new Date(body.endsAt) - new Date(body.startsAt)) / 86_400_000) + 1;
    if (new Date(body.endsAt) < new Date(body.startsAt)) {
      return { error: 'BAD_RANGE', message: 'Tanggal selesai lebih awal dari tanggal mulai' };
    }
    const bentrok = db.cuti.some((c) =>
      ['SUBMITTED', 'APPROVED'].includes(c.status) &&
      c.mulai <= body.endsAt && c.selesai >= body.startsAt);
    if (bentrok) return { error: 'OVERLAP', message: 'Sudah ada pengajuan cuti pada tanggal itu' };
    // Sama seperti server asli: kuota diperiksa sebelum pengajuan diterima.
    const dipakai = db.cuti.filter((c) => c.kode === j.kode && c.status === 'APPROVED')
      .reduce((s, c) => s + c.hari, 0);
    const sisa = j.kuota - dipakai;
    if (sisa < hari) {
      return { error: 'NO_BALANCE', message: `Sisa kuota ${sisa} hari, diajukan ${hari} hari`, sisa, diajukan: hari };
    }
    const row = {
      id: randomUUID(), kode: j.kode, jenis: j.nama,
      mulai: body.startsAt, selesai: body.endsAt, hari,
      alasan: body.reason ?? null, status: 'SUBMITTED', diputusPada: null,
    };
    db.cuti.push(row);
    catat('ess.leave_request', { jenis: j.kode, hari });
    return { id: row.id, hari, status: 'SUBMITTED', band: 'T0' };
  },

  'GET /ess/payslips': () => db.slip,
};

createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://x');
  let chunks = '';
  req.on('data', (c) => { chunks += c; });
  req.on('end', () => {
    const kunci = `${req.method} ${url.pathname}`;
    const handler = rute[kunci];
    res.setHeader('content-type', 'application/json');
    if (!handler) {
      res.writeHead(404);
      return res.end(JSON.stringify({ error: 'NOT_FOUND', route: kunci }));
    }
    let body = {};
    try { body = chunks ? JSON.parse(chunks) : {}; } catch { /* biarkan kosong */ }
    const hasil = handler(body, url);
    res.writeHead(hasil?.error ? 400 : 200);
    res.end(JSON.stringify(hasil));
  });
}).listen(PORT, () => {
  process.stdout.write(`dev-stub siap di :${PORT} — data di memori, hilang saat berhenti\n`);
});
