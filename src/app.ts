import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerContext } from './http/context.js';
import { registerRoutes } from './http/routes.js';
import { selfCheckRoleCatalogue } from './iam/sod.service.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        return createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32);
      }
      return req.ip;
    },
    allowList: (req) => req.url.startsWith('/pos/sync') || req.url.startsWith('/api/pos/sync'),
  });

  registerContext(app);
  await registerRoutes(app);

  // Juga daftarkan dengan prefix /api agar pemanggil langsung dengan /api/* tetap dilayani
  await app.register(async (sub) => {
    registerContext(sub);
    await registerRoutes(sub);
  }, { prefix: '/api' });

  const toxic = selfCheckRoleCatalogue();
  if (toxic.length > 0) {
    app.log.error({ toxic }, 'Toxic role definitions detected in role catalogue');
    throw new Error(`Role catalogue violates SoD: ${toxic.map((t) => `${t.detail.roleCode}/${t.ruleId}`).join(', ')}`);
  }

  return app;
}
