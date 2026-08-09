import { z } from 'zod';
import type { ApprovalStatus } from '@prisma/client';
import { prisma, type Tx } from '../core/db.js';
import { audit } from '../core/audit.js';
import { versionHash as hashOf } from '../core/hash.js';
import { ControlError, DenySelfApproval, DenyStaleVersion } from '../core/errors.js';
import type { Actor, AuthorityBand, Decision } from '../core/types.js';
import { assertBand, assertCan, roleFor } from '../iam/rbac.js';
import { resolveBand, type BandContext } from './band.js';
import { REASON_CODES } from '../config/approval-families.js';

export const DecisionInput = z.object({
  requestId: z.string(),
  decision: z.enum(['APPROVE', 'REJECT', 'REQUEST_CHANGE', 'DELEGATE']),
  reasonCode: z.string().min(2),
  reason: z.string().max(2000).optional(),
  versionHash: z.string(),
  delegateTo: z.string().optional(),
});
export type DecisionInput = z.infer<typeof DecisionInput>;

export interface RequestInput extends BandContext {
  familyCode: string;
  docType: string;
  docId: string;
  payload: Record<string, unknown>;
  companyId?: string;
  currency?: string;
  actor: Actor;
  /**
   * Pemilik dokumen, kalau berbeda dari pemanggil. Perubahan rekening vendor
   * diajukan oleh verifikator, padahal yang tidak boleh menyetujui adalah orang
   * yang membuat rekening itu. Tanpa ini, larangan swa-persetujuan mengunci
   * orang yang salah.
   */
  makerId?: string;
}

export interface RequestResult {
  approvalId: string | null;
  band: AuthorityBand;
  quorum: number;
  status: 'AUTO_APPROVED' | 'PENDING';
  versionHash: string;
  drivers: string[];
  calibration: { version: string; hash: string };
}

/**
 * Opens an approval request. T0 needs no approver: system validation + maker
 * accountability, still audited and still version-hashed.
 */
export async function requestApproval(input: RequestInput, tx: Tx = prisma): Promise<RequestResult> {
  const { band, quorum, family, drivers, calibration } = resolveBand(input.familyCode, {
    amount: input.amount ?? null,
    percent: input.percent,
    classes: input.classes,
    legal: input.legal,
    siteCode: input.siteCode,
    at: input.at ?? new Date(),
    flags: input.flags ?? {},
  });
  const vh = hashOf({ docType: input.docType, docId: input.docId, payload: input.payload });
  // Peran maker hanya boleh diambil dari pemanggil kalau memang dialah makernya.
  const makerRole = (input.makerId && input.makerId !== input.actor.userId)
    ? 'DELEGATED' : (input.actor.roleCodes[0] ?? 'UNKNOWN');

  if (quorum === 0) {
    await audit({
      actor: input.actor, action: `${family.code}.auto_approved`, docType: input.docType,
      docId: input.docId, toStatus: 'APPROVED', reasonCode: 'T0_SYSTEM_VALIDATION',
      versionHash: vh, meta: { band, drivers, calibration },
    }, tx);
    return { approvalId: null, band, quorum, status: 'AUTO_APPROVED', versionHash: vh, drivers, calibration };
  }

  const due = family.slaHours ? new Date(Date.now() + family.slaHours * 3_600_000) : null;
  const req = await tx.approvalRequest.create({
    data: {
      familyCode: family.code, band, requiredCount: quorum,
      docType: input.docType, docId: input.docId,
      companyId: input.companyId ?? null,
      amount: input.amount ?? null, currency: input.currency ?? null,
      payload: input.payload as object, versionHash: vh,
      makerId: input.makerId ?? input.actor.userId, makerRole, dueAt: due,
      calibrationVersion: calibration.version, calibrationHash: calibration.hash,
      bandDrivers: drivers,
    },
  });

  await audit({
    actor: input.actor, action: `${family.code}.requested`, docType: input.docType,
    docId: input.docId, toStatus: 'SUBMITTED', versionHash: vh,
    meta: { approvalId: req.id, band, quorum, drivers, calibration },
  }, tx);

  return { approvalId: req.id, band, quorum, status: 'PENDING', versionHash: vh, drivers, calibration };
}

/**
 * Records one decision. Enforces: version binding, no self-approval,
 * function grant, band ceiling, and independence between T4 approvers.
 */
export async function decide(input: DecisionInput, actor: Actor, tx: Tx = prisma) {
  // Kuorum T4 butuh dua penyetuju. Tanpa kunci baris, keduanya membaca
  // "baru 0 setuju", keduanya menyimpulkan kuorum belum tercapai, dan permintaan
  // yang sebenarnya sudah disetujui penuh tertinggal PENDING selamanya.
  if (tx === prisma) return prisma.$transaction((t) => decideLocked(input, actor, t as Tx));
  return decideLocked(input, actor, tx);
}

async function decideLocked(input: DecisionInput, actor: Actor, tx: Tx) {
  // Kunci hanya menahan penyetuju lain pada permintaan yang sama; isinya tetap
  // dibaca lewat findUnique agar guard tenant ikut berlaku.
  await tx.$queryRaw`SELECT id FROM "ApprovalRequest" WHERE id = ${input.requestId} FOR UPDATE`;

  const req = await tx.approvalRequest.findUnique({ where: { id: input.requestId }, include: { decisions: true } });
  if (!req) throw new ControlError('NOT_FOUND', 'Approval request not found', 404);
  if (req.status !== 'PENDING') throw new ControlError('NOT_PENDING', `Request already ${req.status}`, 409);
  if (req.versionHash !== input.versionHash) throw DenyStaleVersion(req.versionHash, input.versionHash);

  const family = (await import('./band.js')).familyOf(req.familyCode);
  const roleCode = assertCan(actor, family.approveFn);
  const band = assertBand(actor, req.band as AuthorityBand);

  if (actor.userId === req.makerId) throw DenySelfApproval(req.docId, actor.userId);
  if (req.decisions.some((d) => d.actorId === actor.userId)) {
    throw new ControlError('DUPLICATE_DECISION', 'Actor already decided this version', 409);
  }
  // T4 dual control: the two approvers must be independent (distinct role too).
  if (req.band === 'T4' && req.decisions.some((d) => d.roleCode === roleCode)) {
    throw new ControlError('DUAL_CONTROL', 'Second T4 approver must hold a different role', 403, { roleCode });
  }
  assertReasonCode(input.decision, input.reasonCode);
  if (input.decision === 'DELEGATE' && !input.delegateTo) {
    throw new ControlError('DELEGATE_TARGET_REQUIRED', 'delegateTo is mandatory', 400);
  }

  await tx.approvalDecision.create({
    data: {
      requestId: req.id, actorId: actor.userId, roleCode, band,
      decision: input.decision as Decision, reasonCode: input.reasonCode,
      reason: input.reason ?? null, versionHash: input.versionHash,
      delegateTo: input.delegateTo ?? null,
    },
  });

  // Dihitung ulang dari basis data setelah insert, bukan dari snapshot pra-baca.
  const approvals = await tx.approvalDecision.count({
    where: { requestId: req.id, decision: 'APPROVE' },
  });

  let status: ApprovalStatus = req.status;
  if (input.decision === 'REJECT') status = 'REJECTED';
  else if (input.decision === 'REQUEST_CHANGE') status = 'CHANGE_REQUESTED';
  else if (input.decision === 'APPROVE' && approvals >= req.requiredCount) status = 'APPROVED';

  if (status !== req.status) {
    await tx.approvalRequest.update({
      where: { id: req.id },
      data: { status, closedAt: new Date() }, // status left PENDING only when unchanged
    });
  }

  await audit({
    actor, roleCode, action: `${req.familyCode}.${input.decision.toLowerCase()}`,
    docType: req.docType, docId: req.docId, fromStatus: req.status, toStatus: status,
    reasonCode: input.reasonCode, versionHash: input.versionHash,
    meta: { approvalId: req.id, band, approvals, requiredCount: req.requiredCount, delegateTo: input.delegateTo ?? null },
  }, tx);

  return { requestId: req.id, status, approvals, requiredCount: req.requiredCount, band };
}

function assertReasonCode(decision: string, code: string): void {
  const allowed = REASON_CODES[decision as keyof typeof REASON_CODES] as readonly string[] | undefined;
  if (!allowed?.includes(code)) {
    throw new ControlError('INVALID_REASON_CODE', `Reason code "${code}" invalid for ${decision}`, 400, { allowed });
  }
}

/** Gate used by every `execute` transition. */
export async function assertApproved(
  docType: string, docId: string, versionHash: string, tx: Tx = prisma,
): Promise<void> {
  const ok = await tx.approvalRequest.findFirst({
    where: { docType, docId, versionHash, status: 'APPROVED' },
    select: { id: true },
  });
  if (!ok) throw new ControlError('NOT_APPROVED', 'No approved request for this document version', 409, { docType, docId, versionHash });
}

/** Timeout never auto-approves — it expires and escalates. */
export async function expireOverdue(tx: Tx = prisma): Promise<number> {
  const res = await tx.approvalRequest.updateMany({
    where: { status: 'PENDING', dueAt: { lt: new Date() } },
    data: { status: 'EXPIRED', closedAt: new Date() },
  });
  return res.count;
}
