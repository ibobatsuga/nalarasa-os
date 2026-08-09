import { randomBytes } from 'node:crypto';
import { prisma, type Tx } from '../core/db.js';
import { audit } from '../core/audit.js';
import { ControlError, DenySod } from '../core/errors.js';
import type { Actor } from '../core/types.js';
import { assertCan, isPrivileged } from './rbac.js';
import { acceptConflicts, evaluateRoleSet, syncUserConflicts } from './sod.service.js';
import { runAsSystem } from '../core/tenant.js';
import { requestApproval } from '../approval/approval.service.js';
import { setPassword, revokeAllSessions } from './auth.js';

/**
 * Joiner–Mover–Leaver. Access is a consequence of employment state, never a
 * standing favour. Every grant is role-based, approved, and time-bounded;
 * every leaver is revoked in one transaction (K48).
 */

/**
 * Under STRICT the overlap is refused. Under SMALL_BUSINESS it is accepted, but
 * only with a written mitigation naming the compensating control — for example
 * "pemilik mereview laporan kas harian" or "approval kedua oleh supervisor
 * Nalarasa". No mitigation, no assignment.
 */
async function guardRoleSet(
  roleCodes: string[], mitigation: string | undefined,
): Promise<{ findings: ReturnType<typeof evaluateRoleSet>; accept: boolean }> {
  const findings = evaluateRoleSet(roleCodes);
  if (findings.length === 0) return { findings, accept: false };

  const tenant = await runAsSystem(() =>
    prisma.tenant.findFirst({ select: { sodPolicy: true } }));

  if (tenant?.sodPolicy !== 'SMALL_BUSINESS') {
    throw DenySod(findings[0]!.ruleId, { roleCodes, conflicts: findings });
  }
  if (!mitigation || mitigation.trim().length < 10) {
    throw new ControlError(
      'MITIGATION_REQUIRED',
      'Peran bertabrakan boleh diterima, tapi mitigasi tertulis wajib diisi',
      400,
      { conflicts: findings.map((f) => ({ rule: f.ruleId, detail: f.detail })) },
    );
  }
  return { findings, accept: true };
}

export interface JoinerInput {
  subjectId: string;
  displayName: string;
  email?: string;
  employeeNo?: string;
  department?: string;
  companyId: string;
  siteId?: string;
  roleCodes: string[];
  joinedAt?: Date;
  /// Wajib ketika peran yang diminta bertabrakan dan tenant memakai SMALL_BUSINESS.
  sodMitigation?: string;
}

/** Refuses to create a user whose role set is already toxic. */
export async function joiner(actor: Actor, input: JoinerInput) {
  assertCan(actor, 'role.admin');
  const { findings, accept } = await guardRoleSet(input.roleCodes, input.sodMitigation);

  const privileged = input.roleCodes.some(isPrivileged);
  const tempPassword = randomBytes(12).toString('base64url');

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        subjectId: input.subjectId, displayName: input.displayName,
        email: input.email ?? null, employeeNo: input.employeeNo ?? null,
        department: input.department ?? null, joinedAt: input.joinedAt ?? new Date(),
      },
    });
    await grantRoles(tx, actor, user.id, input.roleCodes, input.companyId, input.siteId);
    const approval = await requestApproval({
      familyCode: 'AR26', docType: 'UserRole', docId: user.id,
      companyId: input.companyId,
      flags: { privileged },
      payload: { subjectId: input.subjectId, roleCodes: input.roleCodes, department: input.department ?? null },
      actor,
    }, tx);
    await audit({
      actor, action: 'jml.joiner', docType: 'User', docId: user.id, toStatus: 'ACTIVE',
      versionHash: approval.versionHash, meta: { roleCodes: input.roleCodes, privileged },
    }, tx);
    return { user, approval };
  });

  await setPassword(result.user.id, tempPassword, true);
  if (accept) {
    await acceptConflicts(result.user.id, findings, input.sodMitigation!, actor.userId);
  } else {
    await syncUserConflicts(result.user.id, input.roleCodes);
  }
  return { ...result, tempPassword, acceptedConflicts: accept ? findings.map((f) => f.ruleId) : [] };
}

export interface MoverInput {
  userId: string;
  addRoles?: string[];
  removeRoles?: string[];
  department?: string;
  companyId: string;
  siteId?: string;
  sodMitigation?: string;
}

/** A move REPLACES authority. Old roles are revoked, not accumulated. */
export async function mover(actor: Actor, input: MoverInput) {
  assertCan(actor, 'role.admin');
  const current = await prisma.userRole.findMany({
    where: { userId: input.userId, revokedAt: null },
    include: { role: true },
  });
  const currentCodes = current.map((r) => r.role.code);
  const next = [
    ...currentCodes.filter((c) => !(input.removeRoles ?? []).includes(c)),
    ...(input.addRoles ?? []),
  ];
  const unique = [...new Set(next)];

  const { findings, accept } = await guardRoleSet(unique, input.sodMitigation);
  const privileged = unique.some(isPrivileged);

  return prisma.$transaction(async (tx) => {
    for (const code of input.removeRoles ?? []) {
      const row = current.find((r) => r.role.code === code);
      if (row) await tx.userRole.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    }
    await grantRoles(tx, actor, input.userId, input.addRoles ?? [], input.companyId, input.siteId);
    if (input.department) {
      await tx.user.update({ where: { id: input.userId }, data: { department: input.department } });
    }
    const approval = await requestApproval({
      familyCode: 'AR26', docType: 'UserRole', docId: input.userId,
      companyId: input.companyId, flags: { privileged },
      payload: { before: currentCodes, after: unique }, actor,
    }, tx);
    await audit({
      actor, action: 'jml.mover', docType: 'User', docId: input.userId,
      versionHash: approval.versionHash, meta: { before: currentCodes, after: unique },
    }, tx);
    if (accept) await acceptConflicts(input.userId, findings, input.sodMitigation!, actor.userId, tx);
    else await syncUserConflicts(input.userId, unique, tx);
    return { userId: input.userId, roleCodes: unique, approval, acceptedConflicts: accept ? findings.map((f) => f.ruleId) : [] };
  });
}

/**
 * Leaver. One transaction: roles revoked, sessions killed, credential locked.
 * `accessRevokedAt − terminatedAt` is the K48 measurement.
 */
export async function leaver(actor: Actor, userId: string, terminatedAt?: Date) {
  assertCan(actor, 'role.admin');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ControlError('NOT_FOUND', 'User not found', 404);
  const revokedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const roles = await tx.userRole.updateMany({
      where: { userId, revokedAt: null }, data: { revokedAt },
    });
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        status: 'ARCHIVED',
        terminatedAt: terminatedAt ?? user.terminatedAt ?? revokedAt,
        accessRevokedAt: revokedAt,
      },
    });
    await tx.credential.updateMany({
      where: { userId }, data: { lockedUntil: new Date('2999-12-31'), mustChange: true },
    });
    await tx.sodConflict.updateMany({
      where: { subjectId: userId, scope: 'STATIC', status: 'OPEN' },
      data: { status: 'CLOSED', closedAt: revokedAt },
    });
    await audit({
      actor, action: 'jml.leaver', docType: 'User', docId: userId,
      fromStatus: user.status, toStatus: 'ARCHIVED',
      meta: { rolesRevoked: roles.count, terminatedAt: updated.terminatedAt, accessRevokedAt: revokedAt },
    }, tx);
    return { rolesRevoked: roles.count, user: updated };
  });

  const sessions = await revokeAllSessions(userId);
  return { ...result, sessionsRevoked: sessions };
}

/** Quarterly access recertification (K62). Reviewer must not be the role holder. */
export async function recertify(actor: Actor, userId: string, keepRoleCodes: string[], reasonCode: string) {
  assertCan(actor, 'role.approve');
  if (actor.userId === userId) throw DenySod('SOD11', { userId, reason: 'self-recertification' });
  const current = await prisma.userRole.findMany({ where: { userId, revokedAt: null }, include: { role: true } });
  const drop = current.filter((r) => !keepRoleCodes.includes(r.role.code));

  return prisma.$transaction(async (tx) => {
    for (const r of drop) await tx.userRole.update({ where: { id: r.id }, data: { revokedAt: new Date() } });
    await audit({
      actor, action: 'jml.recertify', docType: 'User', docId: userId, reasonCode,
      meta: { kept: keepRoleCodes, dropped: drop.map((r) => r.role.code), reviewedAt: new Date() },
    }, tx);
    await syncUserConflicts(userId, keepRoleCodes, tx);
    return { userId, kept: keepRoleCodes, dropped: drop.map((r) => r.role.code) };
  });
}

async function grantRoles(
  tx: Tx, actor: Actor, userId: string, roleCodes: string[], companyId: string, siteId?: string,
) {
  for (const code of roleCodes) {
    const role = await tx.role.findUnique({ where: { code } });
    if (!role) throw new ControlError('UNKNOWN_ROLE', `Role ${code} not defined`, 400, { code });
    // Compound unique carries nullable columns, so match explicitly.
    const existing = await tx.userRole.findFirst({
      where: { userId, roleId: role.id, companyId, siteId: siteId ?? null },
    });
    if (existing) {
      await tx.userRole.update({ where: { id: existing.id }, data: { revokedAt: null, grantedBy: actor.userId } });
    } else {
      await tx.userRole.create({
        data: { userId, roleId: role.id, companyId, siteId: siteId ?? null, grantedBy: actor.userId },
      });
    }
  }
}
