/**
 * Sambungan aplikasi karyawan.
 *
 * Prinsipnya sama dengan kasir: apa pun yang diketuk karyawan tersimpan lebih
 * dulu di HP, lalu dikirim. Sinyal di dapur dan gudang sering hilang, dan absen
 * yang gagal terkirim berarti hari kerja yang hilang — itu masalah upah, bukan
 * masalah teknis.
 */

const BASE = '/api';

export interface Profil {
  employeeNo: string;
  nama: string;
  posisi: string | null;
  departemen: string | null;
  outlet: { kode: string; nama: string } | null;
  bergabung: string;
  status: string;
  kontrak: { jenis: string; mulai: string; berakhir: string | null; gajiPokok: number; sisaHari: number | null } | null;
}

export interface BarisAbsen {
  id: string; tanggal: string; masuk: string; keluar: string | null;
  terlambatMenit: number; lemburMenit: number;
  jarakM: number | null; ditandai: boolean; alasan: string | null;
}

export interface Absensi {
  hariHadir: number; totalTerlambatMenit: number; totalLemburMenit: number;
  ditandai: number; riwayat: BarisAbsen[];
}

export interface Shift {
  id: string; tanggal: string; mulai: string; selesai: string;
  outlet: string; peran: string | null; terbit: boolean;
}

export interface SaldoCuti {
  kode: string; nama: string; kuota: number; terpakai: number; sisa: number; dibayar: boolean;
}

export interface Cuti {
  id: string; jenis: string; mulai: string; selesai: string;
  hari: number; alasan: string | null; status: string; diputusPada: string | null;
}

export interface Slip {
  id: string; nomorRun: string; dibayarPada: string | null;
  bruto: number; neto: number; potongan: number; dikoreksi: boolean;
}

/** Absen yang belum terkirim. Disimpan di HP sampai server mengonfirmasi. */
export interface AbsenTertunda {
  jenis: 'MASUK' | 'KELUAR';
  pada: string;
  siteCode: string;
  lat?: number;
  lng?: number;
}

const KEY = { antre: 'ess.antre', outlet: 'ess.outlet' } as const;

export const antrean = (): AbsenTertunda[] => {
  try { return JSON.parse(localStorage.getItem(KEY.antre) ?? '[]'); } catch { return []; }
};
const simpanAntrean = (a: AbsenTertunda[]) => localStorage.setItem(KEY.antre, JSON.stringify(a));
export const outletSaya = () => localStorage.getItem(KEY.outlet) ?? 'RESTO-01';

export let online = true;

async function panggil<T>(jalur: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${jalur}`, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-tenant': 'horison-emerald', ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(5000),
    });
    online = true;
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    online = false;
    return null;
  }
}

export const ambilProfil = () => panggil<Profil>('/ess/me');
export const ambilAbsensi = () => panggil<Absensi>('/ess/attendance?hari=30');
export const ambilShift = () => panggil<Shift[]>('/ess/shifts?hari=14');
export const ambilSaldoCuti = () => panggil<SaldoCuti[]>('/ess/leave/balance');
export const ambilCuti = () => panggil<Cuti[]>('/ess/leave');
export const ambilSlip = () => panggil<Slip[]>('/ess/payslips');

export const ajukanCuti = (body: {
  leaveTypeCode: string; startsAt: string; endsAt: string; reason?: string;
}) => panggil<{ id: string; hari: number; band: string }>('/ess/leave', {
  method: 'POST', body: JSON.stringify(body),
});

/** Meminta lokasi. Ditolak pun absen tetap jalan — hanya ditandai server. */
export function lokasi(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
    );
  });
}

export interface HasilAbsen {
  terkirim: boolean;
  jarakM?: number | null;
  terlambatMenit?: number;
  ditandai?: boolean;
  alasan?: string | null;
  pesan?: string;
}

export async function absenMasuk(): Promise<HasilAbsen> {
  const pos = await lokasi();
  const body = { siteCode: outletSaya(), lat: pos?.lat, lng: pos?.lng };
  const hasil = await panggil<{ jarakM: number | null; terlambatMenit: number; ditandai: boolean; alasan: string | null }>(
    '/ess/clock-in', { method: 'POST', body: JSON.stringify(body) });

  if (hasil) return { terkirim: true, ...hasil };

  simpanAntrean([...antrean(), { jenis: 'MASUK', pada: new Date().toISOString(), ...body }]);
  return { terkirim: false, pesan: 'Tersimpan di HP. Akan terkirim saat sinyal kembali.' };
}

export async function absenKeluar(): Promise<HasilAbsen> {
  const hasil = await panggil<{ durasiMenit: number; lemburMenit: number }>(
    '/ess/clock-out', { method: 'POST' });
  if (hasil) return { terkirim: true, ...hasil };

  simpanAntrean([...antrean(), { jenis: 'KELUAR', pada: new Date().toISOString(), siteCode: outletSaya() }]);
  return { terkirim: false, pesan: 'Tersimpan di HP. Akan terkirim saat sinyal kembali.' };
}

/**
 * Mengirim ulang antrean. `offlineAt` membawa waktu asli, jadi jam absen yang
 * tercatat adalah saat karyawan benar-benar menekan tombol — bukan saat sinyal
 * kebetulan kembali. Servernya menandai baris itu supaya supervisor tahu.
 */
export async function kirimAntrean(): Promise<number> {
  const antre = antrean();
  if (antre.length === 0) return 0;
  const sisa: AbsenTertunda[] = [];

  for (const a of antre) {
    const ok = a.jenis === 'MASUK'
      ? await panggil('/ess/clock-in', {
          method: 'POST',
          body: JSON.stringify({ siteCode: a.siteCode, lat: a.lat, lng: a.lng, offlineAt: a.pada }),
        })
      : await panggil('/ess/clock-out', { method: 'POST' });
    if (!ok) sisa.push(a);
  }
  simpanAntrean(sisa);
  return antre.length - sisa.length;
}
