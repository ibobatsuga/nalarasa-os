import { prisma } from '../../src/core/db.js';
import { runAsSystem, withTenant } from '../../src/core/tenant.js';
import { login } from '../../src/iam/auth.js';

/**
 * Mengukur oracle waktu pada login.
 *
 * Kalau menebak subjectId yang tidak ada jauh lebih cepat daripada menebak
 * subjectId nyata dengan sandi salah, penyerang bisa mendaftar siapa saja yang
 * punya akun tanpa pernah menebak satu sandi pun. Selisihnya harus tenggelam
 * dalam derau — bukan puluhan milidetik.
 *
 *   node --env-file=.env --import tsx tools/audit/timing.ts
 */
async function main(): Promise<void> {
  const t = await runAsSystem(
    () => prisma.tenant.findUniqueOrThrow({ where: { slug: 'horison-emerald' } }),
  );

  const ctx = { tenantId: t.id, slug: t.slug };

  // Lima kegagalan mengunci akun, dan login yang terkunci pulang SEBELUM scrypt.
  // Tanpa reset ini pengukuran hanya merekam jalur terkunci, bukan jalur sandi.
  const bukaKunci = (subject: string) => withTenant(ctx, () =>
    prisma.credential.updateMany({
      where: { user: { subjectId: subject } },
      data: { failedCount: 0, lockedUntil: null },
    }));

  const ukur = async (subject: string, n = 15): Promise<number> => {
    const s: number[] = [];
    for (let i = 0; i < n; i++) {
      await bukaKunci(subject);                       // di luar wilayah terukur
      const a = process.hrtime.bigint();
      await withTenant(ctx, () => login(subject, 'sandi-yang-pasti-salah-123').catch(() => null));
      s.push(Number(process.hrtime.bigint() - a) / 1e6);
    }
    s.sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)]!; // median, tahan terhadap pencilan
  };

  await ukur('u.cfo', 3); // pemanasan: JIT dan cache koneksi

  const asing = await ukur('u.tidak.ada.sama.sekali');
  const nyata = await ukur('u.cfo');
  const rasio = nyata / asing;

  process.stdout.write(
    `subjek tidak ada : ${asing.toFixed(1)} ms\n` +
    `subjek nyata     : ${nyata.toFixed(1)} ms\n` +
    `selisih          : ${(nyata - asing).toFixed(1)} ms (rasio ${rasio.toFixed(2)}x)\n` +
    `putusan          : ${rasio > 1.5 || nyata - asing > 15 ? 'BOCOR — subjectId bisa dienumerasi' : 'aman'}\n`,
  );

  await prisma.$disconnect();
}

void main();
