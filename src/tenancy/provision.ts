import { prisma } from '../core/db.js';
import { runAsSystem, withTenant } from '../core/tenant.js';
import { ControlError } from '../core/errors.js';
import { ROLES } from '../config/roles.js';
import { DEFAULT_SHEET, publishCalibration } from '../config/calibration-store.js';
import { setPassword } from '../iam/auth.js';
import { audit } from '../core/audit.js';

/** Product-level role catalogue R01–R51. Shared by every tenant, seeded once. */
export async function ensureRoleCatalogue(): Promise<number> {
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { code: r.code },
      create: { code: r.code, name: r.name, band: r.maxBand, privileged: r.privileged ?? false },
      update: { name: r.name, band: r.maxBand, privileged: r.privileged ?? false },
    });
  }
  return ROLES.length;
}

export interface PlanLimits { maxUsers: number; maxSites: number }

/** Commercial plans for the UMKM / cafe / restaurant market. */
export const PLANS: Record<string, PlanLimits> = {
  STARTER: { maxUsers: 5, maxSites: 1 },     // warung, single cafe
  GROWTH: { maxUsers: 25, maxSites: 5 },     // small restaurant group
  BUSINESS: { maxUsers: 100, maxSites: 20 }, // multi-brand operator
};

export interface ProvisionInput {
  slug: string;
  name: string;
  plan?: keyof typeof PLANS;
  companyCode: string;
  companyName: string;
  sites: Array<{ code: string; name: string; isPos?: boolean }>;
  admin: { subjectId: string; displayName: string; email?: string; password: string };
  currency?: string;
  timezone?: string;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/**
 * Creates a tenant and everything it needs to be usable on day one:
 * limits, calibration, company, sites, and one administrator.
 * Idempotent on the slug — a repeat call is refused, not silently merged.
 */
export async function provisionTenant(input: ProvisionInput) {
  if (!SLUG.test(input.slug)) {
    throw new ControlError('INVALID_SLUG', 'Slug must be lowercase, 3–32 chars, a-z 0-9 and dashes', 400);
  }
  const plan = input.plan ?? 'STARTER';
  const limits = PLANS[plan];
  if (!limits) throw new ControlError('UNKNOWN_PLAN', `Plan ${plan} is not offered`, 400, { plans: Object.keys(PLANS) });
  if (input.sites.length > limits.maxSites) {
    throw new ControlError('PLAN_LIMIT', `Plan ${plan} allows ${limits.maxSites} site(s)`, 409, { requested: input.sites.length });
  }

  const tenant = await runAsSystem(async () => {
    const existing = await prisma.tenant.findUnique({ where: { slug: input.slug } });
    if (existing) throw new ControlError('SLUG_TAKEN', `Tenant ${input.slug} already exists`, 409);
    return prisma.tenant.create({
      data: {
        slug: input.slug, name: input.name, plan,
        maxUsers: limits.maxUsers, maxSites: limits.maxSites,
        currency: input.currency ?? 'IDR', timezone: input.timezone ?? 'Asia/Jakarta',
        trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  });

  // Every tenant starts from the product calibration template, then diverges.
  await publishCalibration(tenant.id, DEFAULT_SHEET, 'PROVISION');

  const result = await withTenant({ tenantId: tenant.id, slug: tenant.slug }, async () => {
    const company = await prisma.company.create({
      data: { code: input.companyCode, name: input.companyName, currency: tenant.currency },
    });
    const sites = [];
    for (const s of input.sites) {
      sites.push(await prisma.site.create({
        data: { companyId: company.id, code: s.code, name: s.name, isPos: s.isPos ?? false },
      }));
    }

    const admin = await prisma.user.create({
      data: {
        subjectId: input.admin.subjectId, displayName: input.admin.displayName,
        email: input.admin.email ?? null, joinedAt: new Date(),
      },
    });
    // The first user is IAM administrator only. Business authority is granted
    // afterwards through JML, so the founder never becomes a standing superuser.
    const iamRole = await prisma.role.findUniqueOrThrow({ where: { code: 'R47' } });
    await prisma.userRole.create({
      data: { userId: admin.id, roleId: iamRole.id, companyId: company.id, grantedBy: 'PROVISION' },
    });

    await audit({
      actor: { userId: admin.id, roleCodes: ['R47'] }, action: 'tenant.provisioned',
      docType: 'Tenant', docId: tenant.id, toStatus: 'TRIAL',
      meta: { slug: tenant.slug, plan, sites: sites.length, calibration: DEFAULT_SHEET.version },
    });

    return { company, sites, admin };
  });

  await setPassword(result.admin.id, input.admin.password, true);

  return {
    tenant: { id: tenant.id, slug: tenant.slug, plan, trialEndsAt: tenant.trialEndsAt },
    company: { id: result.company.id, code: result.company.code },
    sites: result.sites.map((s) => ({ id: s.id, code: s.code })),
    admin: { id: result.admin.id, subjectId: result.admin.subjectId, mustChangePassword: true },
  };
}

/** Plan limits are enforced on every user creation, not only at signup. */
export async function assertUserQuota(tenantId: string): Promise<void> {
  const [tenant, count] = await runAsSystem(() => Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    prisma.user.count({ where: { tenantId, status: 'ACTIVE' } }),
  ]));
  if (count >= tenant.maxUsers) {
    throw new ControlError('PLAN_LIMIT', `Plan ${tenant.plan} allows ${tenant.maxUsers} active users`, 409, { count });
  }
}

/** Suspension freezes access without destroying data. There is no hard delete. */
export async function suspendTenant(tenantId: string, reason: string) {
  return runAsSystem(async () => {
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    await prisma.session.updateMany({ where: { tenantId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { tenant, reason };
  });
}
