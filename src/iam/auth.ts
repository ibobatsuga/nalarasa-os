import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from '../core/db.js';
import { audit } from '../core/audit.js';
import { ControlError } from '../core/errors.js';
import type { Actor } from '../core/types.js';

const scryptAsync = promisify(scrypt);

const SESSION_TTL_MS = 12 * 3_600_000;   // one shift
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;
const MIN_LENGTH = 12;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** Garam tetap untuk pekerjaan boneka; tidak pernah cocok dengan kredensial mana pun. */
const DUMMY_SALT = 'nalarasa-os-timing-equaliser-salt';

async function derive(password: string, salt: string): Promise<string> {
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return buf.toString('hex');
}

/** Password policy is deliberately boring: length beats complexity theatre. */
export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_LENGTH) {
    throw new ControlError('WEAK_PASSWORD', `Minimum ${MIN_LENGTH} characters`, 400);
  }
  if (/^(.)\1+$/.test(password)) throw new ControlError('WEAK_PASSWORD', 'Repeated character', 400);
}

export async function setPassword(userId: string, password: string, mustChange = false): Promise<void> {
  assertPasswordPolicy(password);
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt);
  await prisma.credential.upsert({
    where: { userId },
    create: { userId, hash, salt, mustChange },
    update: { hash, salt, mustChange, failedCount: 0, lockedUntil: null, rotatedAt: new Date() },
  });
}

export interface LoginResult {
  token: string;
  expiresAt: Date;
  mustChange: boolean;
  actor: Actor;
}

export async function login(
  subjectId: string, password: string, meta: { ip?: string; userAgent?: string } = {},
): Promise<LoginResult> {
  // Tenant comes from the request context; subjectId is unique per tenant only.
  const user = await prisma.user.findFirst({
    where: { subjectId },
    include: { credential: true, roles: { include: { role: true } } },
  });
  // Uniform failure: never reveal whether the subject exists.
  const fail = () => new ControlError('INVALID_CREDENTIALS', 'Invalid credentials', 401);
  if (!user || !user.credential || user.status !== 'ACTIVE') {
    // Pesannya memang seragam, tapi WAKTUNYA tidak: pulang di sini melewatkan
    // scrypt sepenuhnya, jadi subjek asing terjawab ~60 ms lebih cepat daripada
    // subjek nyata. Selisih sebesar itu cukup untuk mendaftar seluruh karyawan
    // sebuah tenant tanpa pernah menebak satu sandi pun. Kerjakan KDF yang sama
    // atas garam boneka supaya kedua jalur memakan waktu yang sama.
    await derive(password, DUMMY_SALT);
    throw fail();
  }

  const cred = user.credential;
  if (cred.lockedUntil && cred.lockedUntil > new Date()) {
    throw new ControlError('ACCOUNT_LOCKED', 'Account temporarily locked', 423, { until: cred.lockedUntil });
  }

  const candidate = Buffer.from(await derive(password, cred.salt), 'hex');
  const stored = Buffer.from(cred.hash, 'hex');
  const ok = candidate.length === stored.length && timingSafeEqual(candidate, stored);

  if (!ok) {
    const failedCount = cred.failedCount + 1;
    await prisma.credential.update({
      where: { userId: user.id },
      data: { failedCount, lockedUntil: failedCount >= MAX_FAILED ? new Date(Date.now() + LOCK_MS) : null },
    });
    await audit({
      actor: { userId: user.id, roleCodes: [] }, action: 'auth.login_failed',
      docType: 'User', docId: user.id, meta: { failedCount, ip: meta.ip ?? null },
    });
    throw fail();
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.$transaction([
    prisma.credential.update({ where: { userId: user.id }, data: { failedCount: 0, lockedUntil: null } }),
    prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null },
    }),
  ]);

  const actor: Actor = {
    userId: user.id,
    roleCodes: activeRoleCodes(user.roles),
  };
  await audit({ actor, action: 'auth.login', docType: 'User', docId: user.id, meta: { ip: meta.ip ?? null } });
  return { token, expiresAt, mustChange: cred.mustChange, actor };
}

type RoleRow = { revokedAt: Date | null; validTo: Date | null; role: { code: string; status: string } };

const activeRoleCodes = (rows: RoleRow[]): string[] =>
  rows.filter((r) => !r.revokedAt && (!r.validTo || r.validTo > new Date()) && r.role.status === 'ACTIVE')
    .map((r) => r.role.code);

/** Resolves a bearer token to an Actor. Expired or revoked sessions are refused. */
export async function actorFromToken(token: string, companyId?: string, siteId?: string): Promise<Actor> {
  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new ControlError('SESSION_INVALID', 'Session expired or revoked', 401);
  }
  if (session.user.status !== 'ACTIVE') throw new ControlError('USER_INACTIVE', 'User is not active', 401);
  return {
    userId: session.user.id,
    roleCodes: activeRoleCodes(session.user.roles),
    companyId, siteId,
  };
}

export async function logout(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const res = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}
