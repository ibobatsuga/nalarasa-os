import { prisma } from './core/db.js';
import { withTenant } from './core/tenant.js';
import { versionHash } from './core/hash.js';
import { CALIBRATION_VERSION } from './config/calibration.js';
import { setPassword } from './iam/auth.js';
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
  });

  console.log(JSON.stringify({
    roles, calibration: CALIBRATION_VERSION,
    tenant: provisioned.tenant, company: provisioned.company,
    sites: provisioned.sites, users: PEOPLE.length + 1,
    login: { subjectId: 'u.cfo', tenantSlug: provisioned.tenant.slug, password: SEED_PASSWORD },
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
