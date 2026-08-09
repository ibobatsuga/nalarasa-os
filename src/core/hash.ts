import { createHash, createHmac } from 'node:crypto';

/** Deterministic JSON: sorted keys, Decimal/Date normalised to string. */
export function canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof (o as { toFixed?: unknown }).toFixed === 'function') return String(v); // Prisma.Decimal
      return Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = walk(o[k]);
        return acc;
      }, {});
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/** Version hash bound to every approval decision and audit event. */
export const versionHash = (payload: unknown): string =>
  createHash('sha256').update(canonical(payload)).digest('hex').slice(0, 32);

/** MD20 — bank account tokenisation. Raw number is never persisted. */
export function tokenizeAccount(accountNo: string, secret = process.env.BANK_TOKEN_SECRET ?? ''): {
  token: string;
  masked: string;
} {
  if (!secret) throw new Error('BANK_TOKEN_SECRET is required');
  const clean = accountNo.replace(/\s+/g, '');
  return {
    token: createHmac('sha256', secret).update(clean).digest('hex'),
    masked: clean.length <= 4 ? '*'.repeat(clean.length) : `${'*'.repeat(clean.length - 4)}${clean.slice(-4)}`,
  };
}
