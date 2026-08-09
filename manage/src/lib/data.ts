/**
 * Model manajemen outlet — sisi depan restoran.
 *
 * Pertanyaan yang dijawab aplikasi ini berbeda dari kasir dan dapur:
 * berapa kursi yang masih bisa dijual malam ini, siapa yang sudah pesan tempat,
 * acara apa yang mengunci ruangan, dan menu mana yang sebenarnya menghidupi
 * outlet ini.
 */

export type StatusMeja = 'KOSONG' | 'TERISI' | 'DIPESAN' | 'PERLU_BERSIH' | 'DIGABUNG';
export type StatusReservasi = 'DIKONFIRMASI' | 'MENUNGGU' | 'DATANG' | 'TIDAK_DATANG' | 'BATAL';

export interface Meja {
  kode: string;
  area: 'Indoor' | 'Teras' | 'VIP' | 'Rooftop';
  kursi: number;
  status: StatusMeja;
  /** Menit sejak tamu duduk — dipakai menghitung perputaran meja. */
  dudukSejak?: number;
  tamu?: number;
  pramusaji?: string;
  reservasiId?: string;
}

export interface Reservasi {
  id: string;
  nama: string;
  telepon: string;
  waktu: string;        // HH:mm
  tanggal: string;      // ISO date
  pax: number;
  meja?: string;
  status: StatusReservasi;
  catatan?: string;
  sumber: 'TELEPON' | 'WALK_IN' | 'WHATSAPP' | 'ONLINE';
  /** Tamu yang sudah pernah datang; dipakai untuk prioritas dan sapaan. */
  kunjunganKe: number;
}

export interface Acara {
  id: string;
  nama: string;
  tanggal: string;
  mulai: string;
  selesai: string;
  area: string;
  pax: number;
  jenis: 'PRIVATE_DINING' | 'MUSIK' | 'GATHERING' | 'ULANG_TAHUN' | 'MEETING';
  nilai: number;
  status: 'TENTATIF' | 'PASTI' | 'SELESAI' | 'BATAL';
  penanggungJawab: string;
  catatan?: string;
}

export interface KinerjaMenu {
  kode: string;
  nama: string;
  kategori: string;
  terjual: number;
  harga: number;
  hpp: number;
}

// ─── data contoh ──────────────────────────────────────────────────────────────

export const MEJA: Meja[] = [
  { kode: 'A1', area: 'Indoor', kursi: 2, status: 'TERISI', dudukSejak: 42, tamu: 2, pramusaji: 'Sari' },
  { kode: 'A2', area: 'Indoor', kursi: 2, status: 'KOSONG' },
  { kode: 'A3', area: 'Indoor', kursi: 4, status: 'PERLU_BERSIH' },
  { kode: 'A4', area: 'Indoor', kursi: 4, status: 'TERISI', dudukSejak: 88, tamu: 3, pramusaji: 'Andi' },
  { kode: 'A5', area: 'Indoor', kursi: 4, status: 'TERISI', dudukSejak: 14, tamu: 4, pramusaji: 'Sari' },
  { kode: 'A6', area: 'Indoor', kursi: 6, status: 'DIPESAN', reservasiId: 'R-2' },
  { kode: 'B1', area: 'Teras', kursi: 4, status: 'KOSONG' },
  { kode: 'B2', area: 'Teras', kursi: 4, status: 'TERISI', dudukSejak: 31, tamu: 4, pramusaji: 'Andi' },
  { kode: 'B3', area: 'Teras', kursi: 2, status: 'KOSONG' },
  { kode: 'B4', area: 'Teras', kursi: 6, status: 'DIPESAN', reservasiId: 'R-1' },
  { kode: 'C1', area: 'VIP', kursi: 8, status: 'TERISI', dudukSejak: 65, tamu: 7, pramusaji: 'Dewi' },
  { kode: 'C2', area: 'VIP', kursi: 10, status: 'DIPESAN', reservasiId: 'R-4' },
  { kode: 'D1', area: 'Rooftop', kursi: 4, status: 'KOSONG' },
  { kode: 'D2', area: 'Rooftop', kursi: 4, status: 'KOSONG' },
  { kode: 'D3', area: 'Rooftop', kursi: 8, status: 'DIGABUNG' },
];

export const RESERVASI: Reservasi[] = [
  { id: 'R-1', nama: 'Bapak Hendra', telepon: '0812-3344-5566', waktu: '18:30', tanggal: '2026-08-07', pax: 6, meja: 'B4', status: 'DIKONFIRMASI', sumber: 'WHATSAPP', kunjunganKe: 4, catatan: 'Ulang tahun istri, minta kue' },
  { id: 'R-2', nama: 'Ibu Maya', telepon: '0857-1122-3344', waktu: '19:00', tanggal: '2026-08-07', pax: 5, meja: 'A6', status: 'DIKONFIRMASI', sumber: 'TELEPON', kunjunganKe: 1 },
  { id: 'R-3', nama: 'PT Sinar Kreatif', telepon: '0274-556677', waktu: '12:00', tanggal: '2026-08-08', pax: 12, status: 'MENUNGGU', sumber: 'ONLINE', kunjunganKe: 2, catatan: 'Butuh proyektor' },
  { id: 'R-4', nama: 'Keluarga Wijaya', telepon: '0813-9988-7766', waktu: '19:30', tanggal: '2026-08-07', pax: 9, meja: 'C2', status: 'DIKONFIRMASI', sumber: 'WHATSAPP', kunjunganKe: 7, catatan: 'Pelanggan tetap, alergi udang' },
  { id: 'R-5', nama: 'Bapak Surya', telepon: '0852-4433-2211', waktu: '20:00', tanggal: '2026-08-07', pax: 2, status: 'MENUNGGU', sumber: 'TELEPON', kunjunganKe: 1 },
  { id: 'R-6', nama: 'Ibu Ratna', telepon: '0811-2233-4455', waktu: '18:00', tanggal: '2026-08-06', pax: 4, meja: 'A4', status: 'TIDAK_DATANG', sumber: 'ONLINE', kunjunganKe: 1 },
];

export const ACARA: Acara[] = [
  { id: 'E-1', nama: 'Private dining PT Sinar Kreatif', tanggal: '2026-08-08', mulai: '12:00', selesai: '15:00', area: 'VIP', pax: 12, jenis: 'PRIVATE_DINING', nilai: 8_400_000, status: 'PASTI', penanggungJawab: 'Dewi', catatan: 'Menu set, butuh proyektor' },
  { id: 'E-2', nama: 'Live akustik Sabtu', tanggal: '2026-08-08', mulai: '19:00', selesai: '22:00', area: 'Rooftop', pax: 40, jenis: 'MUSIK', nilai: 0, status: 'PASTI', penanggungJawab: 'Andi', catatan: 'Duo akustik, honor Rp 800 rb' },
  { id: 'E-3', nama: 'Ulang tahun ke-7 Alya', tanggal: '2026-08-09', mulai: '16:00', selesai: '19:00', area: 'Teras', pax: 25, jenis: 'ULANG_TAHUN', nilai: 5_600_000, status: 'TENTATIF', penanggungJawab: 'Sari', catatan: 'Menunggu DP' },
  { id: 'E-4', nama: 'Gathering alumni SMA 3', tanggal: '2026-08-15', mulai: '18:00', selesai: '22:00', area: 'Rooftop', pax: 60, jenis: 'GATHERING', nilai: 18_000_000, status: 'TENTATIF', penanggungJawab: 'Dewi', catatan: 'Tutup rooftop untuk umum' },
  { id: 'E-5', nama: 'Meeting bulanan Koperasi', tanggal: '2026-08-06', mulai: '09:00', selesai: '12:00', area: 'VIP', pax: 10, jenis: 'MEETING', nilai: 2_100_000, status: 'SELESAI', penanggungJawab: 'Dewi' },
];

export const KINERJA_MENU: KinerjaMenu[] = [
  { kode: 'MENU-NASI', nama: 'Nasi Goreng Spesial', kategori: 'Makanan', terjual: 1_284, harga: 45_000, hpp: 17_400 },
  { kode: 'MENU-AYAM', nama: 'Ayam Bakar Madu', kategori: 'Makanan', terjual: 812, harga: 65_000, hpp: 26_100 },
  { kode: 'MENU-SATE', nama: 'Sate Ayam (10 tusuk)', kategori: 'Makanan', terjual: 466, harga: 45_000, hpp: 20_250 },
  { kode: 'MENU-GURAME', nama: 'Gurame Bakar', kategori: 'Makanan', terjual: 118, harga: 95_000, hpp: 48_500 },
  { kode: 'MENU-SOTO', nama: 'Soto Ayam Kampung', kategori: 'Makanan', terjual: 604, harga: 38_000, hpp: 15_600 },
  { kode: 'MENU-CAPCAY', nama: 'Capcay Seafood', kategori: 'Makanan', terjual: 174, harga: 52_000, hpp: 27_500 },
  { kode: 'MENU-MIEGOR', nama: 'Mie Goreng Jawa', kategori: 'Makanan', terjual: 388, harga: 36_000, hpp: 13_100 },
  { kode: 'MENU-ESTEH', nama: 'Es Teh Manis', kategori: 'Minuman', terjual: 2_140, harga: 8_000, hpp: 2_100 },
  { kode: 'MENU-LATTE', nama: 'Es Kopi Susu', kategori: 'Minuman', terjual: 906, harga: 25_000, hpp: 8_400 },
  { kode: 'MENU-JUS-ALP', nama: 'Jus Alpukat', kategori: 'Minuman', terjual: 212, harga: 28_000, hpp: 13_900 },
  { kode: 'MENU-PISANG', nama: 'Pisang Goreng Keju', kategori: 'Dessert', terjual: 344, harga: 28_000, hpp: 9_200 },
  { kode: 'MENU-PUDING', nama: 'Puding Coklat', kategori: 'Dessert', terjual: 96, harga: 22_000, hpp: 11_800 },
];

// ─── menu engineering ─────────────────────────────────────────────────────────

/**
 * BELUM_CUKUP_DATA bukan kuadran kelima Kasavana-Smith, melainkan pengakuan
 * bahwa kuadran belum bisa dihitung. Tanpa penjualan, pangsa tidak terdefinisi,
 * dan matematika lama diam-diam menjatuhkan setiap menu ke 'ANJING' — layar
 * pertama yang dilihat outlet baru menyuruhnya menghapus seluruh menunya.
 */
export type KelasMenu = 'BINTANG' | 'KUDA_BEBAN' | 'TEKA_TEKI' | 'ANJING' | 'BELUM_CUKUP_DATA';

export const KELAS_LABEL: Record<KelasMenu, string> = {
  BINTANG: 'Bintang',
  KUDA_BEBAN: 'Kuda Beban',
  TEKA_TEKI: 'Teka-teki',
  ANJING: 'Anjing',
  BELUM_CUKUP_DATA: 'Belum cukup data',
};

export const KELAS_SARAN: Record<KelasMenu, string> = {
  BINTANG: 'Laris dan untung. Jaga mutunya, taruh di posisi paling terlihat, jangan diskon.',
  KUDA_BEBAN: 'Laris tapi tipis untungnya. Turunkan porsi bahan mahal atau naikkan harga sedikit.',
  TEKA_TEKI: 'Untung besar tapi jarang dipesan. Promosikan, ganti nama, atau tawarkan pramusaji.',
  ANJING: 'Jarang dipesan dan tipis untungnya. Pertimbangkan dihapus dari menu.',
  BELUM_CUKUP_DATA: 'Belum ada penjualan tercatat. Kelas menu muncul setelah kasir mulai mencatat pesanan.',
};

export interface MenuTerkelas extends KinerjaMenu {
  margin: number;
  kontribusi: number;
  pangsa: number;
  kelas: KelasMenu;
}

/**
 * Matriks menu engineering klasik: popularitas terhadap kontribusi margin.
 *
 * Ambang popularitas memakai 70% dari pangsa rata-rata — aturan lapangan yang
 * dipakai justru karena longgar: menu tidak dihukum hanya karena kategorinya
 * ramai. Ambang margin memakai rata-rata tertimbang, bukan rata-rata sederhana,
 * supaya menu bervolume besar tidak menyeret garisnya.
 */
export function klasifikasiMenu(data: KinerjaMenu[] = KINERJA_MENU): MenuTerkelas[] {
  const totalTerjual = data.reduce((s, m) => s + m.terjual, 0);
  const totalMargin = data.reduce((s, m) => s + (m.harga - m.hpp) * m.terjual, 0);
  // Outlet baru: nol penjualan, atau daftar menu masih kosong. Kedua pembagi di
  // bawah menjadi nol dan seluruh perbandingan berubah jadi NaN — yang selalu
  // false, jadi setiap menu terjatuh ke kuadran terburuk tanpa satu pun error.
  const adaSinyal = totalTerjual > 0 && data.length > 0;
  const marginRataTertimbang = adaSinyal ? totalMargin / totalTerjual : 0;
  const ambangPangsa = adaSinyal ? (1 / data.length) * 0.7 : 0;

  return data.map((m) => {
    const margin = m.harga - m.hpp;
    const pangsa = adaSinyal ? m.terjual / totalTerjual : 0;
    const populer = pangsa >= ambangPangsa;
    const untung = margin >= marginRataTertimbang;
    const kelas: KelasMenu = !adaSinyal ? 'BELUM_CUKUP_DATA'
      : populer && untung ? 'BINTANG'
      : populer && !untung ? 'KUDA_BEBAN'
      : !populer && untung ? 'TEKA_TEKI'
      : 'ANJING';
    return { ...m, margin, kontribusi: margin * m.terjual, pangsa, kelas };
  }).sort((a, b) => b.kontribusi - a.kontribusi);
}

export function ringkasMenu(data: KinerjaMenu[] = KINERJA_MENU) {
  const hasil = klasifikasiMenu(data);
  const totalMargin = hasil.reduce((s, m) => s + m.kontribusi, 0);
  const totalOmzet = hasil.reduce((s, m) => s + m.harga * m.terjual, 0);
  return {
    hasil, totalMargin, totalOmzet,
    marginRata: totalOmzet ? totalMargin / totalOmzet : 0,
    perKelas: (['BINTANG', 'KUDA_BEBAN', 'TEKA_TEKI', 'ANJING'] as KelasMenu[]).map((k) => ({
      kelas: k,
      menu: hasil.filter((m) => m.kelas === k),
      kontribusi: hasil.filter((m) => m.kelas === k).reduce((s, m) => s + m.kontribusi, 0),
    })),
  };
}

// ─── kapasitas ────────────────────────────────────────────────────────────────

export function kapasitas(meja: Meja[] = MEJA) {
  const total = meja.reduce((s, m) => s + m.kursi, 0);
  const terpakai = meja.filter((m) => m.status === 'TERISI').reduce((s, m) => s + (m.tamu ?? m.kursi), 0);
  const dipesan = meja.filter((m) => m.status === 'DIPESAN').reduce((s, m) => s + m.kursi, 0);
  const siapJual = meja.filter((m) => m.status === 'KOSONG').reduce((s, m) => s + m.kursi, 0);
  const duduk = meja.filter((m) => m.status === 'TERISI' && m.dudukSejak);
  return {
    total, terpakai, dipesan, siapJual,
    okupansi: total ? terpakai / total : 0,
    rataDuduk: duduk.length ? Math.round(duduk.reduce((s, m) => s + (m.dudukSejak ?? 0), 0) / duduk.length) : 0,
    perluBersih: meja.filter((m) => m.status === 'PERLU_BERSIH').length,
  };
}

export const rupiah = (n: number, ringkas = false) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
    notation: ringkas ? 'compact' : 'standard',
  }).format(n);

export const persen = (n: number) => `${(n * 100).toFixed(1)}%`;

export const tanggal = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
