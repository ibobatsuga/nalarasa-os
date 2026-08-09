import { prisma } from './core/db.js';
import { withTenant } from './core/tenant.js';
import { versionHash } from './core/hash.js';
import { CALIBRATION_VERSION } from './config/calibration.js';
import { setPassword } from './iam/auth.js';
import { newPinSalt, pinHash } from './domains/o2c/pos-sync.js';
import { ensureRoleCatalogue, provisionTenant } from './tenancy/provision.js';

/** Dev bootstrap password. Every seeded account must change it at first login. */
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'ubah-password-ini-2026';

/** Maker / checker / releaser are DIFFERENT people by construction. */
const PEOPLE: Array<[string, string, string, string[]]> = [
  // Pemilik. Wajib ada: kuorum T4 menuntut dua penyetuju berbeda peran, dan
  // tanpa Executive Sponsor hanya CFO yang berband T4 — setiap permintaan T4
  // akan menggantung selamanya karena suara kedua mustahil didapat.
  ['u.owner', 'Ibu Sri — Pemilik / Executive Sponsor', 'Owner', ['R01']],
  ['u.steward', 'Dina — Data Steward', 'Data', ['R06']],
  ['u.dataowner', 'Rian — Data Owner', 'Data', ['R05']],
  ['u.sales', 'Ayu — Sales Rep', 'Commercial', ['R09']],
  ['u.salesmgr', 'Budi — Sales Manager', 'Commercial', ['R10']],
  ['u.cashier', 'Tono — POS Operator', 'Outlet', ['R12']],
  // Persona aplikasi manajemen ruang: reservasi, acara, dan menu engineering.
  ['u.svcmgr', 'Dewi — Supervisor Outlet / Service Manager', 'Outlet', ['R14']],
  ['u.buyer', 'Sari — Buyer', 'Procurement', ['R16']],
  ['u.procmgr', 'Hadi — Procurement Manager', 'Procurement', ['R17']],
  ['u.receiver', 'Eko — Receiving Clerk', 'Warehouse', ['R18']],
  ['u.whsup', 'Lia — Warehouse Supervisor', 'Warehouse', ['R20']],
  ['u.ap', 'Nina — AP Accountant', 'Finance', ['R31']],
  ['u.gl', 'Fajar — General Accountant', 'Finance', ['R32']],
  ['u.controller', 'Maya — Controller', 'Finance', ['R33']],
  ['u.treasprep', 'Adi — Treasury Preparer', 'Treasury', ['R34']],
  ['u.treasappr', 'Wulan — Treasury Approver', 'Treasury', ['R35']],
  ['u.cfo', 'Bagus — CFO', 'Finance', ['R36']],
  ['u.payprep', 'Intan — Payroll Preparer', 'HR', ['R41']],
  ['u.payappr', 'Yusuf — Payroll Approver', 'HR', ['R42']],
  ['u.risk', 'Rara — Risk & Control Owner', 'Risk', ['R03']],
  ['u.bi', 'Putri — KPI Owner', 'Analytics', ['R07']],
];

async function main() {
  const roles = await ensureRoleCatalogue();

  const provisioned = await provisionTenant({
    slug: 'horison-emerald',
    name: 'Horison Emerald Timoho',
    plan: 'GROWTH',
    companyCode: 'HET',
    companyName: 'Horison Emerald Timoho',
    sites: [
      { code: 'RESTO-01', name: 'Main Restaurant', isPos: true },
      { code: 'RESTO-02', name: 'Second Outlet', isPos: true },
      { code: 'HO', name: 'Head Office' },
    ],
    admin: { subjectId: 'u.iam', displayName: 'Galih — IAM Administrator', password: SEED_PASSWORD },
  });

  const tenantId = provisioned.tenant.id;
  const companyId = provisioned.company.id;
  const siteId = provisioned.sites[0]!.id;

  await withTenant({ tenantId, slug: provisioned.tenant.slug }, async () => {
    for (const [subjectId, displayName, department, roleCodes] of PEOPLE) {
      const user = await prisma.user.create({
        data: { subjectId, displayName, department, joinedAt: new Date() },
      });
      await setPassword(user.id, SEED_PASSWORD, true);
      for (const code of roleCodes) {
        const role = await prisma.role.findUniqueOrThrow({ where: { code } });
        await prisma.userRole.create({
          data: { userId: user.id, roleId: role.id, companyId, siteId, grantedBy: 'SEED' },
        });
      }
    }

    const uom = await prisma.uom.create({ data: { code: 'PCS', name: 'Piece', category: 'UNIT' } });
    const products = [
      { code: 'MENU-NASI', name: 'Nasi Goreng Spesial', category: 'FOOD', stdCost: 18_000, listPrice: 45_000 },
      { code: 'MENU-AYAM', name: 'Ayam Bakar Madu', category: 'FOOD', stdCost: 26_000, listPrice: 65_000 },
      { code: 'BAHAN-BERAS', name: 'Beras Premium 5kg', category: 'RAW', stdCost: 72_000, listPrice: 0 },
    ];
    for (const p of products) {
      await prisma.product.create({
        data: { ...p, uomId: uom.id, status: 'ACTIVE', versionHash: versionHash(p) },
      });
    }

    const accounts = [
      { code: '1-1100', name: 'Kas & Bank', type: 'ASSET', restricted: true },
      { code: '1-1200', name: 'Piutang Usaha', type: 'ASSET', restricted: false },
      { code: '2-1100', name: 'Utang Usaha', type: 'LIABILITY', restricted: false },
      { code: '4-1000', name: 'Pendapatan', type: 'INCOME', restricted: false },
      { code: '5-1000', name: 'HPP', type: 'EXPENSE', restricted: false },
    ];
    for (const a of accounts) await prisma.account.create({ data: a });

    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
    await prisma.kpiPlan.create({
      data: { kpiCode: 'K01', companyId, periodStart: start, periodEnd: end, target: 450_000_000, approvedBy: 'SEED' },
    });

    // ── ruang: meja, reservasi hari ini, dan satu acara ──────────────────────
    const resto = provisioned.sites.find((x) => x.code === 'RESTO-01')!;
    const MEJA: Array<[string, string, number]> = [
      ['T01', 'Indoor', 2], ['T02', 'Indoor', 2], ['T03', 'Indoor', 4], ['T04', 'Indoor', 4],
      ['T05', 'Indoor', 6], ['T06', 'Teras', 4], ['T07', 'Teras', 4], ['T08', 'Teras', 2],
      ['V01', 'VIP', 8], ['V02', 'VIP', 10], ['R01', 'Rooftop', 6], ['R02', 'Rooftop', 6],
    ];
    await prisma.diningTable.createMany({
      data: MEJA.map(([code, area, seats]) => ({ siteId: resto.id, code, area, seats })),
    });

    /**
     * Jam dinyatakan dalam WIB, disimpan sebagai UTC.
     *
     * Menulis `Date.UTC(..., 19, 0)` untuk "reservasi pukul 19.00" membuat layar
     * di Indonesia menampilkan pukul 02.00 keesokan harinya. Produk ini dijual
     * ke outlet Indonesia; jam yang meleset tujuh jam bukan detail kosmetik —
     * jadwal shift dan reservasi menjadi salah hari.
     */
    const WIB_OFFSET_JAM = 7;
    const jam = (h: number, m = 0) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h - WIB_OFFSET_JAM, m));

    for (const [nama, telepon, h, mnt, pax, sumber] of [
      ['Bu Ratna', '081234567801', 18, 30, 4, 'WHATSAPP'],
      ['Pak Handoko', '081234567802', 19, 0, 2, 'TELEPON'],
      ['Keluarga Wijaya', '081234567803', 19, 30, 8, 'ONLINE'],
      ['Mbak Sinta', '081234567804', 20, 0, 3, 'WHATSAPP'],
    ] as Array<[string, string, number, number, number, string]>) {
      await prisma.reservation.create({
        data: {
          siteId: resto.id, guestName: nama, phone: telepon, bookedFor: jam(h, mnt),
          pax, source: sumber, status: 'DIKONFIRMASI',
          versionHash: `seed:${telepon}`,
        },
      });
    }

    // ── HR: karyawan, shift, absensi, kuota cuti ────────────────────────────
    // Tanpa baris Employee, aplikasi karyawan (ESS) tidak punya identitas untuk
    // dipetakan dari sesi dan setiap permintaannya berakhir 409 — layar lalu
    // jatuh ke data contoh tanpa satu pun tanda bahwa itu bukan data asli.
    for (const [code, name, quota] of [
      ['TAHUNAN', 'Cuti Tahunan', 12], ['SAKIT', 'Cuti Sakit', 12],
      ['MELAHIRKAN', 'Cuti Melahirkan', 90], ['IZIN', 'Izin Tidak Dibayar', 0],
    ] as Array<[string, string, number]>) {
      await prisma.leaveType.create({
        data: { code, name, quotaDays: quota, paid: code !== 'IZIN' },
      });
    }

    // PIN enam angka, sama panjang dengan PIN ATM. Tanpa ini bootstrap till
    // mengirim daftar kasir kosong dan mesin kasir jatuh ke masuk-dengan-nama —
    // yang berarti tidak ada satu pun transaksi yang bisa ditelusuri ke orang.
    const STAF: Array<[string, string, string, string, string]> = [
      ['u.cashier', 'EMP-0012', 'Tono Prasetyo', 'Kasir', '246810'],
      ['u.svcmgr', 'EMP-0009', 'Dewi Anggraini', 'Supervisor Outlet', '778899'],
      ['u.receiver', 'EMP-0018', 'Eko Nugroho', 'Petugas Penerimaan', '135791'],
    ];
    const hariIni = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    for (const [subjectId, employeeNo, fullName, position, pin] of STAF) {
      const u = await prisma.user.findFirstOrThrow({ where: { subjectId } });
      const emp = await prisma.employee.create({
        data: {
          employeeNo, fullName, position, department: 'Outlet',
          siteId: resto.id, userId: u.id, status: 'ACTIVE',
          hiredAt: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 15)),
          versionHash: `seed:${employeeNo}`,
        },
      });
      // Kedua arah tautan diisi: layanan lama membaca User.employeeNo, skema
      // menyimpan Employee.userId. Mengisi satu saja meninggalkan jebakan.
      await prisma.user.update({ where: { id: u.id }, data: { employeeNo } });
      const garam = newPinSalt();
      await prisma.employee.update({
        where: { id: emp.id },
        data: { posPinSalt: garam, posPinHash: await pinHash(garam, pin) },
      });

      // Empat belas hari terakhir: absen masuk-pulang, satu hari ditandai di
      // luar radius supaya layar penandaan benar-benar punya kasus nyata.
      for (let d = 1; d <= 14; d++) {
        const tgl = new Date(hariIni.getTime() - d * 86_400_000);
        if (tgl.getUTCDay() === 0) continue; // Minggu libur
        const telat = d % 5 === 0 ? 18 : 0;
        // Masuk 07.00 WIB.
        const checkIn = new Date(tgl.getTime() + ((7 - WIB_OFFSET_JAM) * 60 + telat) * 60_000);
        const checkOut = new Date(checkIn.getTime() + (8 * 60 + (d % 4 === 0 ? 45 : 0)) * 60_000);
        const jauh = d === 4;
        await prisma.attendance.create({
          data: {
            employeeId: emp.id, siteId: resto.id, checkIn, checkOut,
            distanceM: jauh ? 410 : 35, flagged: jauh,
            flagReason: jauh ? 'di luar radius (410 m)' : null,
            lateMinutes: telat, overtimeMinutes: d % 4 === 0 ? 45 : 0,
            source: 'MOBILE',
          },
        });
      }

      // Jadwal dua minggu ke depan.
      for (let d = 0; d < 14; d++) {
        const tgl = new Date(hariIni.getTime() + d * 86_400_000);
        if (tgl.getUTCDay() === 0) continue;
        await prisma.shiftAssignment.create({
          data: {
            employeeId: emp.id, siteId: resto.id, shiftDate: tgl,
            startsAt: new Date(tgl.getTime() + (7 - WIB_OFFSET_JAM) * 3_600_000),
            endsAt: new Date(tgl.getTime() + (15 - WIB_OFFSET_JAM) * 3_600_000),
            role: position, publishedAt: new Date(),
          },
        });
      }
    }

    await prisma.venueEvent.create({
      data: {
        siteId: resto.id, name: 'Akustik Jumat Malam', area: 'Rooftop',
        startsAt: jam(20, 0), endsAt: jam(22, 30), pax: 40, kind: 'MUSIK',
        value: 3_500_000, status: 'PASTI', owner: 'Maya — Service Manager',
        versionHash: 'seed:akustik',
      },
    });
  });

  console.log(JSON.stringify({
    roles, calibration: CALIBRATION_VERSION,
    tenant: provisioned.tenant, company: provisioned.company,
    sites: provisioned.sites, users: PEOPLE.length + 1,
    login: { subjectId: 'u.cfo', tenantSlug: provisioned.tenant.slug, password: SEED_PASSWORD },
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
