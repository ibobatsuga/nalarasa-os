import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerContext } from './http/context.js';
import { registerRoutes } from './http/routes.js';
import { selfCheckRoleCatalogue } from './iam/sod.service.js';
import { startScheduler } from './core/scheduler.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Batas dasar seluruh permukaan API. Rute yang lebih peka menurunkannya sendiri
// lewat `config.rateLimit`. Kuncinya per-IP; till sebuah outlet berbagi satu IP,
// jadi ambangnya harus muat untuk seluruh perangkat di satu tempat usaha.
await app.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
  // Sinkronisasi POS menyusul antrean offline dalam satu ledakan; menolaknya
  // berarti transaksi yang sudah terjadi tidak pernah sampai ke pusat.
  allowList: (req) => req.url.startsWith('/pos/sync'),
});
registerContext(app);
await registerRoutes(app);

// A single role that carries both sides of an SoD rule is a design defect: fail fast.
const toxic = selfCheckRoleCatalogue();
if (toxic.length > 0) {
  app.log.error({ toxic }, 'Toxic role definitions detected in role catalogue');
  throw new Error(`Role catalogue violates SoD: ${toxic.map((t) => `${t.detail.roleCode}/${t.ruleId}`).join(', ')}`);
}

startScheduler(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
