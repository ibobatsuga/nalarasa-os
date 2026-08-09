import type { FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { runAsSystem, withTenant } from './tenant.js';
import { expireOverdue } from '../approval/approval.service.js';

const INTERVAL_MS = 5 * 60_000;

/**
 * Menyapu permintaan persetujuan yang lewat tenggat.
 *
 * `expireOverdue` sudah ada sejak awal, tapi tidak ada yang memanggilnya kecuali
 * satu endpoint manual — artinya di lapangan tidak ada permintaan yang pernah
 * kedaluwarsa, `dueAt` cuma hiasan, dan K-metrik umur persetujuan membaca nol
 * pelanggaran SLA selamanya. Kedaluwarsa TIDAK PERNAH menyetujui otomatis: ia
 * menutup permintaan supaya eskalasinya terlihat.
 *
 * Penyapuan berjalan per tenant karena guard baris menyaring setiap query
 * dengan tenantId; satu updateMany global tidak akan menyentuh siapa pun.
 */
export function startScheduler(app: FastifyInstance): void {
  let berjalan = false;

  const sapu = async (): Promise<void> => {
    if (berjalan) return; // sapuan lambat tidak boleh menumpuk
    berjalan = true;
    try {
      const tenants = await runAsSystem(() => prisma.tenant.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, slug: true },
      }));
      let total = 0;
      for (const t of tenants) {
        try {
          total += await withTenant({ tenantId: t.id, slug: t.slug }, () => expireOverdue());
        } catch (err) {
          // Satu tenant bermasalah tidak boleh menghentikan sapuan tenant lain.
          app.log.error({ err, tenant: t.slug }, 'gagal menyapu persetujuan kedaluwarsa');
        }
      }
      if (total > 0) app.log.info({ expired: total, tenants: tenants.length }, 'persetujuan kedaluwarsa ditutup');
    } catch (err) {
      app.log.error({ err }, 'penyapu persetujuan gagal total');
    } finally {
      berjalan = false;
    }
  };

  const timer = setInterval(() => void sapu(), INTERVAL_MS);
  timer.unref(); // jangan tahan proses tetap hidup saat shutdown
  app.addHook('onClose', async () => { clearInterval(timer); });
  void sapu(); // sapuan pertama saat boot, bukan lima menit kemudian
}
