import { prisma, type Tx } from './db.js';
import { currentTenantId } from './tenant.js';

/** Human-readable document numbers: PRE-YYYYMM-000123 (atomic per key). */
export async function nextDocNo(prefix: string, tx: Tx = prisma, at = new Date()): Promise<string> {
  const ym = `${at.getUTCFullYear()}${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${ym}`;
  const seq = await tx.docSequence.upsert({
    where: { tenantId_key: { tenantId: currentTenantId(), key } },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(seq.value).padStart(6, '0')}`;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const ratio = (num: number, den: number): number => (den === 0 ? 0 : num / den);
export const num = (v: unknown): number => Number(v ?? 0);
