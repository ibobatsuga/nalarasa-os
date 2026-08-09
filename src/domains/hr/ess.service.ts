import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { audit } from '../../core/audit.js';
import { num, round2 } from '../../core/seq.js';
import { ControlError } from '../../core/errors.js';
import type { Actor } from '../../core/types.js';
import { requestApproval } from '../../approval/approval.service.js';

/**
 * Employee Self-Service.
 *
 * Dua keputusan yang membentuk modul ini:
 *
 * 1. **Karyawan hanya melihat dirinya sendiri.** Tidak ada parameter employeeId
 *    di satu pun endpoint di bawah — identitas selalu diturunkan dari sesi.
 *    Kalau id boleh dikirim klien, cepat atau lambat ada yang membaca slip gaji
 *    orang lain.
 *
 * 2. **Absen di luar radius ditandai, bukan ditolak.** Menolak absen berarti
 *    karyawan yang sinyal GPS-nya meleset kehilangan hari kerjanya, dan itu
 *    masalah upah — bukan masalah kontrol. Yang benar: catat, ukur jaraknya,
 *    tandai, lalu biarkan supervisor memutuskan.
 */

// ─── identitas ────────────────────────────────────────────────────────────────

/** Menautkan sesi login ke baris karyawan. Tanpa ini, ESS tidak punya subjek. */
async function meAsEmployee(actor: Actor) {
  const user = await prisma.user.findFirst({
    where: { id: actor.userId },
    select: { employeeNo: true, displayName: true },
  });
  if (!user?.employeeNo) {
    throw new ControlError('NOT_AN_EMPLOYEE', 'Akun ini belum ditautkan ke data karyawan', 409);
  }
  const employee = await prisma.employee.findFirst({ where: { employeeNo: user.employeeNo } });
  if (!employee) throw new ControlError('NOT_FOUND', 'Data karyawan tidak ditemukan', 404);
  return employee;
}

export async function myProfile(actor: Actor) {
  const e = await meAsEmployee(actor);
  const kontrak = await prisma.employmentContract.findFirst({
    where: { employeeId: e.id, status: { in: ['APPROVED', 'EXECUTED'] } },
    orderBy: { startsAt: 'desc' },
  });
  const site = e.siteId ? await prisma.site.findFirst({ where: { id: e.siteId } }) : null;

  return {
    employeeNo: e.employeeNo,
    nama: e.fullName,
    posisi: e.position,
    departemen: e.department,
    outlet: site ? { kode: site.code, nama: site.name } : null,
    bergabung: e.hiredAt,
    status: e.status,
    kontrak: kontrak && {
      jenis: kontrak.type,
      mulai: kontrak.startsAt,
      berakhir: kontrak.endsAt,
      gajiPokok: num(kontrak.baseSalary),
      // Sisa hari kontrak: yang paling ingin diketahui pekerja PKWT.
      sisaHari: kontrak.endsAt
        ? Math.ceil((kontrak.endsAt.getTime() - Date.now()) / 86_400_000)
        : null,
    },
  };
}

// ─── absensi ──────────────────────────────────────────────────────────────────

export const ClockInput = z.object({
  siteCode: z.string(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** Diisi klien saat absen tersimpan offline lalu dikirim menyusul. */
  offlineAt: z.coerce.date().optional(),
});

/** Haversine, meter. Cukup akurat untuk radius outlet yang cuma ratusan meter. */
export function jarakMeter(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function clockIn(actor: Actor, input: z.infer<typeof ClockInput>) {
  const e = await meAsEmployee(actor);
  const site = await prisma.site.findFirst({ where: { code: input.siteCode } });
  if (!site) throw new ControlError('UNKNOWN_SITE', `Outlet ${input.siteCode} tidak ditemukan`, 404);

  const sejakPagi = new Date(); sejakPagi.setHours(0, 0, 0, 0);
  const terbuka = await prisma.attendance.findFirst({
    where: { employeeId: e.id, checkOut: null, checkIn: { gte: sejakPagi } },
  });
  if (terbuka) throw new ControlError('ALREADY_IN', 'Kamu sudah absen masuk hari ini', 409);

  const waktu = input.offlineAt ?? new Date();
  let distanceM: number | null = null;
  const alasan: string[] = [];

  if (input.lat !== undefined && input.lng !== undefined && site.lat && site.lng) {
    distanceM = jarakMeter(input.lat, input.lng, num(site.lat), num(site.lng));
    if (distanceM > site.geofenceM) alasan.push(`di luar radius (${distanceM} m)`);
  } else if (input.lat === undefined) {
    alasan.push('lokasi tidak dikirim');
  }
  if (input.offlineAt) alasan.push('dikirim dari antrean offline');

  // Keterlambatan dihitung dari shift yang dijadwalkan, bukan dari jam kantor
  // generik — outlet punya beberapa shift dalam sehari.
  const shift = await prisma.shiftAssignment.findFirst({
    where: { employeeId: e.id, shiftDate: { gte: sejakPagi } },
    orderBy: { startsAt: 'asc' },
  });
  const lateMinutes = shift
    ? Math.max(0, Math.round((waktu.getTime() - shift.startsAt.getTime()) / 60_000))
    : 0;

  const row = await prisma.attendance.create({
    data: {
      employeeId: e.id, siteId: site.id, checkIn: waktu,
      checkInLat: input.lat ?? null, checkInLng: input.lng ?? null,
      distanceM, lateMinutes,
      flagged: alasan.length > 0,
      flagReason: alasan.length ? alasan.join('; ') : null,
      source: input.offlineAt ? 'MOBILE_OFFLINE' : 'MOBILE',
    },
  });

  await audit({
    actor, action: 'ess.clock_in', docType: 'Attendance', docId: row.id,
    meta: { employeeNo: e.employeeNo, site: site.code, distanceM, lateMinutes, flagged: row.flagged },
  });

  return {
    id: row.id, masuk: row.checkIn, jarakM: distanceM,
    terlambatMenit: lateMinutes, ditandai: row.flagged, alasan: row.flagReason,
  };
}

export async function clockOut(actor: Actor) {
  const e = await meAsEmployee(actor);
  const sejakPagi = new Date(); sejakPagi.setHours(0, 0, 0, 0);
  const row = await prisma.attendance.findFirst({
    where: { employeeId: e.id, checkOut: null, checkIn: { gte: sejakPagi } },
    orderBy: { checkIn: 'desc' },
  });
  if (!row) throw new ControlError('NOT_IN', 'Belum ada absen masuk yang terbuka', 409);

  const keluar = new Date();
  const shift = await prisma.shiftAssignment.findFirst({
    where: { employeeId: e.id, shiftDate: { gte: sejakPagi } },
    orderBy: { startsAt: 'asc' },
  });
  const overtimeMinutes = shift
    ? Math.max(0, Math.round((keluar.getTime() - shift.endsAt.getTime()) / 60_000))
    : 0;

  const updated = await prisma.attendance.update({
    where: { id: row.id }, data: { checkOut: keluar, overtimeMinutes },
  });

  await audit({
    actor, action: 'ess.clock_out', docType: 'Attendance', docId: row.id,
    meta: { employeeNo: e.employeeNo, overtimeMinutes },
  });

  return {
    id: updated.id, masuk: updated.checkIn, keluar,
    durasiMenit: Math.round((keluar.getTime() - updated.checkIn.getTime()) / 60_000),
    lemburMenit: overtimeMinutes,
  };
}

export async function myAttendance(actor: Actor, hari = 30) {
  const e = await meAsEmployee(actor);
  const sejak = new Date(Date.now() - hari * 86_400_000);
  const rows = await prisma.attendance.findMany({
    where: { employeeId: e.id, checkIn: { gte: sejak } },
    orderBy: { checkIn: 'desc' },
  });
  return {
    hariHadir: rows.length,
    totalTerlambatMenit: rows.reduce((s, r) => s + r.lateMinutes, 0),
    totalLemburMenit: rows.reduce((s, r) => s + r.overtimeMinutes, 0),
    ditandai: rows.filter((r) => r.flagged).length,
    riwayat: rows.map((r) => ({
      id: r.id, tanggal: r.checkIn, masuk: r.checkIn, keluar: r.checkOut,
      terlambatMenit: r.lateMinutes, lemburMenit: r.overtimeMinutes,
      jarakM: r.distanceM, ditandai: r.flagged, alasan: r.flagReason,
    })),
  };
}

// ─── jadwal shift ─────────────────────────────────────────────────────────────

export async function myShifts(actor: Actor, hari = 14) {
  const e = await meAsEmployee(actor);
  const dari = new Date(); dari.setHours(0, 0, 0, 0);
  const sampai = new Date(dari.getTime() + hari * 86_400_000);

  const rows = await prisma.shiftAssignment.findMany({
    where: { employeeId: e.id, shiftDate: { gte: dari, lte: sampai } },
    orderBy: [{ shiftDate: 'asc' }, { startsAt: 'asc' }],
  });
  const sites = await prisma.site.findMany({ select: { id: true, code: true, name: true } });
  const nama = new Map(sites.map((s) => [s.id, s.code]));

  return rows.map((r) => ({
    id: r.id, tanggal: r.shiftDate, mulai: r.startsAt, selesai: r.endsAt,
    outlet: nama.get(r.siteId) ?? '-', peran: r.role,
    // Jadwal yang belum diterbitkan masih bisa berubah; jangan dibaca sebagai janji.
    terbit: r.publishedAt !== null,
  }));
}

// ─── cuti ─────────────────────────────────────────────────────────────────────

export const LeaveInput = z.object({
  leaveTypeCode: z.string(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(300).optional(),
});

export async function myLeaveBalance(actor: Actor) {
  const e = await meAsEmployee(actor);
  const jenis = await prisma.leaveType.findMany();
  const tahunIni = new Date(new Date().getFullYear(), 0, 1);

  const terpakai = await prisma.leaveRequest.findMany({
    where: { employeeId: e.id, status: 'APPROVED', startsAt: { gte: tahunIni } },
  });

  return jenis.map((j) => {
    const pakai = terpakai
      .filter((r) => r.leaveTypeId === j.id)
      .reduce((s, r) => s + num(r.days), 0);
    return {
      kode: j.code, nama: j.name, kuota: j.quotaDays,
      terpakai: round2(pakai), sisa: round2(j.quotaDays - pakai), dibayar: j.paid,
    };
  });
}

export async function requestLeave(actor: Actor, input: z.infer<typeof LeaveInput>) {
  const e = await meAsEmployee(actor);
  const jenis = await prisma.leaveType.findFirst({ where: { code: input.leaveTypeCode } });
  if (!jenis) throw new ControlError('NOT_FOUND', `Jenis cuti ${input.leaveTypeCode} tidak ada`, 404);
  if (input.endsAt < input.startsAt) {
    throw new ControlError('BAD_RANGE', 'Tanggal selesai lebih awal dari tanggal mulai', 400);
  }

  const days = Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 86_400_000) + 1;

  // Tumpang-tindih dicegah di sini, bukan saat persetujuan — supaya karyawan
  // tahu langsung, bukan setelah menunggu sehari.
  const bentrok = await prisma.leaveRequest.findFirst({
    where: {
      employeeId: e.id,
      status: { in: ['SUBMITTED', 'APPROVED'] },
      startsAt: { lte: input.endsAt },
      endsAt: { gte: input.startsAt },
    },
  });
  if (bentrok) throw new ControlError('OVERLAP', 'Sudah ada pengajuan cuti pada tanggal itu', 409);

  const saldo = (await myLeaveBalance(actor)).find((b) => b.kode === jenis.code);
  if (saldo && saldo.sisa < days) {
    throw new ControlError('NO_BALANCE', `Sisa kuota ${saldo.sisa} hari, diajukan ${days} hari`, 409, {
      sisa: saldo.sisa, diajukan: days,
    });
  }

  const row = await prisma.leaveRequest.create({
    data: {
      employeeId: e.id, leaveTypeId: jenis.id,
      startsAt: input.startsAt, endsAt: input.endsAt, days,
      reason: input.reason ?? null, status: 'SUBMITTED',
      versionHash: `${e.id}:${input.startsAt.toISOString()}:${days}`,
    },
  });

  // Cuti masuk jalur persetujuan yang sama dengan transaksi lain (AR22),
  // sehingga atasan melihatnya di tempat yang sama, bukan di kotak terpisah.
  const approval = await requestApproval({
    familyCode: 'AR22', docType: 'LeaveRequest', docId: row.id,
    payload: { employeeNo: e.employeeNo, jenis: jenis.code, hari: days, alasan: input.reason ?? null },
    at: new Date(), actor,
  });
  await prisma.leaveRequest.update({ where: { id: row.id }, data: { approvalId: approval.approvalId } });

  await audit({
    actor, action: 'ess.leave_request', docType: 'LeaveRequest', docId: row.id,
    toStatus: 'SUBMITTED', meta: { jenis: jenis.code, hari: days },
  });

  return { id: row.id, hari: days, status: 'SUBMITTED', band: approval.band };
}

export async function myLeaves(actor: Actor) {
  const e = await meAsEmployee(actor);
  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId: e.id }, orderBy: { startsAt: 'desc' }, take: 40,
  });
  const jenis = await prisma.leaveType.findMany();
  const nama = new Map(jenis.map((j) => [j.id, j.name]));

  return rows.map((r) => ({
    id: r.id, jenis: nama.get(r.leaveTypeId) ?? '-',
    mulai: r.startsAt, selesai: r.endsAt, hari: num(r.days),
    alasan: r.reason, status: r.status, diputusPada: r.decidedAt,
  }));
}

// ─── slip gaji ────────────────────────────────────────────────────────────────

export async function myPayslips(actor: Actor) {
  const e = await meAsEmployee(actor);
  const slips = await prisma.payslip.findMany({
    where: { employeeNo: e.employeeNo, run: { status: 'EXECUTED' } },
    include: { run: { select: { docNo: true, paidAt: true, periodId: true } } },
    orderBy: { id: 'desc' },
    take: 24,
  });

  await audit({
    actor, action: 'ess.payslip_view', docType: 'Employee', docId: e.id,
    meta: { employeeNo: e.employeeNo, jumlah: slips.length },
  });

  return slips.map((s) => ({
    id: s.id, nomorRun: s.run.docNo, dibayarPada: s.run.paidAt,
    bruto: num(s.gross), neto: num(s.net),
    potongan: round2(num(s.gross) - num(s.net)), dikoreksi: s.corrected,
  }));
}
