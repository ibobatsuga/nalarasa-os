import type { Tx } from './db.js';
import { prisma } from './db.js';
import type { Actor } from './types.js';

export interface AuditInput {
  actor: Actor;
  roleCode?: string;
  action: string;
  docType: string;
  docId: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  reasonCode?: string | null;
  versionHash?: string | null;
  sodRuleIds?: string[];
  meta?: Record<string, unknown>;
}

/** Append-only. There is no update/delete path for AuditEvent anywhere. */
export async function audit(input: AuditInput, tx: Tx = prisma): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorId: input.actor.userId,
      roleCode: input.roleCode ?? input.actor.roleCodes[0] ?? null,
      action: input.action,
      docType: input.docType,
      docId: input.docId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      reasonCode: input.reasonCode ?? null,
      versionHash: input.versionHash ?? null,
      sodRuleIds: input.sodRuleIds ?? [],
      meta: (input.meta ?? {}) as object,
    },
  });
}

/** Distinct actors who performed `action` on a document — the SoD chain source. */
export async function actorsOf(
  docType: string,
  docId: string,
  actions: readonly string[],
  tx: Tx = prisma,
): Promise<Map<string, string[]>> {
  if (actions.length === 0) return new Map();
  const rows = await tx.auditEvent.findMany({
    where: { docType, docId, action: { in: [...actions] } },
    select: { action: true, actorId: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.action) ?? [];
    if (!list.includes(r.actorId)) list.push(r.actorId);
    map.set(r.action, list);
  }
  return map;
}
