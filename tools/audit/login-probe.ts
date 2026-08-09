import { prisma } from '../../src/core/db.js';
import { runAsSystem, withTenant } from '../../src/core/tenant.js';
import { login } from '../../src/iam/auth.js';

/** Memastikan jalur sandi benar-benar dieksekusi sebelum menilai waktunya. */
async function main(): Promise<void> {
  const t = await runAsSystem(
    () => prisma.tenant.findUniqueOrThrow({ where: { slug: 'horison-emerald' } }),
  );
  const ctx = { tenantId: t.id, slug: t.slug };

  await withTenant(ctx, async () => {
    const u = await prisma.user.findFirst({
      where: { subjectId: 'u.cfo' },
      include: { credential: true },
    });
    process.stdout.write(
      `user u.cfo      : ${u ? u.id : 'TIDAK ADA'}\n` +
      `status          : ${u?.status}\n` +
      `punya kredensial: ${u?.credential ? 'ya' : 'TIDAK'}\n` +
      `gagal berturut  : ${u?.credential?.failedCount ?? '-'}\n` +
      `terkunci sampai : ${u?.credential?.lockedUntil ?? '-'}\n`,
    );
  });

  // Sandi benar: kalau ini berhasil, scrypt pasti dijalankan.
  const a = process.hrtime.bigint();
  const hasil = await withTenant(ctx, () => login('u.cfo', 'ubah-password-ini-2026')
    .then((r) => `BERHASIL, token ${r.token.slice(0, 8)}…`)
    .catch((e: Error & { code?: string }) => `DITOLAK ${e.code}`));
  process.stdout.write(`login sandi benar: ${hasil} (${(Number(process.hrtime.bigint() - a) / 1e6).toFixed(1)} ms)\n`);

  await prisma.$disconnect();
}

void main();
