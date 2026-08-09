/**
 * Model dapur.
 *
 * Satu hal yang membedakan aplikasi ini dari sekadar layar antrean: dapur
 * adalah pemilik sah dari jawaban "menu ini masih ada atau tidak". Kasir dan
 * pramusaji hanya membacanya. Karena itu daftar 86 (menu habis) ada di sini,
 * dan perubahannya mendorong ke POS — bukan sebaliknya.
 */

export type Stasiun = 'PANAS' | 'DINGIN' | 'BAR' | 'DESSERT';
export type StatusTiket = 'BARU' | 'DIMASAK' | 'SIAP' | 'DIANTAR';

export const STASIUN_LABEL: Record<Stasiun, string> = {
  PANAS: 'Dapur Panas', DINGIN: 'Dapur Dingin', BAR: 'Bar', DESSERT: 'Dessert',
};

export interface ItemTiket {
  /** Diisi server; data contoh boleh tanpa id. */
  id?: string;
  nama: string;
  qty: number;
  stasiun: Stasiun;
  catatan?: string;
  siap?: boolean;
}

export interface Tiket {
  id: string;
  nomor: string;
  jenis: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  meja?: string;
  masukPada: string;      // ISO
  status: StatusTiket;
  pramusaji?: string;
  items: ItemTiket[];
  /** Menit yang dijanjikan ke tamu; dipakai untuk warna keterlambatan. */
  targetMenit: number;
}

export interface MenuDapur {
  kode: string;
  nama: string;
  kategori: string;
  stasiun: Stasiun;
  tersedia: boolean;
  /** Alasan wajib saat menu dimatikan — kasir perlu tahu apa yang harus dibilang. */
  alasan?: string;
  /** Perkiraan porsi tersisa dari stok bahan; 0 berarti habis. */
  sisaPorsi: number;
  waktuMasakMenit: number;
}

export interface TugasPrep {
  id: string;
  nama: string;
  hasil: string;
  target: number;
  selesai: number;
  satuan: string;
  penanggungJawab: string;
  status: 'BELUM' | 'JALAN' | 'SELESAI';
  batasJam: string;
}

export interface BahanDapur {
  kode: string;
  nama: string;
  satuan: string;
  stok: number;
  minimum: number;
  kedaluwarsa?: string;
  lokasi: string;
}

export interface Waste {
  id: string;
  waktu: string;
  bahan: string;
  qty: number;
  satuan: string;
  nilai: number;
  sebab: 'KEDALUWARSA' | 'RUSAK' | 'SALAH_MASAK' | 'SISA_TAMU' | 'TUMPAH';
  oleh: string;
}

// ─── data contoh ──────────────────────────────────────────────────────────────

const menitLalu = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export const TIKET: Tiket[] = [
  {
    id: 'T-1', nomor: 'POS-0087', jenis: 'DINE_IN', meja: 'A5', masukPada: menitLalu(14),
    status: 'DIMASAK', pramusaji: 'Sari', targetMenit: 15,
    items: [
      { nama: 'Nasi Goreng Spesial', qty: 2, stasiun: 'PANAS', catatan: 'satu tidak pedas', siap: true },
      { nama: 'Ayam Bakar Madu', qty: 1, stasiun: 'PANAS' },
      { nama: 'Es Teh Manis', qty: 3, stasiun: 'BAR', siap: true },
    ],
  },
  {
    id: 'T-2', nomor: 'POS-0088', jenis: 'DINE_IN', meja: 'B2', masukPada: menitLalu(6),
    status: 'BARU', pramusaji: 'Andi', targetMenit: 15,
    items: [
      { nama: 'Soto Ayam Kampung', qty: 2, stasiun: 'PANAS' },
      { nama: 'Es Jeruk Peras', qty: 2, stasiun: 'BAR' },
      { nama: 'Kerupuk Udang', qty: 1, stasiun: 'DINGIN' },
    ],
  },
  {
    id: 'T-3', nomor: 'POS-0089', jenis: 'TAKEAWAY', masukPada: menitLalu(22),
    status: 'DIMASAK', targetMenit: 12,
    items: [
      { nama: 'Mie Goreng Jawa', qty: 3, stasiun: 'PANAS', catatan: 'tanpa sawi' },
      { nama: 'Pisang Goreng Keju', qty: 2, stasiun: 'DESSERT' },
    ],
  },
  {
    id: 'T-4', nomor: 'POS-0090', jenis: 'DELIVERY', masukPada: menitLalu(3),
    status: 'BARU', targetMenit: 18,
    items: [
      { nama: 'Gurame Bakar', qty: 1, stasiun: 'PANAS' },
      { nama: 'Capcay Seafood', qty: 1, stasiun: 'PANAS' },
      { nama: 'Es Kopi Susu', qty: 2, stasiun: 'BAR' },
    ],
  },
  {
    id: 'T-5', nomor: 'POS-0086', jenis: 'DINE_IN', meja: 'C1', masukPada: menitLalu(19),
    status: 'SIAP', pramusaji: 'Sari', targetMenit: 15,
    items: [
      { nama: 'Sate Ayam (10 tusuk)', qty: 2, stasiun: 'PANAS', siap: true },
      { nama: 'Nasi Putih', qty: 2, stasiun: 'PANAS', siap: true },
    ],
  },
];

export const MENU: MenuDapur[] = [
  { kode: 'MENU-NASI', nama: 'Nasi Goreng Spesial', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 34, waktuMasakMenit: 8 },
  { kode: 'MENU-AYAM', nama: 'Ayam Bakar Madu', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 12, waktuMasakMenit: 14 },
  { kode: 'MENU-GURAME', nama: 'Gurame Bakar', kategori: 'Makanan', stasiun: 'PANAS', tersedia: false, alasan: 'Ikan segar belum datang', sisaPorsi: 0, waktuMasakMenit: 20 },
  { kode: 'MENU-SOTO', nama: 'Soto Ayam Kampung', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 21, waktuMasakMenit: 6 },
  { kode: 'MENU-SATE', nama: 'Sate Ayam (10 tusuk)', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 8, waktuMasakMenit: 12 },
  { kode: 'MENU-CAPCAY', nama: 'Capcay Seafood', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 6, waktuMasakMenit: 10 },
  { kode: 'MENU-MIEGOR', nama: 'Mie Goreng Jawa', kategori: 'Makanan', stasiun: 'PANAS', tersedia: true, sisaPorsi: 27, waktuMasakMenit: 8 },
  { kode: 'MENU-ESTEH', nama: 'Es Teh Manis', kategori: 'Minuman', stasiun: 'BAR', tersedia: true, sisaPorsi: 120, waktuMasakMenit: 2 },
  { kode: 'MENU-ESJERUK', nama: 'Es Jeruk Peras', kategori: 'Minuman', stasiun: 'BAR', tersedia: true, sisaPorsi: 40, waktuMasakMenit: 3 },
  { kode: 'MENU-LATTE', nama: 'Es Kopi Susu', kategori: 'Minuman', stasiun: 'BAR', tersedia: true, sisaPorsi: 55, waktuMasakMenit: 4 },
  { kode: 'MENU-JUS-ALP', nama: 'Jus Alpukat', kategori: 'Minuman', stasiun: 'BAR', tersedia: false, alasan: 'Alpukat belum matang', sisaPorsi: 0, waktuMasakMenit: 5 },
  { kode: 'MENU-PISANG', nama: 'Pisang Goreng Keju', kategori: 'Dessert', stasiun: 'DESSERT', tersedia: true, sisaPorsi: 18, waktuMasakMenit: 7 },
  { kode: 'MENU-PUDING', nama: 'Puding Coklat', kategori: 'Dessert', stasiun: 'DESSERT', tersedia: true, sisaPorsi: 9, waktuMasakMenit: 1 },
  { kode: 'MENU-KERUPUK', nama: 'Kerupuk Udang', kategori: 'Tambahan', stasiun: 'DINGIN', tersedia: true, sisaPorsi: 60, waktuMasakMenit: 1 },
];

export const PREP: TugasPrep[] = [
  { id: 'P-1', nama: 'Bumbu Dasar Merah', hasil: 'Untuk nasi goreng & ayam bakar', target: 5, selesai: 5, satuan: 'kg', penanggungJawab: 'Bagas', status: 'SELESAI', batasJam: '08:00' },
  { id: 'P-2', nama: 'Kaldu Ayam', hasil: 'Untuk soto & capcay', target: 20, selesai: 12, satuan: 'liter', penanggungJawab: 'Bagas', status: 'JALAN', batasJam: '09:00' },
  { id: 'P-3', nama: 'Sambal Terasi', hasil: 'Pendamping semua menu', target: 3, selesai: 0, satuan: 'kg', penanggungJawab: 'Wati', status: 'BELUM', batasJam: '10:00' },
  { id: 'P-4', nama: 'Potong Sayur', hasil: 'Capcay & mie goreng', target: 8, selesai: 8, satuan: 'kg', penanggungJawab: 'Wati', status: 'SELESAI', batasJam: '08:30' },
  { id: 'P-5', nama: 'Marinasi Ayam', hasil: 'Ayam bakar madu', target: 15, selesai: 4, satuan: 'kg', penanggungJawab: 'Bagas', status: 'JALAN', batasJam: '10:00' },
];

export const BAHAN: BahanDapur[] = [
  { kode: 'B-BERAS', nama: 'Beras Premium', satuan: 'kg', stok: 84, minimum: 40, lokasi: 'Gudang kering' },
  { kode: 'B-AYAM', nama: 'Ayam Broiler Segar', satuan: 'kg', stok: 8, minimum: 15, kedaluwarsa: '2026-08-08', lokasi: 'Chiller 1' },
  { kode: 'B-CABE', nama: 'Cabai Merah Keriting', satuan: 'kg', stok: 0, minimum: 5, lokasi: 'Chiller 2' },
  { kode: 'B-GURAME', nama: 'Gurame Segar', satuan: 'ekor', stok: 0, minimum: 6, lokasi: 'Chiller 1' },
  { kode: 'B-ALPUKAT', nama: 'Alpukat', satuan: 'kg', stok: 4, minimum: 3, kedaluwarsa: '2026-08-09', lokasi: 'Chiller 2' },
  { kode: 'B-MINYAK', nama: 'Minyak Goreng', satuan: 'liter', stok: 32, minimum: 20, lokasi: 'Gudang kering' },
  { kode: 'B-BUMBU', nama: 'Bumbu Dasar Merah (jadi)', satuan: 'kg', stok: 5, minimum: 2, kedaluwarsa: '2026-08-09', lokasi: 'Chiller 2' },
  { kode: 'B-KALDU', nama: 'Kaldu Ayam (jadi)', satuan: 'liter', stok: 12, minimum: 8, kedaluwarsa: '2026-08-08', lokasi: 'Chiller 1' },
];

export const WASTE: Waste[] = [
  { id: 'W-1', waktu: menitLalu(90), bahan: 'Sayur sawi', qty: 1.2, satuan: 'kg', nilai: 18_000, sebab: 'KEDALUWARSA', oleh: 'Wati' },
  { id: 'W-2', waktu: menitLalu(180), bahan: 'Nasi goreng', qty: 2, satuan: 'porsi', nilai: 34_800, sebab: 'SALAH_MASAK', oleh: 'Bagas' },
  { id: 'W-3', waktu: menitLalu(320), bahan: 'Susu UHT', qty: 0.5, satuan: 'liter', nilai: 9_000, sebab: 'TUMPAH', oleh: 'Rina' },
];

// ─── turunan ──────────────────────────────────────────────────────────────────

export const umurMenit = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

/** Merah bukan sekadar hiasan: itu janji ke tamu yang sudah lewat. */
export function urgensi(t: Tiket): 'aman' | 'dekat' | 'lewat' {
  const u = umurMenit(t.masukPada);
  if (u >= t.targetMenit) return 'lewat';
  if (u >= t.targetMenit * 0.7) return 'dekat';
  return 'aman';
}

export const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

export const jam = (iso: string) =>
  new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
