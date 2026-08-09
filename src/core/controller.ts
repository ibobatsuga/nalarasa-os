import { prisma, type Tx } from './db.js';
import { audit } from './audit.js';
import type { StateMachine } from './statemachine.js';
import type { Actor } from './types.js';
import { assertCan } from '../iam/rbac.js';
import { assertChain, recordingSodViolations } from '../iam/sod.service.js';
import { assertApproved } from '../approval/approval.service.js';

export interface TransitionArgs<S extends string, R> {
  actor: Actor;
  machine: StateMachine<S>;
  action: string;
  docId: string;
  current: S;
  versionHash: string;
  reasonCode?: string;
  meta?: Record<string, unknown>;
  /** Persists the domain effect; runs inside the same transaction. */
  apply: (tx: Tx) => Promise<R>;
}

/**
 * The single choke point for every state change in the system:
 *   default-deny  →  legal transition  →  SoD chain  →  approval gate  →  apply  →  audit
 * Domain controllers never bypass this.
 */
export async function runTransition<S extends string, R>(args: TransitionArgs<S, R>): Promise<R> {
  const { actor, machine, action, docId, current, versionHash } = args;
  const t = machine.assert(action, current);
  const roleCode = assertCan(actor, t.fn);

  return recordingSodViolations(() => prisma.$transaction(async (tx) => {
    await assertChain(actor, machine.docType, docId, action, t.segregateFrom ?? [], tx as Tx);
    if (t.requiresApproval) await assertApproved(machine.docType, docId, versionHash, tx as Tx);

    const result = await args.apply(tx as Tx);

    await audit({
      actor, roleCode, action, docType: machine.docType, docId,
      fromStatus: current, toStatus: t.to,
      reasonCode: args.reasonCode ?? null, versionHash,
      meta: { ...(args.meta ?? {}), fn: t.fn },
    }, tx as Tx);

    return result;
  }));
}
