export type AuthorityBand = 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
export const BAND_ORDER: readonly AuthorityBand[] = ['T0', 'T1', 'T2', 'T3', 'T4'];
export const bandRank = (b: AuthorityBand): number => BAND_ORDER.indexOf(b);
export const maxBand = (a: AuthorityBand, b: AuthorityBand): AuthorityBand =>
  bandRank(a) >= bandRank(b) ? a : b;

export type DocStatus =
  | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'EXECUTED' | 'REVERSED' | 'CANCELLED';

export type Decision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGE' | 'DELEGATE';

/** Resolved caller identity. Roles are business roles (R01–R51). */
export interface Actor {
  userId: string;
  roleCodes: string[];
  companyId?: string;
  siteId?: string;
}

/** One immutable slice of "who did what, on which version". */
export interface ControlStamp {
  actorId: string;
  roleCode: string;
  band: AuthorityBand;
  reasonCode: string;
  versionHash: string;
  at: Date;
}
