/**
 * Model pembukuan untuk UMKM kuliner.
 *
 * Bentuk barisnya sengaja dibuat sama dengan API Nalarasa OS, jadi ketika
 * endpoint-nya siap, yang ditukar hanya sumbernya — bukan layarnya.
 *
 * Tiga hal yang membedakan pembukuan cafe dari pembukuan korporat, dan
 * karenanya membentuk model ini:
 *   1. Belanja pasar tanpa faktur pajak. Bukti = nota tulis tangan atau foto.
 *   2. Pajak umumnya PPh final 0,5% dari omzet, bukan PPN dan SPT badan.
 *   3. Kas fisik mendominasi. Setoran tunai harian dari laci ke bank adalah
 *      transaksi paling sering, dan paling rawan.
 */

export type Arah = 'MASUK' | 'KELUAR';
export type SumberData = 'POS' | 'MANUAL' | 'STRUK' | 'BANK' | 'PAYROLL';
export type StatusDoc = 'DRAFT' | 'DIAJUKAN' | 'DISETUJUI' | 'DIBUKUKAN' | 'DITOLAK';

export interface Akun {
  kode: string;
  nama: string;
  jenis: 'HARTA' | 'UTANG' | 'MODAL' | 'PENDAPATAN' | 'BEBAN';
  /** Ditampilkan di laporan arus kas sebagai kas/setara kas. */
  kas?: boolean;
}

export interface Transaksi {
  id: string;
  tanggal: string;
  arah: Arah;
  kategori: string;
  akunKode: string;
  lawanAkunKode: string;
  keterangan: string;
  jumlah: number;
  outlet: string;
  sumber: SumberData;
  buktiUrl?: string;
  status: StatusDoc;
  /** Dari POS: nomor sesi atau struk. Dari P2P: nomor tagihan. */
  refDokumen?: string;
}

export interface Struk {
  id: string;
  diterima: string;
  pemasok: string;
  outlet: string;
  total: number;
  jumlahBaris: number;
  keyakinan: number;   // 0..1 — hasil pembacaan
  status: 'ANTRE' | 'PERLU_KOREKSI' | 'SIAP' | 'DIBUKUKAN';
  catatan?: string;
}

export interface Tagihan {
  id: string;
  nomor: string;
  pihak: string;
  tanggal: string;
  jatuhTempo: string;
  jumlah: number;
  terbayar: number;
  jenis: 'UTANG' | 'PIUTANG';
  status: 'BELUM_JATUH_TEMPO' | 'JATUH_TEMPO' | 'LUNAS';
  refDokumen?: string;
}

export interface SetoranKas {
  id: string;
  tanggal: string;
  outlet: string;
  sesiPos: string;
  kasSistem: number;
  kasDihitung: number;
  disetor: number;
  selisih: number;
  status: 'MENUNGGU_SETOR' | 'DISETOR' | 'COCOK_BANK';
}

// ─── bagan akun ringkas ───────────────────────────────────────────────────────

export const AKUN: Akun[] = [
  { kode: '1-101', nama: 'Kas Laci Outlet', jenis: 'HARTA', kas: true },
  { kode: '1-102', nama: 'Kas Kecil', jenis: 'HARTA', kas: true },
  { kode: '1-110', nama: 'Bank BCA', jenis: 'HARTA', kas: true },
  { kode: '1-120', nama: 'Dana Gateway Belum Cair', jenis: 'HARTA', kas: true },
  { kode: '1-200', nama: 'Piutang Usaha', jenis: 'HARTA' },
  { kode: '1-300', nama: 'Persediaan Bahan', jenis: 'HARTA' },
  { kode: '2-100', nama: 'Utang Pemasok', jenis: 'UTANG' },
  { kode: '2-200', nama: 'Utang Pajak', jenis: 'UTANG' },
  { kode: '2-300', nama: 'Utang Gaji', jenis: 'UTANG' },
  { kode: '3-100', nama: 'Modal Pemilik', jenis: 'MODAL' },
  { kode: '4-100', nama: 'Penjualan Makanan & Minuman', jenis: 'PENDAPATAN' },
  { kode: '4-200', nama: 'Penjualan Katering', jenis: 'PENDAPATAN' },
  { kode: '5-100', nama: 'Harga Pokok Penjualan', jenis: 'BEBAN' },
  { kode: '6-100', nama: 'Gaji & Upah', jenis: 'BEBAN' },
  { kode: '6-200', nama: 'Sewa Tempat', jenis: 'BEBAN' },
  { kode: '6-300', nama: 'Listrik, Air, Gas', jenis: 'BEBAN' },
  { kode: '6-400', nama: 'Perlengkapan & Kemasan', jenis: 'BEBAN' },
  { kode: '6-500', nama: 'Biaya Gateway & Admin Bank', jenis: 'BEBAN' },
  { kode: '6-600', nama: 'Pemasaran', jenis: 'BEBAN' },
  { kode: '6-700', nama: 'Perawatan Alat', jenis: 'BEBAN' },
  { kode: '6-900', nama: 'Beban Pajak Final', jenis: 'BEBAN' },
];

export const akunNama = (kode: string) => AKUN.find((a) => a.kode === kode)?.nama ?? kode;

export const KATEGORI_KELUAR = [
  'Belanja bahan pasar', 'Belanja pemasok', 'Gaji & upah', 'Sewa',
  'Listrik, air, gas', 'Perlengkapan & kemasan', 'Pemasaran',
  'Perawatan alat', 'Biaya bank', 'Pajak', 'Lain-lain',
];

export const KATEGORI_MASUK = [
  'Penjualan tunai (POS)', 'Penjualan non-tunai (POS)', 'Penjualan katering', 'Pelunasan piutang',
  'Setoran modal', 'Pendapatan lain',
];

// ─── data contoh ──────────────────────────────────────────────────────────────

const hari = (mundur: number) => {
  const d = new Date(2026, 7, 7 - mundur);
  return d.toISOString().slice(0, 10);
};

export const TRANSAKSI: Transaksi[] = [
  // Saldo awal. Tanpa baris ini neraca tidak seimbang dan kas kecil terlihat minus.
  { id: 'TRX-0001', tanggal: '2026-08-01', arah: 'MASUK', kategori: 'Setoran modal', akunKode: '1-110', lawanAkunKode: '3-100', keterangan: 'Saldo awal — Bank BCA', jumlah: 45_000_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0002', tanggal: '2026-08-01', arah: 'MASUK', kategori: 'Setoran modal', akunKode: '1-102', lawanAkunKode: '3-100', keterangan: 'Saldo awal — Kas kecil', jumlah: 12_000_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0221', tanggal: hari(7), arah: 'KELUAR', kategori: 'Belanja pemasok', akunKode: '5-100', lawanAkunKode: '2-100', keterangan: 'Beras & sembako — Toko Beras Sentosa', jumlah: 5_040_000, outlet: 'RESTO-01', sumber: 'MANUAL', status: 'DIBUKUKAN', refDokumen: 'BRS/0806/12' },
  { id: 'TRX-0220', tanggal: hari(6), arah: 'KELUAR', kategori: 'Belanja bahan pasar', akunKode: '5-100', lawanAkunKode: '1-102', keterangan: 'Sayur, ayam, bumbu — belanja mingguan', jumlah: 3_180_000, outlet: 'RESTO-01', sumber: 'STRUK', status: 'DIBUKUKAN', buktiUrl: 'struk-0085.jpg' },
  { id: 'TRX-0219', tanggal: hari(5), arah: 'KELUAR', kategori: 'Belanja bahan pasar', akunKode: '5-100', lawanAkunKode: '1-102', keterangan: 'Belanja harian Pasar Kranggan', jumlah: 1_960_000, outlet: 'RESTO-02', sumber: 'STRUK', status: 'DIBUKUKAN', buktiUrl: 'struk-0091.jpg' },
  { id: 'TRX-0218', tanggal: hari(4), arah: 'MASUK', kategori: 'Penjualan tunai (POS)', akunKode: '1-101', lawanAkunKode: '4-100', keterangan: 'Sesi kasir RESTO-01', jumlah: 5_880_000, outlet: 'RESTO-01', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000205' },
  { id: 'TRX-0217', tanggal: hari(4), arah: 'MASUK', kategori: 'Penjualan non-tunai (POS)', akunKode: '1-120', lawanAkunKode: '4-100', keterangan: 'QRIS & kartu RESTO-01', jumlah: 4_140_000, outlet: 'RESTO-01', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000205' },
  { id: 'TRX-0216', tanggal: hari(5), arah: 'MASUK', kategori: 'Penjualan tunai (POS)', akunKode: '1-101', lawanAkunKode: '4-100', keterangan: 'Sesi kasir RESTO-02', jumlah: 3_940_000, outlet: 'RESTO-02', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000203' },
  { id: 'TRX-0215', tanggal: hari(6), arah: 'MASUK', kategori: 'Penjualan tunai (POS)', akunKode: '1-101', lawanAkunKode: '4-100', keterangan: 'Sesi kasir RESTO-01', jumlah: 7_310_000, outlet: 'RESTO-01', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000199' },
  { id: 'TRX-0214', tanggal: hari(7), arah: 'MASUK', kategori: 'Penjualan non-tunai (POS)', akunKode: '1-120', lawanAkunKode: '4-100', keterangan: 'QRIS & kartu RESTO-02', jumlah: 2_960_000, outlet: 'RESTO-02', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000196' },
  { id: 'TRX-0213', tanggal: hari(3), arah: 'MASUK', kategori: 'Penjualan katering', akunKode: '1-200', lawanAkunKode: '4-200', keterangan: 'Katering PT Sinar Kreatif — 120 pax', jumlah: 18_200_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN', refDokumen: 'INV-202608-000210' },
  { id: 'TRX-0211', tanggal: '2026-08-01', arah: 'MASUK', kategori: 'Penjualan katering', akunKode: '1-200', lawanAkunKode: '4-200', keterangan: 'Katering PT Sinar Kreatif — INV-000212', jumlah: 24_800_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN', refDokumen: 'INV-202608-000212' },
  { id: 'TRX-0210', tanggal: '2026-08-01', arah: 'KELUAR', kategori: 'Belanja pemasok', akunKode: '5-100', lawanAkunKode: '2-100', keterangan: 'Bahan katering INV-000212', jumlah: 9_920_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0212', tanggal: hari(3), arah: 'KELUAR', kategori: 'Belanja pemasok', akunKode: '5-100', lawanAkunKode: '2-100', keterangan: 'Bahan katering 120 pax', jumlah: 7_280_000, outlet: 'HO', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0231', tanggal: hari(0), arah: 'MASUK', kategori: 'Penjualan tunai (POS)', akunKode: '1-101', lawanAkunKode: '4-100', keterangan: 'Sesi kasir RESTO-01', jumlah: 6_420_000, outlet: 'RESTO-01', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000212' },
  { id: 'TRX-0230', tanggal: hari(0), arah: 'MASUK', kategori: 'Penjualan non-tunai (POS)', akunKode: '1-120', lawanAkunKode: '4-100', keterangan: 'QRIS & kartu RESTO-01', jumlah: 3_268_000, outlet: 'RESTO-01', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000212' },
  { id: 'TRX-0229', tanggal: hari(0), arah: 'KELUAR', kategori: 'Belanja bahan pasar', akunKode: '5-100', lawanAkunKode: '1-102', keterangan: 'Sayur & bumbu Pasar Beringharjo', jumlah: 842_000, outlet: 'RESTO-01', sumber: 'STRUK', status: 'DIAJUKAN', buktiUrl: 'struk-0091.jpg' },
  { id: 'TRX-0228', tanggal: hari(1), arah: 'KELUAR', kategori: 'Belanja pemasok', akunKode: '5-100', lawanAkunKode: '2-100', keterangan: 'CV Ayam Makmur — tagihan AM-2026-0811', jumlah: 7_180_000, outlet: 'RESTO-01', sumber: 'MANUAL', status: 'DIAJUKAN', refDokumen: 'AM-2026-0811' },
  { id: 'TRX-0227', tanggal: hari(1), arah: 'MASUK', kategori: 'Penjualan tunai (POS)', akunKode: '1-101', lawanAkunKode: '4-100', keterangan: 'Sesi kasir RESTO-02', jumlah: 4_120_000, outlet: 'RESTO-02', sumber: 'POS', status: 'DIBUKUKAN', refDokumen: 'POS-202608-000211' },
  { id: 'TRX-0226', tanggal: hari(2), arah: 'KELUAR', kategori: 'Listrik, air, gas', akunKode: '6-300', lawanAkunKode: '1-110', keterangan: 'Token listrik Agustus', jumlah: 1_450_000, outlet: 'RESTO-01', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0225', tanggal: hari(3), arah: 'KELUAR', kategori: 'Perlengkapan & kemasan', akunKode: '6-400', lawanAkunKode: '1-102', keterangan: 'Paper bag & sedotan', jumlah: 620_000, outlet: 'RESTO-01', sumber: 'STRUK', status: 'DIBUKUKAN', buktiUrl: 'struk-0088.jpg' },
  { id: 'TRX-0224', tanggal: hari(4), arah: 'KELUAR', kategori: 'Gaji & upah', akunKode: '6-100', lawanAkunKode: '1-110', keterangan: 'Upah harian 4 orang', jumlah: 640_000, outlet: 'RESTO-01', sumber: 'PAYROLL', status: 'DIBUKUKAN' },
  { id: 'TRX-0223', tanggal: hari(5), arah: 'KELUAR', kategori: 'Sewa', akunKode: '6-200', lawanAkunKode: '1-110', keterangan: 'Sewa tempat Agustus RESTO-02', jumlah: 8_500_000, outlet: 'RESTO-02', sumber: 'MANUAL', status: 'DIBUKUKAN' },
  { id: 'TRX-0222', tanggal: hari(6), arah: 'MASUK', kategori: 'Pelunasan piutang', akunKode: '1-110', lawanAkunKode: '1-200', keterangan: 'PT Sinar Kreatif — INV-000212', jumlah: 24_800_000, outlet: 'HO', sumber: 'BANK', status: 'DIBUKUKAN', refDokumen: 'INV-202608-000212' },
];

export const STRUK: Struk[] = [
  { id: 'STR-0093', diterima: hari(0), pemasok: 'Pasar Beringharjo', outlet: 'RESTO-01', total: 842_000, jumlahBaris: 14, keyakinan: 0.94, status: 'SIAP' },
  { id: 'STR-0092', diterima: hari(0), pemasok: 'Toko Plastik Sejahtera', outlet: 'RESTO-01', total: 318_000, jumlahBaris: 6, keyakinan: 0.71, status: 'PERLU_KOREKSI', catatan: 'Dua baris harga buram' },
  { id: 'STR-0091', diterima: hari(1), pemasok: 'Pasar Kranggan', outlet: 'RESTO-02', total: 496_000, jumlahBaris: 9, keyakinan: 0.88, status: 'DIBUKUKAN' },
  { id: 'STR-0090', diterima: hari(1), pemasok: '(belum terbaca)', outlet: 'RESTO-01', total: 0, jumlahBaris: 0, keyakinan: 0.12, status: 'ANTRE', catatan: 'Foto miring, perlu difoto ulang' },
];

export const TAGIHAN: Tagihan[] = [
  { id: 'U-01', nomor: 'AM-2026-0811', pihak: 'CV Ayam Makmur', tanggal: hari(1), jatuhTempo: '2026-08-20', jumlah: 7_180_000, terbayar: 0, jenis: 'UTANG', status: 'BELUM_JATUH_TEMPO', refDokumen: 'PO-202608-000090' },
  { id: 'U-02', nomor: 'INV/SSJ/2608/0442', pihak: 'Sayur Segar Jaya', tanggal: hari(1), jatuhTempo: '2026-09-05', jumlah: 3_240_000, terbayar: 0, jenis: 'UTANG', status: 'BELUM_JATUH_TEMPO', refDokumen: 'PO-202608-000091' },
  { id: 'U-03', nomor: 'BRS/0806/12', pihak: 'Toko Beras Sentosa', tanggal: hari(2), jatuhTempo: '2026-08-06', jumlah: 5_040_000, terbayar: 5_040_000, jenis: 'UTANG', status: 'LUNAS' },
  { id: 'P-01', nomor: 'INV-202608-000210', pihak: 'Hotel Emerald — Banquet', tanggal: hari(4), jatuhTempo: '2026-08-17', jumlah: 18_200_000, terbayar: 0, jenis: 'PIUTANG', status: 'BELUM_JATUH_TEMPO' },
  { id: 'P-02', nomor: 'INV-202607-000198', pihak: 'CV Rasa Nusantara', tanggal: '2026-07-02', jatuhTempo: '2026-08-01', jumlah: 27_400_000, terbayar: 0, jenis: 'PIUTANG', status: 'JATUH_TEMPO' },
];

export const SETORAN: SetoranKas[] = [
  { id: 'SET-0044', tanggal: hari(0), outlet: 'RESTO-01', sesiPos: 'POS-202608-000212', kasSistem: 2_940_000, kasDihitung: 2_928_000, disetor: 0, selisih: -12_000, status: 'MENUNGGU_SETOR' },
  { id: 'SET-0043', tanggal: hari(0), outlet: 'RESTO-02', sesiPos: 'POS-202608-000211', kasSistem: 1_910_000, kasDihitung: 1_910_000, disetor: 1_910_000, selisih: 0, status: 'DISETOR' },
  { id: 'SET-0042', tanggal: hari(1), outlet: 'RESTO-01', sesiPos: 'POS-202608-000208', kasSistem: 3_420_000, kasDihitung: 3_420_000, disetor: 3_420_000, selisih: 0, status: 'COCOK_BANK' },
  { id: 'SET-0041', tanggal: hari(1), outlet: 'RESTO-02', sesiPos: 'POS-202608-000207', kasSistem: 2_105_000, kasDihitung: 1_925_000, disetor: 1_925_000, selisih: -180_000, status: 'COCOK_BANK' },
];

// ─── turunan: buku besar, laba rugi, arus kas, pajak ──────────────────────────

export interface BarisJurnal {
  tanggal: string;
  ref: string;
  keterangan: string;
  akunKode: string;
  debit: number;
  kredit: number;
}

/**
 * Setiap transaksi menghasilkan dua baris. Sengaja diturunkan, bukan disimpan,
 * supaya angka buku selalu sama dengan angka transaksi — tidak bisa berbeda.
 */
export function jurnal(trx: Transaksi[] = TRANSAKSI): BarisJurnal[] {
  return trx
    .filter((t) => t.status === 'DIBUKUKAN')
    .flatMap((t) => [
      { tanggal: t.tanggal, ref: t.id, keterangan: t.keterangan, akunKode: t.akunKode, debit: t.jumlah, kredit: 0 },
      { tanggal: t.tanggal, ref: t.id, keterangan: t.keterangan, akunKode: t.lawanAkunKode, debit: 0, kredit: t.jumlah },
    ])
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || a.ref.localeCompare(b.ref));
}

export interface SaldoAkun { akun: Akun; debit: number; kredit: number; saldo: number }

export function bukuBesar(trx: Transaksi[] = TRANSAKSI): SaldoAkun[] {
  const baris = jurnal(trx);
  return AKUN.map((akun) => {
    const milik = baris.filter((b) => b.akunKode === akun.kode);
    const debit = milik.reduce((s, b) => s + b.debit, 0);
    const kredit = milik.reduce((s, b) => s + b.kredit, 0);
    // Harta dan beban bersaldo debit; utang, modal, pendapatan bersaldo kredit.
    const normalDebit = akun.jenis === 'HARTA' || akun.jenis === 'BEBAN';
    return { akun, debit, kredit, saldo: normalDebit ? debit - kredit : kredit - debit };
  }).filter((s) => s.debit !== 0 || s.kredit !== 0);
}

export function labaRugi(trx: Transaksi[] = TRANSAKSI) {
  const bb = bukuBesar(trx);
  const ambil = (jenis: Akun['jenis']) => bb.filter((s) => s.akun.jenis === jenis);
  const pendapatan = ambil('PENDAPATAN');
  const beban = ambil('BEBAN');
  const totalPendapatan = pendapatan.reduce((s, x) => s + x.saldo, 0);
  const hpp = beban.filter((b) => b.akun.kode === '5-100').reduce((s, x) => s + x.saldo, 0);
  const operasional = beban.filter((b) => b.akun.kode !== '5-100').reduce((s, x) => s + x.saldo, 0);
  return {
    pendapatan, beban, totalPendapatan, hpp, operasional,
    labaKotor: totalPendapatan - hpp,
    labaBersih: totalPendapatan - hpp - operasional,
    marginKotor: totalPendapatan ? (totalPendapatan - hpp) / totalPendapatan : 0,
  };
}

export function posisiKas(trx: Transaksi[] = TRANSAKSI) {
  return bukuBesar(trx).filter((s) => s.akun.kas).map((s) => ({ akun: s.akun, saldo: s.saldo }));
}

// ─── pajak UMKM ───────────────────────────────────────────────────────────────

/**
 * PP 55/2022: omzet di bawah Rp 4,8 miliar setahun kena PPh final 0,5%.
 * Rp 500 juta pertama dibebaskan untuk wajib pajak orang pribadi.
 * Ini realitas pajak pasar sasaran — bukan PPN dan SPT badan.
 */
export const TARIF_PPH_FINAL = 0.005;
export const BEBAS_OMZET_OP = 500_000_000;
export const BATAS_PKP = 4_800_000_000;

export function pphFinal(omzetKumulatif: number, omzetBulan: number, orangPribadi = true) {
  const bebasTersisa = orangPribadi ? Math.max(0, BEBAS_OMZET_OP - (omzetKumulatif - omzetBulan)) : 0;
  const kenaPajak = Math.max(0, omzetBulan - bebasTersisa);
  return {
    omzetBulan,
    omzetKumulatif,
    bebasDipakai: Math.min(bebasTersisa, omzetBulan),
    kenaPajak,
    pajak: Math.round(kenaPajak * TARIF_PPH_FINAL),
    wajibPkp: omzetKumulatif > BATAS_PKP,
    sisaAmbangPkp: Math.max(0, BATAS_PKP - omzetKumulatif),
  };
}

/** PPh 21 sangat sederhana untuk pegawai tetap bergaji di bawah PTKP. */
export const PTKP_TK0_BULAN = 4_500_000;

export function pph21Bulanan(gajiBruto: number, ptkpBulan = PTKP_TK0_BULAN) {
  const biayaJabatan = Math.min(gajiBruto * 0.05, 500_000);
  const neto = Math.max(0, gajiBruto - biayaJabatan);
  const kena = Math.max(0, neto - ptkpBulan);
  // Lapis pertama 5% cukup untuk rentang gaji pasar sasaran.
  return { biayaJabatan, neto, kena, pajak: Math.round(kena * 0.05) };
}

// ─── format ───────────────────────────────────────────────────────────────────

export const rupiah = (n: number, ringkas = false) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    notation: ringkas ? 'compact' : 'standard',
  }).format(n);

export const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export const persen = (n: number) => `${(n * 100).toFixed(1)}%`;
