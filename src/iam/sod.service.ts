import { CHAIN_INDEX, SOD_RULES, type SodRule } from '../config/sod.js';
import { ROLES } from '../config/roles.js';
import { grantsOf } from './rbac.js';
import { actorsOf } from '../core/audit.js';
import { prisma, type Tx } from '../core/db.js';
import { DenySod } from '../core/errors.js';
import type { Actor } from '../core/types.js';

export interface SodFinding {
  ruleId: string;
  scope: 'STATIC' | 'DYNAMIC';
  detail: Record<string, unknown>;
}

const hit = (fns: Set<string>, side: readonly string[]) => side.filter((f) => fns.has(f));

/** Static analysis of a role-set (used at assignment time and for K05/K63). */
export function evaluateRoleSet(roleCodes: readonly string[]): SodFinding[] {
  const fns = new Set<string>();
  for (const rc of roleCodes) for (const f of grantsOf(rc)) fns.add(f);
  const findings: SodFinding[] = [];
  for (const rule of SOD_RULES) {
    const a = hit(fns, rule.sideA);
    const b = hit(fns, rule.sideB);
    if (a.length && b.length) {
      findings.push({ ruleId: rule.id, scope: 'STATIC', detail: { roleCodes: [...roleCodes], sideA: a, sideB: b, mitigation: rule.mitigation } });
    }
  }
  return findings;
}

/** Every single role is checked once at boot — a toxic role is a design defect. */
export function selfCheckRoleCatalogue(): SodFinding[] {
  return ROLES.flatMap((r) =>
    evaluateRoleSet([r.code]).map((f) => ({ ...f, detail: { ...f.detail, roleCode: r.code } })),
  );
}

/**
 * Runtime chain check: the actor about to perform `action` must not be an actor
 * of any conflicting prior action on the SAME document.
 */
export async function assertChain(
  actor: Actor,
  docType: string,
  docId: string,
  action: string,
  segregateFrom: readonly string[],
  tx: Tx = prisma,
): Promise<string[]> {
  if (segregateFrom.length === 0) return [];
  const prior = await actorsOf(docType, docId, segregateFrom, tx);
  const applied: string[] = [];
  for (const [priorAction, actorIds] of prior) {
    if (!actorIds.includes(actor.userId)) { applied.push(priorAction); continue; }
    const ruleId = CHAIN_INDEX.get(`${docType}:${priorAction}:${action}`) ?? 'SOD00';
    // Sengaja tidak menulis apa pun di sini. Lemparan ini me-rollback transaksi
    // pemanggil — catatan yang ditulis di dalamnya ikut lenyap, dan menulisnya
    // lewat koneksi lain justru saling mengunci dengan transaksi yang masih
    // terbuka. `recordingSodViolations` yang mencatatnya setelah rollback usai.
    throw DenySod(ruleId, { docType, docId, action, priorAction, actorId: actor.userId });
  }
  return applied;
}

/**
 * Accepts an unavoidable role overlap with a written mitigation.
 *
 * In a warung the owner IS the bookkeeper — separating 51 roles across 8 people
 * is arithmetic, not policy. What CAN still be separated is the two ends of a
 * single document, and `assertChain` keeps enforcing that untouched. This path
 * only relaxes the STATIC role overlap, and never silently: the conflict is
 * recorded as ACCEPTED with a named approver and a reason, so K63 counts it as
 * mitigated rather than pretending it does not exist.
 */
export async function acceptConflicts(
  userId: string, findings: SodFinding[], mitigation: string, approvedBy: string, tx: Tx = prisma,
): Promise<void> {
  for (const f of findings) {
    await tx.sodConflict.create({
      data: {
        ruleId: f.ruleId, scope: f.scope, subjectId: userId,
        detail: { ...f.detail, mitigation, approvedBy } as object,
        status: 'ACCEPTED', mitigation, approvedBy,
      },
    });
  }
}

/**
 * Menjalankan `fn`; kalau rantai SoD menolaknya, pelanggaran dicatat SETELAH
 * transaksi pemanggil selesai di-rollback. Bukti pelanggaran harus bertahan
 * justru ketika aksinya dibatalkan — tapi menulisnya di tengah transaksi yang
 * sedang di-rollback tidak mungkin, dan dari koneksi terpisah berarti deadlock.
 */
export async function recordingSodViolations<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as { code?: string; detail?: Record<string, unknown> };
    const docId = err.detail?.docId;
    if (err.code === 'SOD_VIOLATION' && typeof docId === 'string') {
      await recordConflict(String(err.detail?.ruleId ?? 'SOD00'), 'DYNAMIC', docId, err.detail ?? {});
    }
    throw e;
  }
}

export async function recordConflict(
  ruleId: string,
  scope: 'STATIC' | 'DYNAMIC',
  subjectId: string,
  detail: Record<string, unknown>,
  tx: Tx = prisma,
): Promise<void> {
  await tx.sodConflict.create({ data: { ruleId, scope, subjectId, detail: detail as object } });
}

/** Persist static findings for a user; used by role-assignment and recertification. */
export async function syncUserConflicts(userId: string, roleCodes: string[], tx: Tx = prisma): Promise<SodFinding[]> {
  const findings = evaluateRoleSet(roleCodes);
  await tx.sodConflict.updateMany({
    where: { subjectId: userId, scope: 'STATIC', status: 'OPEN' },
    data: { status: 'CLOSED', closedAt: new Date() },
  });
  for (const f of findings) await recordConflict(f.ruleId, 'STATIC', userId, f.detail, tx);
  return findings;
}

export const ruleOf = (id: string): SodRule | undefined => SOD_RULES.find((r) => r.id === id);
