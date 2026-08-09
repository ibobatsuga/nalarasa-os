import { ROLE_BY_CODE, ROLES } from '../config/roles.js';
import { expandGrants, type FunctionCode } from '../config/functions.js';
import { DenyAccess, DenyBand } from '../core/errors.js';
import { bandRank, maxBand, type Actor, type AuthorityBand } from '../core/types.js';

/** role code -> effective function set (computed once; roles are config). */
const ROLE_GRANTS = new Map<string, Set<FunctionCode>>(
  ROLES.map((r) => [r.code, expandGrants(r.grants)]),
);

export const grantsOf = (roleCode: string): Set<FunctionCode> =>
  ROLE_GRANTS.get(roleCode) ?? new Set();

/** Least privilege: the union of assigned roles only. Users hold nothing directly. */
export function effectiveFunctions(actor: Actor): Set<FunctionCode> {
  const out = new Set<FunctionCode>();
  for (const rc of actor.roleCodes) for (const f of grantsOf(rc)) out.add(f);
  return out;
}

export const can = (actor: Actor, fn: string): boolean =>
  actor.roleCodes.some((rc) => grantsOf(rc).has(fn as FunctionCode));

/** The specific role that authorises `fn` — stamped on the decision record. */
export function roleFor(actor: Actor, fn: string): string | null {
  let best: string | null = null;
  for (const rc of actor.roleCodes) {
    if (!grantsOf(rc).has(fn as FunctionCode)) continue;
    const cur = ROLE_BY_CODE.get(rc);
    if (!cur) continue;
    if (!best || bandRank(cur.maxBand) > bandRank(ROLE_BY_CODE.get(best)!.maxBand)) best = rc;
  }
  return best;
}

export function bandOf(actor: Actor): AuthorityBand {
  return actor.roleCodes.reduce<AuthorityBand>(
    (acc, rc) => maxBand(acc, ROLE_BY_CODE.get(rc)?.maxBand ?? 'T0'),
    'T0',
  );
}

/** Default deny. Throws unless an assigned role explicitly grants `fn`. */
export function assertCan(actor: Actor, fn: string): string {
  const role = roleFor(actor, fn);
  if (!role) throw DenyAccess(fn, actor.userId);
  return role;
}

/** Authority band ceiling check for approval decisions. */
export function assertBand(actor: Actor, required: AuthorityBand): AuthorityBand {
  const have = bandOf(actor);
  if (bandRank(have) < bandRank(required)) throw DenyBand(required, have);
  return have;
}

export const isPrivileged = (roleCode: string): boolean =>
  ROLE_BY_CODE.get(roleCode)?.privileged === true;
