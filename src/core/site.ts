import { prisma } from './db.js';

const cache = new Map<string, string>();

/** Site codes drive the calibration overrides; ids drive the data model. */
export async function siteCodeOf(siteId?: string | null): Promise<string | undefined> {
  if (!siteId) return undefined;
  const hit = cache.get(siteId);
  if (hit) return hit;
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { code: true } });
  if (!site) return undefined;
  cache.set(siteId, site.code);
  return site.code;
}
