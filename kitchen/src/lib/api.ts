import { MENU, TIKET, type MenuDapur, type Tiket } from './data';
import { sesi } from './auth';

/**
 * Sambungan dapur ke server.
 *
 * Kalau server mati, layar tetap hidup dengan data contoh — dapur tidak boleh
 * berhenti hanya karena jaringan. Tapi statusnya ditampilkan jujur di header,
 * supaya tidak ada yang mengira daftar 86 sudah sampai ke kasir padahal belum.
 */

const BASE = '/api';
const SITE = 'RESTO-01';

export interface Koneksi { online: boolean; terakhir: string | null }

let koneksi: Koneksi = { online: false, terakhir: null };
const pendengar = new Set<(k: Koneksi) => void>();

export const langgananKoneksi = (fn: (k: Koneksi) => void) => {
  pendengar.add(fn);
  fn(koneksi);
  return () => pendengar.delete(fn);
};

const set = (online: boolean) => {
  koneksi = { online, terakhir: online ? new Date().toISOString() : koneksi.terakhir };
  pendengar.forEach((f) => f(koneksi));
};

async function panggil<T>(jalur: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${jalur}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        'x-tenant': 'horison-emerald',
        authorization: `Bearer ${sesi()?.token ?? ''}`,
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(String(res.status));
    set(true);
    return await res.json() as T;
  } catch {
    set(false);
    return null;
  }
}

export const ambilTiket = async (): Promise<Tiket[]> =>
  (await panggil<Tiket[]>(`/kitchen/tickets?siteCode=${SITE}`)) ?? TIKET;

export const ambilMenu = async (): Promise<MenuDapur[]> => {
  const data = await panggil<Array<{
    kode: string; nama: string; kategori: string; tersedia: boolean;
    alasan: string | null; stasiun: string; waktuMasakMenit: number;
  }>>('/kitchen/menu');
  if (!data) return MENU;
  return data.map((m) => ({
    kode: m.kode, nama: m.nama, kategori: m.kategori,
    stasiun: m.stasiun as MenuDapur['stasiun'],
    tersedia: m.tersedia, alasan: m.alasan ?? undefined,
    sisaPorsi: m.tersedia ? 20 : 0, waktuMasakMenit: m.waktuMasakMenit,
  }));
};

/** Mendorong daftar 86 ke server; kasir membacanya saat menyegarkan katalog. */
export const ubahKetersediaan = (productCode: string, available: boolean, reason?: string) =>
  panggil<{ productCode: string; available: boolean }>('/kitchen/menu/availability', {
    method: 'POST', body: JSON.stringify({ productCode, available, reason }),
  });

export const tandaiBaris = (lineId: string, ready: boolean) =>
  panggil<{ ticketStatus: string }>('/kitchen/lines/ready', {
    method: 'POST', body: JSON.stringify({ lineId, ready }),
  });

export const majukanTiket = (orderId: string, to: 'SIAP' | 'DIANTAR') =>
  panggil<{ status: string }>('/kitchen/tickets/bump', {
    method: 'POST', body: JSON.stringify({ orderId, to }),
  });
