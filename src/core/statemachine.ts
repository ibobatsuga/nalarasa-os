import { DenyTransition } from './errors.js';

export interface TransitionDef<S extends string> {
  action: string;
  from: readonly S[];
  to: S;
  /** Function code required to invoke. Default-deny: never omit. */
  fn: string;
  /** Approval family that must be APPROVED before this transition executes. */
  requiresApproval?: string;
  /** Runtime SoD: actor must differ from the actor of these prior actions. */
  segregateFrom?: readonly string[];
  /** Terminal transitions cannot be followed by anything but reversal. */
  terminal?: boolean;
}

/**
 * One state machine per business object. Zero hard-delete: the only way out of
 * a document is CANCELLED (pre-execution) or REVERSED (post-execution).
 */
export class StateMachine<S extends string> {
  private readonly index: Map<string, TransitionDef<S>>;

  constructor(
    readonly docType: string,
    readonly transitions: readonly TransitionDef<S>[],
  ) {
    this.index = new Map(transitions.map((t) => [t.action, t]));
  }

  get(action: string): TransitionDef<S> {
    const t = this.index.get(action);
    if (!t) throw DenyTransition(this.docType, '-', action);
    return t;
  }

  /** Validates the transition is legal from `current` and returns it. */
  assert(action: string, current: S): TransitionDef<S> {
    const t = this.get(action);
    if (!t.from.includes(current)) throw DenyTransition(this.docType, current, action);
    return t;
  }

  allowedFrom(current: S): TransitionDef<S>[] {
    return this.transitions.filter((t) => t.from.includes(current));
  }
}

/** DRY document lifecycle shared by every transactional object. */
export const DOC_LIFECYCLE = ['DRAFT', 'SUBMITTED', 'APPROVED', 'EXECUTED', 'REVERSED', 'CANCELLED'] as const;
export type DocState = (typeof DOC_LIFECYCLE)[number];

/**
 * Builds the standard Draft→Submitted→Approved→Executed(+Reversed/Cancelled)
 * spine for a document type; domain machines extend it with stage transitions.
 */
export function baseTransitions(opts: {
  prefix: string;
  createFn: string;
  submitFn: string;
  approveFn: string;
  executeFn: string;
  family: string;
  segregateFrom?: readonly string[];
}): TransitionDef<DocState>[] {
  const { prefix, createFn, submitFn, approveFn, executeFn, family } = opts;
  return [
    { action: `${prefix}.submit`, from: ['DRAFT'], to: 'SUBMITTED', fn: submitFn },
    { action: `${prefix}.approve`, from: ['SUBMITTED'], to: 'APPROVED', fn: approveFn, requiresApproval: family, segregateFrom: opts.segregateFrom ?? [`${prefix}.submit`] },
    { action: `${prefix}.execute`, from: ['APPROVED'], to: 'EXECUTED', fn: executeFn },
    { action: `${prefix}.cancel`, from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'CANCELLED', fn: createFn, terminal: true },
    { action: `${prefix}.reverse`, from: ['EXECUTED'], to: 'REVERSED', fn: approveFn, requiresApproval: family, terminal: true },
  ];
}
