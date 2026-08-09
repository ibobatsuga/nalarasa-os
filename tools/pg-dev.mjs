/**
 * Postgres nyata untuk pengujian, tanpa Docker.
 *
 * PGlite adalah Postgres asli yang dikompilasi ke WASM; `pglite-socket`
 * membukanya di TCP dengan protokol wire Postgres, sehingga Prisma
 * menyambunginya seperti server biasa. Ini BUKAN mock — query, transaksi,
 * constraint, dan unique index dijalankan mesin Postgres sungguhan.
 *
 *   node tools/pg-dev.mjs            # data di memori
 *   PGDATA=./.pgdata node tools/pg-dev.mjs   # data menetap
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const db = await PGlite.create(process.env.PGDATA ?? undefined);
const server = new PGLiteSocketServer({
  db, port: 5432, host: '127.0.0.1',
  // Default maxConnections adalah 1. Prisma membuka koneksi terpisah untuk
  // transaksi interaktif, dan proses yang mati mendadak meninggalkan slot
  // menggantung sampai 60 detik — klien berikutnya tampak "server mati".
  maxConnections: 24,
  // Reap handler yatim; tanpa ini slot bocor tiap kali proses uji berhenti.
  idleTimeout: 30_000,
});
server.addEventListener('error', (e) => {
  process.stderr.write(`pglite socket error: ${e.detail?.message ?? e}\n`);
});
await server.start();
process.stdout.write(`postgres (pglite) siap di 127.0.0.1:5432${process.env.PGDATA ? ` — data di ${process.env.PGDATA}` : ' — di memori'}\n`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await server.stop(); await db.close(); process.exit(0); });
}
