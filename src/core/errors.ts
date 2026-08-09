export class ControlError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus = 403,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ControlError';
  }
}

export const DenyAccess = (fn: string, actorId: string) =>
  new ControlError('ACCESS_DENIED', `Default deny: no role grants "${fn}"`, 403, { fn, actorId });

export const DenyBand = (need: string, have: string) =>
  new ControlError('BAND_INSUFFICIENT', `Authority band ${have} < required ${need}`, 403, { need, have });

export const DenySelfApproval = (docId: string, actorId: string) =>
  new ControlError('SELF_APPROVAL', 'Maker may not approve own request', 403, { docId, actorId });

export const DenySod = (ruleId: string, detail: Record<string, unknown>) =>
  new ControlError('SOD_VIOLATION', `Segregation of duties violated: ${ruleId}`, 403, { ruleId, ...detail });

export const DenyTransition = (docType: string, from: string, action: string) =>
  new ControlError('INVALID_TRANSITION', `${docType}: "${action}" not allowed from ${from}`, 409, { from, action });

export const DenyStaleVersion = (expected: string, actual: string) =>
  new ControlError('STALE_VERSION', 'Document version changed; resubmit required', 409, { expected, actual });

export const DenyPeriodLocked = (periodId: string) =>
  new ControlError('PERIOD_LOCKED', 'Accounting period is locked', 409, { periodId });
