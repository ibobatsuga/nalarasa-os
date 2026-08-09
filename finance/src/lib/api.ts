import {
  AKUN, SETORAN, TAGIHAN, TRANSAKSI,
  bukuBesar, labaRugi, posisiKas,
  type Akun, type SaldoAkun, type SetoranKas, type Tagihan, type Transaksi,
} from './data';
import { keluar, sesi } from './auth';

/**
 * Sambungan aplikasi keuangan ke buku besar.
 *
 * Laba rugi, buku besar, dan posisi kas TIDAK dihitung ulang di sini. Layar
 * memang punya fungsi murni untuk itu — dipakai sebagai data contoh saat luring
 * — tapi begitu server terjangkau, angkanya datang dari GL. Aplikasi keuangan
 * yang punya versi laba-ruginya sendiri adalah cara paling pasti menghasilkan
 * dua laporan resmi yang saling bertentangan, dan itu bukan bug yang ketahuan
 * cepat: ia ketahuan saat pemeriksaan pajak.
 */

const BASE = '/api';
const TIMEOUT_MS = 5000;

export interface Koneksi {
  online: boolean;
  terakhir: string | null;
  sirkuitTerbuka: boolean;
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
 * Laporan keuangan dimuat berbarengan oleh beberapa layar. Kalau server mati,
 * tiap layar menunggu habis lima detik dan antrean menumpuk lebih cepat
 * daripada yang bisa gagal. Setelah tiga kegagalan beruntun sirkuit dibuka:
 * permintaan berikutnya menyerah seketika tanpa menyentuh jaringan.
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

/** Sesi ditolak bukan kegagalan jaringan; membuka sirkuit hanya menyembunyikan sebabnya. */
function catatPerluMasuk(): void {
  keluar();
  koneksi = { ...koneksi, online: true, perluMasuk: true };
  umumkan();
}

async function panggil<T>(jalur: string): Promise<T | null> {
  if (sirkuitTerbuka()) return null;
  const s = sesi();
  if (!s) { koneksi = { ...koneksi, perluMasuk: true }; umumkan(); return null; }

  try {
    const res = await fetch(`${BASE}${jalur}`, {
      headers: {
        'content-type': 'application/json',
        'x-tenant': 'horison-emerald',
        authorization: `Bearer ${s.token}`,
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

// ─── bentuk yang dikirim server ───────────────────────────────────────────────

interface AkunServer { kode: string; nama: string; jenis: Akun['jenis']; kas: boolean }
interface BarisBuku { kode: string; nama: string; jenis: Akun['jenis']; debit: number; kredit: number; saldo: number }

const keAkun = (b: BarisBuku): Akun => ({ kode: b.kode, nama: b.nama, jenis: b.jenis, kas: /^1-11/.test(b.kode) });
const keSaldo = (b: BarisBuku): SaldoAkun => ({ akun: keAkun(b), debit: b.debit, kredit: b.kredit, saldo: b.saldo });

// ─── bacaan ───────────────────────────────────────────────────────────────────

export const ambilAkun = async (): Promise<Akun[]> => {
  const d = await panggil<AkunServer[]>('/finance/accounts');
  return d ? d.map((a) => ({ kode: a.kode, nama: a.nama, jenis: a.jenis, kas: a.kas })) : AKUN;
};

export const ambilTransaksi = async (): Promise<Transaksi[]> =>
  (await panggil<Transaksi[]>('/finance/transactions')) ?? TRANSAKSI;

export const ambilBukuBesar = async (): Promise<SaldoAkun[]> => {
  const d = await panggil<BarisBuku[]>('/finance/ledger');
  return d ? d.map(keSaldo) : bukuBesar();
};

/**
 * Laba rugi. Server mengirim total; rincian per akun dipetakan ke bentuk yang
 * sudah dipakai layar. HPP dikenali dari kode akun 5-1xxx, bukan dari namanya.
 */
export const ambilLabaRugi = async (): Promise<ReturnType<typeof labaRugi>> => {
  const d = await panggil<{
    pendapatan: number; beban: number; laba: number; margin: number;
    rincianPendapatan: BarisBuku[]; rincianBeban: BarisBuku[];
  }>('/finance/income-statement');
  if (!d) return labaRugi();

  const isHpp = (kode: string) => /^5-1/.test(kode);
  const hpp = d.rincianBeban.filter((b) => isHpp(b.kode)).reduce((s, b) => s + b.saldo, 0);
  const operasional = d.rincianBeban.filter((b) => !isHpp(b.kode)).reduce((s, b) => s + b.saldo, 0);

  return {
    pendapatan: d.rincianPendapatan.map(keSaldo),
    beban: d.rincianBeban.map(keSaldo),
    totalPendapatan: d.pendapatan,
    hpp, operasional,
    labaKotor: d.pendapatan - hpp,
    labaBersih: d.laba,
    marginKotor: d.pendapatan ? (d.pendapatan - hpp) / d.pendapatan : 0,
  };
};

export const ambilPosisiKas = async (): Promise<ReturnType<typeof posisiKas>> => {
  const d = await panggil<{ total: number; akun: BarisBuku[] }>('/finance/cash-position');
  return d ? d.akun.map((b) => ({ akun: keAkun(b), saldo: b.saldo })) : posisiKas();
};

export const ambilTagihan = async (): Promise<Tagihan[]> =>
  (await panggil<Tagihan[]>('/finance/payables')) ?? TAGIHAN;

export const ambilSetoran = async (): Promise<SetoranKas[]> =>
  (await panggil<SetoranKas[]>('/finance/cash-deposits?hari=30')) ?? SETORAN;
