import {
  ACARA, KINERJA_MENU, MEJA, RESERVASI,
  type Acara, type KinerjaMenu, type Meja, type Reservasi,
} from './data';
import { keluar, sesi } from './auth';

/**
 * Sambungan manajemen ruang ke server.
 *
 * Layar tetap hidup saat server mati — outlet tidak boleh berhenti menerima
 * tamu hanya karena jaringan. Tapi statusnya ditampilkan jujur, dan data contoh
 * tidak pernah menyamar sebagai data nyata.
 */

const BASE = '/api';
const SITE = 'RESTO-01';
const TIMEOUT_MS = 4000;

export interface Koneksi {
  online: boolean;
  terakhir: string | null;
  /** Sirkuit terbuka: server dianggap mati, permintaan tidak dikirim sama sekali. */
  sirkuitTerbuka: boolean;
  /** Sesi ditolak server. Layar harus meminta masuk ulang, bukan diam. */
  perluMasuk: boolean;
}

let koneksi: Koneksi = { online: false, terakhir: null, sirkuitTerbuka: false, perluMasuk: false };
const pendengar = new Set<(k: Koneksi) => void>();

export const langgananKoneksi = (fn: (k: Koneksi) => void) => {
  pendengar.add(fn);
  fn(koneksi);
  return () => pendengar.delete(fn);
};

const umumkan = () => pendengar.forEach((f) => f(koneksi));

// ─── circuit breaker ──────────────────────────────────────────────────────────

/**
 * Tanpa ini, server yang mati justru dihukum paling berat: empat layar
 * memuat ulang tiap beberapa detik, masing-masing menunggu habis 4 detik, dan
 * antrean permintaan menumpuk lebih cepat daripada yang bisa gagal. Layar ikut
 * membeku padahal data contoh sudah tersedia seketika.
 *
 * Setelah GAGAL_BERUNTUN kegagalan, sirkuit dibuka: permintaan berikutnya
 * langsung menyerah tanpa menyentuh jaringan. Sesudah PENDINGINAN, satu
 * permintaan percobaan diizinkan lewat — berhasil, sirkuit menutup lagi.
 */
const GAGAL_BERUNTUN = 3;
const PENDINGINAN_MS = 15_000;

let gagalBeruntun = 0;
let bukaSampai = 0;

const sirkuitTerbuka = () => Date.now() < bukaSampai;

function catatGagal(): void {
  gagalBeruntun += 1;
  if (gagalBeruntun >= GAGAL_BERUNTUN) bukaSampai = Date.now() + PENDINGINAN_MS;
  koneksi = { ...koneksi, online: false, sirkuitTerbuka: sirkuitTerbuka() };
  umumkan();
}

function catatBerhasil(): void {
  gagalBeruntun = 0;
  bukaSampai = 0;
  koneksi = { online: true, terakhir: new Date().toISOString(), sirkuitTerbuka: false, perluMasuk: false };
  umumkan();
}

/**
 * Sesi ditolak. Ini BUKAN kegagalan jaringan: membuka sirkuit di sini hanya
 * akan menyembunyikan penyebabnya selama lima belas detik. Token dibuang dan
 * layar diminta menampilkan halaman masuk.
 */
function catatPerluMasuk(): void {
  keluar();
  koneksi = { ...koneksi, online: true, perluMasuk: true };
  umumkan();
}

async function panggil<T>(jalur: string, init?: RequestInit): Promise<T | null> {
  // Sirkuit terbuka: gagal seketika. Satu permintaan percobaan diizinkan lewat
  // tepat setelah pendinginan habis, dan itu ditangani oleh perbandingan waktu.
  if (sirkuitTerbuka()) return null;

  const s = sesi();
  if (!s) { koneksi = { ...koneksi, perluMasuk: true }; umumkan(); return null; }

  try {
    const res = await fetch(`${BASE}${jalur}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-tenant': 'horison-emerald',
        authorization: `Bearer ${s.token}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401) { catatPerluMasuk(); return null; }
    if (!res.ok) throw new Error(String(res.status));
    catatBerhasil();
    return await res.json() as T;
  } catch {
    catatGagal();
    return null;
  }
}

/** Menulis harus melapor gagal, bukan diam-diam jatuh ke data contoh. */
async function kirim<T>(jalur: string, body: unknown): Promise<T> {
  const hasil = await panggil<T>(jalur, { method: 'POST', body: JSON.stringify(body) });
  if (hasil === null) {
    if (koneksi.perluMasuk) throw new Error('Sesi berakhir. Masuk kembali untuk menyimpan perubahan.');
    throw new Error(sirkuitTerbuka()
      ? 'Server sedang tidak dapat dihubungi. Coba lagi sebentar.'
      : 'Perubahan gagal dikirim ke server.');
  }
  return hasil;
}

// ─── meja ─────────────────────────────────────────────────────────────────────

export const ambilMeja = async (): Promise<Meja[]> => {
  const data = await panggil<Array<{
    kode: string; area: string; kursi: number; status: string;
    dudukSejak?: number; tamu?: number; pramusaji?: string;
  }>>(`/manage/tables?siteCode=${SITE}`);
  if (!data) return MEJA;
  return data.map((m) => ({
    kode: m.kode, area: m.area as Meja['area'], kursi: m.kursi,
    status: m.status as Meja['status'],
    dudukSejak: m.dudukSejak, tamu: m.tamu, pramusaji: m.pramusaji,
  }));
};

export const ubahStatusMeja = (kode: string, status: Meja['status'], tamu?: number, pramusaji?: string) =>
  kirim<{ kode: string; status: string }>(`/manage/tables/${kode}/status`, { status, tamu, pramusaji });

// ─── reservasi ────────────────────────────────────────────────────────────────

export const ambilReservasi = async (): Promise<Reservasi[]> =>
  (await panggil<Reservasi[]>(`/manage/reservations?siteCode=${SITE}`)) ?? RESERVASI;

export const buatReservasi = (r: {
  nama: string; telepon: string; waktuIso: string; pax: number;
  meja?: string; sumber: Reservasi['sumber']; catatan?: string;
}) => kirim<Reservasi>('/manage/reservations', {
  siteCode: SITE, guestName: r.nama, phone: r.telepon, bookedFor: r.waktuIso,
  pax: r.pax, tableCode: r.meja, source: r.sumber, note: r.catatan,
});

export const ubahStatusReservasi = (id: string, status: Reservasi['status']) =>
  kirim<Reservasi>(`/manage/reservations/${id}/status`, { status });

// ─── acara ────────────────────────────────────────────────────────────────────

export const ambilAcara = async (): Promise<Acara[]> =>
  (await panggil<Acara[]>(`/manage/events?siteCode=${SITE}`)) ?? ACARA;

export const ubahStatusAcara = (id: string, status: Acara['status']) =>
  kirim<Acara>(`/manage/events/${id}/status`, { status });

// ─── menu engineering ─────────────────────────────────────────────────────────

/**
 * Dihitung server dari PosOrderLine sungguhan. Kalau server tak terjangkau,
 * data contoh dipakai — dan `nyata` memberitahu layar untuk mengatakannya.
 */
export const ambilKinerjaMenu = async (hari = 30): Promise<{ data: KinerjaMenu[]; nyata: boolean }> => {
  const data = await panggil<KinerjaMenu[]>(`/manage/menu-performance?siteCode=${SITE}&hari=${hari}`);
  return data ? { data, nyata: true } : { data: KINERJA_MENU, nyata: false };
};
