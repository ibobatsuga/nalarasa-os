import type { Absensi, Cuti, Profil, SaldoCuti, Shift, Slip } from './api';

/**
 * Data contoh. Dipakai hanya kalau server tak terjangkau, supaya karyawan yang
 * membuka aplikasi di area tanpa sinyal tetap melihat bentuk layarnya —
 * dan status "offline" dinyatakan terang di header, bukan disamarkan.
 */

const hari = (geser: number) => {
  const d = new Date();
  d.setDate(d.getDate() + geser);
  return d.toISOString().slice(0, 10);
};
const jam = (geser: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + geser);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const PROFIL: Profil = {
  employeeNo: 'EMP-0012', nama: 'Tono Prasetyo', posisi: 'Kasir', departemen: 'Outlet',
  outlet: { kode: 'RESTO-01', nama: 'Main Restaurant' },
  bergabung: '2025-01-12', status: 'ACTIVE',
  kontrak: { jenis: 'PKWTT', mulai: '2025-01-12', berakhir: null, gajiPokok: 3_800_000, sisaHari: null },
};

export const ABSENSI: Absensi = {
  hariHadir: 22, totalTerlambatMenit: 34, totalLemburMenit: 186, ditandai: 1,
  riwayat: [
    { id: 'a1', tanggal: jam(-1, 7), masuk: jam(-1, 6, 52), keluar: jam(-1, 15, 14), terlambatMenit: 0, lemburMenit: 14, jarakM: 38, ditandai: false, alasan: null },
    { id: 'a2', tanggal: jam(-2, 7), masuk: jam(-2, 7, 18), keluar: jam(-2, 15, 5), terlambatMenit: 18, lemburMenit: 5, jarakM: 52, ditandai: false, alasan: null },
    { id: 'a3', tanggal: jam(-3, 7), masuk: jam(-3, 6, 58), keluar: jam(-3, 16, 2), terlambatMenit: 0, lemburMenit: 62, jarakM: 41, ditandai: false, alasan: null },
    { id: 'a4', tanggal: jam(-4, 7), masuk: jam(-4, 7, 4), keluar: jam(-4, 15, 0), terlambatMenit: 4, lemburMenit: 0, jarakM: 410, ditandai: true, alasan: 'di luar radius (410 m)' },
    { id: 'a5', tanggal: jam(-5, 7), masuk: jam(-5, 6, 49), keluar: jam(-5, 15, 22), terlambatMenit: 0, lemburMenit: 22, jarakM: 33, ditandai: false, alasan: null },
  ],
};

export const SHIFT: Shift[] = [
  { id: 's1', tanggal: hari(0), mulai: jam(0, 7), selesai: jam(0, 15), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
  { id: 's2', tanggal: hari(1), mulai: jam(1, 7), selesai: jam(1, 15), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
  { id: 's3', tanggal: hari(2), mulai: jam(2, 14), selesai: jam(2, 22), outlet: 'RESTO-01', peran: 'Kasir', terbit: true },
  { id: 's4', tanggal: hari(4), mulai: jam(4, 7), selesai: jam(4, 15), outlet: 'RESTO-02', peran: 'Kasir', terbit: true },
  { id: 's5', tanggal: hari(5), mulai: jam(5, 14), selesai: jam(5, 22), outlet: 'RESTO-01', peran: 'Kasir', terbit: false },
];

export const SALDO_CUTI: SaldoCuti[] = [
  { kode: 'TAHUNAN', nama: 'Cuti Tahunan', kuota: 12, terpakai: 3, sisa: 9, dibayar: true },
  { kode: 'SAKIT', nama: 'Sakit', kuota: 14, terpakai: 1, sisa: 13, dibayar: true },
  { kode: 'IZIN', nama: 'Izin', kuota: 6, terpakai: 2, sisa: 4, dibayar: false },
];

export const CUTI: Cuti[] = [
  { id: 'c1', jenis: 'Cuti Tahunan', mulai: hari(12), selesai: hari(14), hari: 3, alasan: 'Acara keluarga', status: 'SUBMITTED', diputusPada: null },
  { id: 'c2', jenis: 'Sakit', mulai: hari(-20), selesai: hari(-20), hari: 1, alasan: 'Demam', status: 'APPROVED', diputusPada: hari(-20) },
  { id: 'c3', jenis: 'Cuti Tahunan', mulai: hari(-45), selesai: hari(-43), hari: 3, alasan: 'Mudik', status: 'APPROVED', diputusPada: hari(-50) },
];

export const SLIP: Slip[] = [
  { id: 'p1', nomorRun: 'PRL-202607-000007', dibayarPada: '2026-07-30', bruto: 4_700_000, neto: 4_512_000, potongan: 188_000, dikoreksi: false },
  { id: 'p2', nomorRun: 'PRL-202606-000006', dibayarPada: '2026-06-30', bruto: 4_560_000, neto: 4_378_000, potongan: 182_000, dikoreksi: false },
  { id: 'p3', nomorRun: 'PRL-202605-000005', dibayarPada: '2026-05-30', bruto: 4_700_000, neto: 4_512_000, potongan: 188_000, dikoreksi: true },
];
