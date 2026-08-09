import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { prisma } from '../core/db.js';
import { ControlError } from '../core/errors.js';
import type { Actor } from '../core/types.js';
import { actorFromToken } from '../iam/auth.js';
import { bindTenant, runAsSystem, type TenantContext } from '../core/tenant.js';
import { loadCalibration } from '../config/calibration-store.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
    /** Diisi hook resolusi, dipakai hook pengikat tepat setelahnya. */
    tenantCtx?: TenantContext;
  }
}

const PUBLIC_PREFIXES = ['/health', '/meta', '/auth/login'];
/** Paths that legitimately run without a tenant: health and platform admin. */
const TENANTLESS_PREFIXES = ['/health', '/meta', '/platform'];

/**
 * Tenant comes from the subdomain (warungbudi.erp.id) or an explicit header in
 * development. Resolved once per request, before authentication, so that even
 * the login lookup is already scoped to one tenant.
 */
export async function resolveTenant(req: FastifyRequest): Promise<void> {
  const header = req.headers['x-tenant'];
  const host = (req.headers.host ?? '').split(':')[0] ?? '';
  const sub = host.split('.').length > 2 ? host.split('.')[0] : undefined;
  const slug = (typeof header === 'string' && header) || sub;
  if (!slug) throw new ControlError('NO_TENANT', 'Tenant not identified (subdomain or x-tenant header)', 400);

  const tenant = await runAsSystem(() => prisma.tenant.findUnique({ where: { slug } }));
  if (!tenant) throw new ControlError('NO_TENANT', `Unknown tenant "${slug}"`, 404);
  if (tenant.status === 'SUSPENDED' || tenant.status === 'CLOSED') {
    throw new ControlError('TENANT_SUSPENDED', 'Tenant access is suspended', 402, { status: tenant.status });
  }

  req.tenantCtx = { tenantId: tenant.id, slug: tenant.slug };
  await loadCalibration(tenant.id);
}
const DEV_HEADER_ALLOWED = process.env.NODE_ENV !== 'production' && process.env.ALLOW_HEADER_AUTH === '1';

/** Identity resolution: bearer session token. Header auth is dev-only, opt-in. */
export async function resolveActor(req: FastifyRequest): Promise<Actor> {
  const companyId = (req.headers['x-company-id'] as string) || undefined;
  const siteId = (req.headers['x-site-id'] as string) || undefined;

  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return actorFromToken(auth.slice(7), companyId, siteId);
  }

  if (DEV_HEADER_ALLOWED) {
    const subjectId = req.headers['x-subject-id'];
    if (typeof subjectId === 'string' && subjectId) {
      const user = await prisma.user.findFirst({
        where: { subjectId },
        include: { roles: { where: { revokedAt: null, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, include: { role: true } } },
      });
      if (!user || user.status !== 'ACTIVE') throw new ControlError('UNAUTHENTICATED', 'Unknown or inactive subject', 401);
      return {
        userId: user.id,
        roleCodes: user.roles.filter((r) => r.role.status === 'ACTIVE').map((r) => r.role.code),
        companyId, siteId,
      };
    }
  }

  throw new ControlError('UNAUTHENTICATED', 'Bearer token required', 401);
}

export function registerContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    if (TENANTLESS_PREFIXES.some((p) => req.url.startsWith(p))) return;
    await resolveTenant(req);
  });

  // Hook gaya callback, dan itu disengaja: `next` dipanggil DI DALAM store.run,
  // sehingga seluruh hook berikutnya dan handler berjalan di dalam konteks
  // tenant. Hook async tidak bisa melakukan ini — konteksnya lepas begitu
  // promise-nya selesai, dan setiap query berakhir NO_TENANT_CONTEXT.
  app.addHook('onRequest', (req: FastifyRequest, _reply: FastifyReply, next: () => void) => {
    if (!req.tenantCtx) return next();
    bindTenant(req.tenantCtx, next);
  });

  app.addHook('preHandler', async (req: FastifyRequest) => {
    if (PUBLIC_PREFIXES.some((p) => req.url.startsWith(p))) return;
    req.actor = await resolveActor(req);
  });

  app.setErrorHandler((err, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof ControlError) {
      return reply.code(err.httpStatus).send({ error: err.code, message: err.message, detail: err.detail });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_FAILED', issues: err.issues });
    }
    const e = err as { statusCode?: number; message?: string };
    const status = e.statusCode ?? 500;
    // Kegagalan tak terduga dicatat lengkap di log, tapi yang keluar ke klien
    // hanya pesan umum: teks galat Prisma memuat nama tabel, kolom, dan nilai.
    if (status >= 500) {
      _req.log.error({ err }, 'unhandled error');
      return reply.code(status).send({ error: 'INTERNAL', message: 'Terjadi kesalahan pada server' });
    }
    return reply.code(status).send({ error: 'INTERNAL', message: e.message ?? 'Permintaan ditolak' });
  });
}
