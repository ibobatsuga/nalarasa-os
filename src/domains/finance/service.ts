import { prisma } from '../../core/db.js';
import { num, round2 } from '../../core/seq.js';
import { ControlError } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { assertCan } from '../../iam/rbac.js';

/**
 * Bacaan untuk aplikasi keuangan.
 *
 * Semuanya diturunkan dari buku besar yang sudah ada — tidak ada angka yang
 * dihitung ulang dengan rumus berbeda di sini. Aplikasi keuangan yang punya
 * versi laba-ruginya sendiri adalah cara paling pasti membuat dua laporan
 * resmi yang saling bertentangan.
 *
 * Hanya membaca. Pembukuan tetap lewat jalur R2R yang berkontrol penuh:
 * siapkan → setujui → posting, dengan SOD07 dan penguncian periode.
 */

/** Jenis akun dalam istilah yang dipakai aplikasi keuangan. */
const JENIS: Record<string, 'HARTA' | 'UTANG' | 'MODAL' | 'PENDAPATAN' | 'BEBAN'> = {
  ASSET: 'HARTA', LIABILITY: 'UTANG', EQUITY: 'MODAL', INCOME: 'PENDAPATAN', EXPENSE: 'BEBAN',
};

/** Kas & setara kas dikenali dari kode akun, bukan dari nama yang bisa berubah. */
const isKas = (kode: string) => /^1-11/.test(kode);

/**
 * Status dokumen dalam kosakata aplikasi keuangan.
 *
 * Aplikasi itu berbahasa Indonesia dan tipenya menutup daftar ini; mengirim
 * "EXECUTED" apa adanya membuat setiap penyaringan status gagal diam-diam —
 * layar tampak normal, isinya kosong.
 */
const STATUS_DOK: Record<string, 'DRAFT' | 'DIAJUKAN' | 'DISETUJUI' | 'DIBUKUKAN' | 'DITOLAK'> = {
  DRAFT: 'DRAFT', SUBMITTED: 'DIAJUKAN', APPROVED: 'DISETUJUI',
  EXECUTED: 'DIBUKUKAN', REVERSED: 'DITOLAK', CANCELLED: 'DITOLAK',
};

/** Sumber data dalam kosakata yang sama. */
const SUMBER_DOK = (source: string, journalCode: string): 'POS' | 'MANUAL' | 'STRUK' | 'BANK' | 'PAYROLL' => {
  if (journalCode === 'POS') return 'POS';
  if (journalCode === 'PAY') return 'PAYROLL';
  if (journalCode === 'BANK') return 'BANK';
  return source === 'SUBLEDGER' ? 'BANK' : 'MANUAL';
};

export async function chartOfAccounts(actor: Actor) {
  assertCan(actor, 'account.read');
  const rows = await prisma.account.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { code: 'asc' },
  });
  return rows.map((a) => ({
    kode: a.code,
    nama: a.name,
    jenis: JENIS[a.type] ?? 'HARTA',
    kas: isKas(a.code),
    dibatasi: a.restricted,
  }));
}

/** Rentang tanggal; default bulan berjalan. */
function rentang(dari?: Date, sampai?: Date) {
  const now = new Date();
  return {
    dari: dari ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    sampai: sampai ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)),
  };
}

/**
 * Transaksi dalam bentuk yang dibaca aplikasi keuangan.
 *
 * Jurnal itu berpasangan; aplikasi menampilkannya sebagai satu baris berarah.
 * Pemetaannya: baris non-kas menjadi barisnya, lawan akunnya adalah baris kas
 * pada jurnal yang sama. Jurnal tanpa sisi kas (mis. penyusutan) tetap
 * ditampilkan — arahnya ditentukan debit/kredit akun bebannya.
 */
export async function transactions(actor: Actor, dari?: Date, sampai?: Date) {
  assertCan(actor, 'journal.read');
  const r = rentang(dari, sampai);

  const entries = await prisma.journalEntry.findMany({
    where: { postingDate: { gte: r.dari, lte: r.sampai }, status: { in: ['APPROVED', 'EXECUTED'] } },
    include: { lines: { include: { account: true } } },
    orderBy: { postingDate: 'desc' },
  });

  const hasil = [];
  for (const e of entries) {
    const kas = e.lines.find((l) => isKas(l.account.code));
    const utama = e.lines.find((l) => !isKas(l.account.code)) ?? e.lines[0];
    if (!utama) continue;

    const jumlah = round2(Math.max(num(utama.debit), num(utama.credit)));
    if (jumlah === 0) continue;

    // Uang keluar bila akun kas dikredit; bila tidak ada sisi kas, arah
    // ditentukan oleh sisi akun utamanya (beban didebit = keluar).
    const keluar = kas ? num(kas.credit) > 0 : num(utama.debit) > 0;

    hasil.push({
      id: e.id,
      tanggal: e.postingDate.toISOString().slice(0, 10),
      arah: keluar ? 'KELUAR' : 'MASUK',
      kategori: utama.account.name,
      akunKode: utama.account.code,
      lawanAkunKode: kas?.account.code ?? '',
      keterangan: e.memo ?? e.docNo,
      jumlah,
      outlet: e.companyId,
      sumber: SUMBER_DOK(e.source, e.journalCode),
      status: STATUS_DOK[e.status] ?? 'DRAFT',
      refDokumen: e.docNo,
    });
  }
  return hasil;
}

/** Buku besar: saldo per akun untuk rentang tertentu. */
export async function ledger(actor: Actor, dari?: Date, sampai?: Date) {
  assertCan(actor, 'account.read');
  const r = rentang(dari, sampai);

  const lines = await prisma.journalLine.findMany({
    where: {
      entry: { postingDate: { gte: r.dari, lte: r.sampai }, status: { in: ['APPROVED', 'EXECUTED'] } },
    },
    include: { account: true },
  });

  const per = new Map<string, { nama: string; jenis: string; debit: number; kredit: number }>();
  for (const l of lines) {
    const k = l.account.code;
    const cur = per.get(k) ?? { nama: l.account.name, jenis: JENIS[l.account.type] ?? 'HARTA', debit: 0, kredit: 0 };
    cur.debit += num(l.debit);
    cur.kredit += num(l.credit);
    per.set(k, cur);
  }

  return [...per.entries()].map(([kode, v]) => ({
    kode, nama: v.nama, jenis: v.jenis,
    debit: round2(v.debit), kredit: round2(v.kredit),
    // Harta dan beban bersaldo debit; utang, modal, dan pendapatan bersaldo kredit.
    saldo: round2(v.jenis === 'HARTA' || v.jenis === 'BEBAN' ? v.debit - v.kredit : v.kredit - v.debit),
  })).sort((a, b) => a.kode.localeCompare(b.kode));
}

/** Laba rugi untuk rentang tertentu, dari buku besar yang sama. */
export async function incomeStatement(actor: Actor, dari?: Date, sampai?: Date) {
  assertCan(actor, 'account.read');
  const baris = await ledger(actor, dari, sampai);

  const pendapatan = round2(baris.filter((b) => b.jenis === 'PENDAPATAN').reduce((s, b) => s + b.saldo, 0));
  const beban = round2(baris.filter((b) => b.jenis === 'BEBAN').reduce((s, b) => s + b.saldo, 0));
  const laba = round2(pendapatan - beban);

  return {
    pendapatan, beban, laba,
    // Margin tidak terdefinisi tanpa pendapatan; nol lebih jujur daripada NaN.
    margin: pendapatan > 0 ? round2(laba / pendapatan) : 0,
    rincianPendapatan: baris.filter((b) => b.jenis === 'PENDAPATAN'),
    rincianBeban: baris.filter((b) => b.jenis === 'BEBAN').sort((a, b) => b.saldo - a.saldo),
  };
}

/** Posisi kas: saldo tiap akun kas & setara kas. */
export async function cashPosition(actor: Actor, dari?: Date, sampai?: Date) {
  assertCan(actor, 'account.read');
  const baris = await ledger(actor, dari, sampai);
  const kas = baris.filter((b) => isKas(b.kode));
  return { total: round2(kas.reduce((s, b) => s + b.saldo, 0)), akun: kas };
}

/** Utang (VendorBill) dan piutang (Invoice) dalam satu daftar. */
export async function payables(actor: Actor) {
  assertCan(actor, 'account.read');
  const [bills, invoices] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { status: { in: ['SUBMITTED', 'APPROVED', 'EXECUTED'] } },
      orderBy: { billDate: 'desc' },
      take: 200,
    }),
    prisma.invoice.findMany({
      where: { status: { in: ['SUBMITTED', 'APPROVED', 'EXECUTED'] } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  // Skema tidak menautkan VendorBill/Invoice ke Party lewat relasi, jadi nama
  // pihak diambil sekali untuk semua id — bukan satu query per baris.
  const idPihak = [...new Set([...bills.map((b) => b.vendorId), ...invoices.map((i) => i.partyId)])];
  const pihak = new Map(
    (await prisma.party.findMany({ where: { id: { in: idPihak } }, select: { id: true, legalName: true } }))
      .map((p) => [p.id, p.legalName]),
  );

  const hariIni = new Date();
  const bentuk = (
    id: string, nomor: string, pihak: string, tanggal: Date, jatuhTempo: Date | null,
    jumlah: number, terbayar: number, jenis: 'UTANG' | 'PIUTANG',
  ) => ({
    id, nomor, pihak,
    tanggal: tanggal.toISOString().slice(0, 10),
    jatuhTempo: (jatuhTempo ?? tanggal).toISOString().slice(0, 10),
    jumlah: round2(jumlah), terbayar: round2(terbayar), jenis,
    status: terbayar >= jumlah ? 'LUNAS'
      : (jatuhTempo ?? tanggal) < hariIni ? 'JATUH_TEMPO' : 'BELUM_JATUH_TEMPO',
    refDokumen: nomor,
  });

  return [
    ...bills.map((b) => bentuk(
      b.id, b.docNo, pihak.get(b.vendorId) ?? '—', b.billDate, b.dueAt,
      num(b.total), b.status === 'EXECUTED' ? num(b.total) : 0, 'UTANG',
    )),
    ...invoices.map((i) => bentuk(
      i.id, i.docNo, pihak.get(i.partyId) ?? '—', i.issuedAt ?? i.createdAt, i.dueAt,
      num(i.total), num(i.settled), 'PIUTANG',
    )),
  ].sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/**
 * Setoran kas per sesi POS.
 *
 * Selisih dihitung server dari angka yang sama yang memicu persetujuan AR26 —
 * kalau aplikasi keuangan menghitungnya sendiri, kasir bisa melihat selisih
 * yang berbeda dari yang dipakai menyetujui.
 */
export async function cashDeposits(actor: Actor, hari = 30) {
  assertCan(actor, 'account.read');
  const sejak = new Date(Date.now() - hari * 86_400_000);

  const sessions = await prisma.posSession.findMany({
    where: { openedAt: { gte: sejak } },
    orderBy: { openedAt: 'desc' },
    take: 200,
  });
  const outlet = new Map(
    (await prisma.site.findMany({
      where: { id: { in: [...new Set(sessions.map((x) => x.siteId))] } },
      select: { id: true, code: true },
    })).map((x) => [x.id, x.code]),
  );

  return sessions.map((s) => {
    const sistem = round2(num(s.expectedCash) + num(s.openingFloat));
    const dihitung = s.countedCash === null ? null : round2(num(s.countedCash));
    return {
      id: s.id,
      tanggal: s.openedAt.toISOString().slice(0, 10),
      outlet: outlet.get(s.siteId) ?? '—',
      sesiPos: s.id.slice(-8),
      kasSistem: sistem,
      kasDihitung: dihitung ?? 0,
      disetor: dihitung ?? 0,
      selisih: dihitung === null ? 0 : round2(dihitung - sistem),
      status: s.status === 'DRAFT' ? 'MENUNGGU_SETOR' : 'DISETOR',
    };
  });
}

/** Ringkasan beranda: satu panggilan, supaya layar pertama tidak melakukan enam. */
export async function summary(actor: Actor, dari?: Date, sampai?: Date) {
  assertCan(actor, 'account.read');
  const [lr, kas, tagihan] = await Promise.all([
    incomeStatement(actor, dari, sampai),
    cashPosition(actor, dari, sampai),
    payables(actor),
  ]);
  const utang = tagihan.filter((t) => t.jenis === 'UTANG' && t.status !== 'LUNAS');
  const piutang = tagihan.filter((t) => t.jenis === 'PIUTANG' && t.status !== 'LUNAS');

  return {
    labaRugi: { pendapatan: lr.pendapatan, beban: lr.beban, laba: lr.laba, margin: lr.margin },
    kas: kas.total,
    utangBerjalan: round2(utang.reduce((s, t) => s + (t.jumlah - t.terbayar), 0)),
    piutangBerjalan: round2(piutang.reduce((s, t) => s + (t.jumlah - t.terbayar), 0)),
    jatuhTempo: utang.filter((t) => t.status === 'JATUH_TEMPO').length,
  };
}

/**
 * Pendapatan dan margin per bulan.
 *
 * Dashboard sebelumnya menggambar deret contoh di bawah kartu KPI yang sudah
 * nyata — kombinasi paling menyesatkan yang bisa ada di satu layar. Sekarang
 * grafiknya berasal dari buku besar yang sama dengan kartunya.
 */
export async function monthlyTrend(actor: Actor, bulan = 7) {
  assertCan(actor, 'account.read');
  const now = new Date();
  const NAMA = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const hasil = [];
  for (let i = bulan - 1; i >= 0; i--) {
    const awal = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const akhir = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59));
    const lr = await incomeStatement(actor, awal, akhir);
    hasil.push({
      label: NAMA[awal.getUTCMonth()]!,
      // Bulan tanpa transaksi bernilai nol — bukan dilewati. Grafik yang
      // melompati bulan kosong membuat penurunan terlihat seperti kenaikan.
      a: lr.pendapatan,
      b: round2(lr.margin * 100),
    });
  }
  return hasil;
}

/** Komposisi penjualan per kategori menu, dari baris pesanan kasir. */
export async function salesMix(actor: Actor, hari = 30) {
  assertCan(actor, 'account.read');
  const sejak = new Date(Date.now() - hari * 86_400_000);

  const lines = await prisma.posOrderLine.findMany({
    where: { order: { createdAt: { gte: sejak }, voidedAt: null, voidOfRef: null } },
    select: { productCode: true, qty: true, unitPrice: true },
  });
  if (lines.length === 0) return [];

  const produk = await prisma.product.findMany({ select: { code: true, category: true } });
  const kategori = new Map(produk.map((p) => [p.code, p.category]));

  const per = new Map<string, number>();
  let total = 0;
  for (const l of lines) {
    const k = kategori.get(l.productCode) ?? 'Lainnya';
    const nilai = num(l.qty) * num(l.unitPrice);
    per.set(k, (per.get(k) ?? 0) + nilai);
    total += nilai;
  }
  if (total === 0) return [];

  return [...per.entries()]
    .map(([label, nilai]) => ({ label, value: round2((nilai / total) * 100) }))
    .sort((a, b) => b.value - a.value);
}

/** Periode terkunci menutup pembukuan; layar perlu tahu agar tidak menawarkan input. */
export async function periods(actor: Actor) {
  assertCan(actor, 'account.read');
  const rows = await prisma.period.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 24 });
  if (rows.length === 0) throw new ControlError('NO_PERIOD', 'Belum ada periode dibuka', 404);
  return rows.map((p) => ({ tahun: p.year, bulan: p.month, status: p.status }));
}
