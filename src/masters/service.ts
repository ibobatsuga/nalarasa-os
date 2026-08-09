import { prisma, type Tx } from '../core/db.js';
import { audit } from '../core/audit.js';
import { tokenizeAccount, versionHash } from '../core/hash.js';
import { ControlError, DenySelfApproval, DenySod } from '../core/errors.js';
import type { Actor } from '../core/types.js';
import { assertCan } from '../iam/rbac.js';
import { recordConflict } from '../iam/sod.service.js';
import { requestApproval } from '../approval/approval.service.js';
import { AccountSchema, BankAccountSchema, PartySchema, ProductSchema, UomSchema } from './schemas.js';
import type { z } from 'zod';

// ─── MD09 / MD10 party ────────────────────────────────────────────────────────

export async function createParty(actor: Actor, input: z.infer<typeof PartySchema>) {
  assertCan(actor, 'party.create');
  const vh = versionHash(input);
  return prisma.$transaction(async (tx) => {
    const party = await tx.party.create({ data: { ...input, versionHash: vh, createdBy: actor.userId } });
    const family = input.kind === 'VENDOR' ? 'AR03' : 'AR01';
    const approval = await requestApproval({
      familyCode: family, docType: 'Party', docId: party.id,
      classes: input.kind === 'VENDOR'
        ? { vendor: input.restricted ? 'RESTRICTED' : 'NEW' }
        : { customer: input.restricted ? 'RESTRICTED' : 'NEW' },
      amount: input.creditLimit,
      flags: { restricted: input.restricted }, payload: { ...input }, actor,
    }, tx);
    await audit({ actor, action: 'party.create', docType: 'Party', docId: party.id, toStatus: 'DRAFT', versionHash: vh, meta: { approvalId: approval.approvalId } }, tx as Tx);
    return { party, approval };
  });
}

/** SOD13: the steward who created the record may never activate it. */
export async function activateParty(actor: Actor, partyId: string) {
  assertCan(actor, 'party.approve');
  const party = await prisma.party.findUniqueOrThrow({ where: { id: partyId } });
  if (party.createdBy === actor.userId) {
    await recordConflict('SOD13', 'DYNAMIC', partyId, { actorId: actor.userId, action: 'party.approve' });
    throw DenySod('SOD13', { partyId, actorId: actor.userId });
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.party.update({ where: { id: partyId }, data: { status: 'ACTIVE' } });
    await audit({ actor, action: 'party.approve', docType: 'Party', docId: partyId, fromStatus: party.status, toStatus: 'ACTIVE', versionHash: party.versionHash }, tx as Tx);
    return updated;
  });
}

// ─── MD20 bank account (AR04 / SOD01) ─────────────────────────────────────────

/**
 * Bank change is always T4 dual control with an independent callback:
 *   change (maker) → verify (independent callback) → approve (2 approvers) → activate
 */
export async function requestBankChange(actor: Actor, input: z.infer<typeof BankAccountSchema>) {
  assertCan(actor, 'party.bank.change');
  const { token, masked } = tokenizeAccount(input.accountNo);
  const vh = versionHash({ partyId: input.partyId, bankCode: input.bankCode, token, holderName: input.holderName });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.bankAccount.findFirst({ where: { accountToken: token } });
    if (existing && existing.partyId === input.partyId && existing.status === 'ACTIVE') {
      throw new ControlError('NO_CHANGE', 'Account already active for this party', 409);
    }
    const account = await tx.bankAccount.create({
      data: {
        partyId: input.partyId, bankCode: input.bankCode, accountToken: token,
        accountMasked: masked, holderName: input.holderName, currency: input.currency,
        effectiveFrom: input.effectiveFrom ?? null, createdBy: actor.userId, versionHash: vh,
      },
    });
    await audit({ actor, action: 'party.bank.change', docType: 'BankAccount', docId: account.id, toStatus: 'DRAFT', versionHash: vh, sodRuleIds: ['SOD01'] }, tx as Tx);
    return account;
  });
}

/** Independent callback proof. Verifier ≠ maker (SOD01 chain). */
export async function verifyBankChange(actor: Actor, accountId: string, callbackRef: string) {
  assertCan(actor, 'party.bank.verify');
  const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.createdBy === actor.userId) {
    await recordConflict('SOD01', 'DYNAMIC', accountId, { actorId: actor.userId, stage: 'verify' });
    throw DenySod('SOD01', { accountId, stage: 'verify' });
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.bankAccount.update({
      where: { id: accountId },
      data: { verifiedBy: actor.userId, verifiedAt: new Date() },
    });
    const approval = await requestApproval({
      familyCode: 'AR04', docType: 'BankAccount', docId: accountId,
      payload: { partyId: acc.partyId, masked: acc.accountMasked, bankCode: acc.bankCode, callbackRef }, actor,
      // Yang dikunci dari menyetujui adalah pembuat rekening, bukan verifikator.
      makerId: acc.createdBy,
    }, tx);
    await tx.bankAccount.update({ where: { id: accountId }, data: { approvalId: approval.approvalId, versionHash: approval.versionHash } });
    await audit({ actor, action: 'party.bank.verify', docType: 'BankAccount', docId: accountId, toStatus: 'SUBMITTED', versionHash: approval.versionHash, sodRuleIds: ['SOD01'], meta: { callbackRef } }, tx as Tx);
    return { account: updated, approval };
  });
}

/** Activation supersedes the previous account; nothing is ever deleted. */
export async function activateBankAccount(actor: Actor, accountId: string) {
  assertCan(actor, 'party.bank.approve');
  const acc = await prisma.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.createdBy === actor.userId) {
    await recordConflict('SOD01', 'DYNAMIC', accountId, { actorId: actor.userId, stage: 'activate' });
    throw DenySod('SOD01', { accountId, stage: 'activate' });
  }
  if (acc.createdBy === actor.userId || acc.verifiedBy === actor.userId) throw DenySelfApproval(accountId, actor.userId);
  if (!acc.verifiedBy) throw new ControlError('NOT_VERIFIED', 'Independent callback verification is mandatory', 409);
  const { assertApproved } = await import('../approval/approval.service.js');
  await assertApproved('BankAccount', accountId, acc.versionHash);

  return prisma.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({
      where: { partyId: acc.partyId, status: 'ACTIVE' },
      data: { status: 'ARCHIVED', supersededBy: accountId },
    });
    const updated = await tx.bankAccount.update({ where: { id: accountId }, data: { status: 'ACTIVE' } });
    await audit({ actor, action: 'party.bank.approve', docType: 'BankAccount', docId: accountId, fromStatus: 'DRAFT', toStatus: 'ACTIVE', versionHash: acc.versionHash, sodRuleIds: ['SOD01'] }, tx as Tx);
    return updated;
  });
}

// ─── MD12 / MD13 / MD18 ───────────────────────────────────────────────────────

export async function createUom(actor: Actor, input: z.infer<typeof UomSchema>) {
  assertCan(actor, 'product.create');
  const uom = await prisma.uom.create({ data: input });
  await audit({ actor, action: 'uom.create', docType: 'Uom', docId: uom.id, toStatus: 'ACTIVE' });
  return uom;
}

export async function createProduct(actor: Actor, input: z.infer<typeof ProductSchema>) {
  assertCan(actor, 'product.create');
  const vh = versionHash(input);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...input, versionHash: vh } });
    const approval = await requestApproval({
      familyCode: 'AR05', docType: 'Product', docId: product.id, payload: { ...input }, actor,
    }, tx);
    await audit({ actor, action: 'product.create', docType: 'Product', docId: product.id, toStatus: 'DRAFT', versionHash: vh }, tx as Tx);
    return { product, approval };
  });
}

export async function activateProduct(actor: Actor, productId: string) {
  assertCan(actor, 'product.approve');
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const creators = await prisma.auditEvent.findFirst({
    where: { docType: 'Product', docId: productId, action: 'product.create', actorId: actor.userId },
    select: { id: true },
  });
  if (creators) {
    await recordConflict('SOD13', 'DYNAMIC', productId, { actorId: actor.userId, action: 'product.approve' });
    throw DenySod('SOD13', { productId, actorId: actor.userId });
  }
  const updated = await prisma.product.update({ where: { id: productId }, data: { status: 'ACTIVE' } });
  await audit({ actor, action: 'product.approve', docType: 'Product', docId: productId, fromStatus: p.status, toStatus: 'ACTIVE', versionHash: p.versionHash });
  return updated;
}

export async function createAccount(actor: Actor, input: z.infer<typeof AccountSchema>) {
  assertCan(actor, 'account.create');
  const account = await prisma.account.create({ data: input });
  await audit({ actor, action: 'account.create', docType: 'Account', docId: account.id, toStatus: 'ACTIVE' });
  return account;
}
