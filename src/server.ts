import { createHash } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerContext } from './http/context.js';
import { registerRoutes } from './http/routes.js';
import { selfCheckRoleCatalogue } from './iam/sod.service.js';
import { startScheduler } from './core/scheduler.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

/**
 * Batas laju dasar seluruh permukaan API.
 *
 * Kuncinya BUKAN alamat IP. Sebuah kafe menjalankan tiga mesin kasir, layar
 * dapur, dan ponsel karyawan di balik satu sambungan internet — dengan kunci
 * per-IP, seluruh outlet berbagi satu jatah dan mesin kasir berhenti menerima
 * pembaruan menu justru saat outlet paling ramai. Uji beban mengonfirmasinya:
 * 600 permintaan campuran dari satu alamat sudah menyentuh ambang.
 *
 * Karena itu kuncinya adalah token pembawa bila ada, dan IP hanya untuk lalu
 * lintas anonim — di mana batas ketat memang yang diinginkan.
 */
await app.register(rateLimit, {
  max: 600,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      // Token di-hash: kunci ini masuk ke penyimpanan internal dan log galat.
      return createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32);
    }
    return req.ip;
  },
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
