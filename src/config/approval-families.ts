import type { AuthorityBand } from '../core/types.js';
import type { LadderProfile } from './calibration.js';

/**
 * AR01–AR28 routing. Families declare WHICH ladder profile they use;
 * the numbers themselves live in `calibration.ts` so a re-calibration never
 * touches routing logic.
 */
export interface ApprovalFamily {
  code: string;
  name: string;
  docTypes: readonly string[];
  /** Function code an approver must hold to decide this family. */
  approveFn: string;
  ladder: LadderProfile;
  /** Floor applied before any escalation (e.g. change control never below T2). */
  minBand?: AuthorityBand;
  /** Boolean payload flags that force a minimum band regardless of amount. */
  triggers: Readonly<Record<string, AuthorityBand>>;
  /** Approvers required per band. T4 is always dual control. */
  quorum?: Readonly<Partial<Record<AuthorityBand, number>>>;
  sodRules: readonly string[];
  slaHours?: number;
}

export const APPROVAL_FAMILIES: readonly ApprovalFamily[] = [
  { code: 'AR01', name: 'Customer/vendor create or merge', docTypes: ['Party'], approveFn: 'party.approve', ladder: 'MASTER', triggers: { restricted: 'T3', merge: 'T3' }, sodRules: ['SOD13'], slaHours: 24 },
  { code: 'AR02', name: 'Customer credit/payment profile', docTypes: ['Party'], approveFn: 'party.approve', ladder: 'COMMITMENT', triggers: { overrideCreditHold: 'T3' }, sodRules: ['SOD13'], slaHours: 24 },
  { code: 'AR03', name: 'Supplier qualification/status', docTypes: ['Party'], approveFn: 'party.approve', ladder: 'MASTER', triggers: { restricted: 'T3' }, sodRules: ['SOD13'], slaHours: 48 },
  { code: 'AR04', name: 'Party bank account change', docTypes: ['BankAccount'], approveFn: 'party.bank.approve', ladder: 'FLAT_T4', triggers: {}, sodRules: ['SOD01'], slaHours: 8 },
  { code: 'AR05', name: 'Product/UoM/category activation', docTypes: ['Product'], approveFn: 'product.approve', ladder: 'MASTER', triggers: { restricted: 'T3' }, sodRules: ['SOD13'], slaHours: 48 },
  { code: 'AR06', name: 'Price/discount/margin', docTypes: ['SalesOrder'], approveFn: 'discount.approve', ladder: 'REVENUE_CONCESSION', triggers: {}, sodRules: ['SOD04'], slaHours: 8 },
  { code: 'AR07', name: 'Nonstandard terms/contract', docTypes: ['SalesOrder'], approveFn: 'so.approve', ladder: 'COMMITMENT', minBand: 'T3', triggers: {}, sodRules: ['SOD04'], slaHours: 48 },
  { code: 'AR08', name: 'Order hold release/cancel/reopen', docTypes: ['SalesOrder'], approveFn: 'so.approve', ladder: 'OPERATIONAL', triggers: { reopen: 'T3' }, sodRules: ['SOD04'], slaHours: 8 },
  { code: 'AR09', name: 'Requisition/budget/urgency', docTypes: ['Requisition'], approveFn: 'req.approve', ladder: 'OPERATIONAL', triggers: { emergency: 'T2' }, sodRules: ['SOD02'], slaHours: 24 },
  { code: 'AR10', name: 'PO commitment/change', docTypes: ['PurchaseOrder'], approveFn: 'po.approve', ladder: 'COMMITMENT', triggers: { offContract: 'T3' }, sodRules: ['SOD02'], slaHours: 24 },
  { code: 'AR11', name: 'Receipt/3-way-match exception', docTypes: ['GoodsReceipt', 'VendorBill'], approveFn: 'bill.approve', ladder: 'COMMITMENT', triggers: { qtyException: 'T1', missingReceipt: 'T3', duplicateSuspect: 'T3' }, sodRules: ['SOD02', 'SOD03'], slaHours: 24 },
  { code: 'AR12', name: 'Inventory adjustment/scrap', docTypes: ['GoodsReceipt'], approveFn: 'receipt.approve', ladder: 'OPERATIONAL', triggers: {}, sodRules: ['SOD03'], slaHours: 24 },
  { code: 'AR13', name: 'BOM/routing/spec release', docTypes: ['Product'], approveFn: 'product.approve', ladder: 'MASTER', minBand: 'T2', triggers: { criticalSpec: 'T4' }, sodRules: ['SOD05'], slaHours: 72 },
  { code: 'AR14', name: 'MO release/priority/substitution', docTypes: ['Product'], approveFn: 'product.approve', ladder: 'OPERATIONAL', minBand: 'T1', triggers: {}, sodRules: ['SOD05'], slaHours: 8 },
  { code: 'AR15', name: 'Quality concession/rework/scrap', docTypes: ['GoodsReceipt'], approveFn: 'receipt.approve', ladder: 'OPERATIONAL', minBand: 'T2', triggers: { criticalClass: 'T4' }, sodRules: ['SOD06'], slaHours: 24 },
  { code: 'AR16', name: 'Maintenance emergency/downtime/cost', docTypes: ['Requisition'], approveFn: 'req.approve', ladder: 'COMMITMENT', triggers: { safety: 'T4' }, sodRules: [], slaHours: 4 },
  { code: 'AR17', name: 'Invoice/credit note/refund', docTypes: ['Invoice'], approveFn: 'invoice.creditnote.approve', ladder: 'REVENUE_CONCESSION', triggers: { postSettlement: 'T3' }, sodRules: ['SOD04'], slaHours: 24 },
  { code: 'AR18', name: 'Manual journal/adjustment', docTypes: ['JournalEntry'], approveFn: 'journal.approve', ladder: 'CASH_OUT', triggers: { restrictedAccount: 'T4', priorPeriod: 'T4' }, sodRules: ['SOD07'], slaHours: 24 },
  { code: 'AR19', name: 'Payment batch', docTypes: ['PaymentBatch'], approveFn: 'payment.approve', ladder: 'CASH_OUT', triggers: { newBankAccount: 'T4' }, sodRules: ['SOD01', 'SOD08'], slaHours: 8 },
  { code: 'AR20', name: 'Period close/reopen', docTypes: ['Period'], approveFn: 'period.reopen', ladder: 'FLAT_T4', triggers: {}, sodRules: ['SOD07'], slaHours: 4 },
  { code: 'AR21', name: 'Hire/offer/compensation', docTypes: ['PayrollRun'], approveFn: 'compensation.approve', ladder: 'PEOPLE', triggers: { aboveBand: 'T3' }, sodRules: ['SOD10'], slaHours: 48 },
  { code: 'AR22', name: 'Leave/overtime/time/expense', docTypes: ['Requisition'], approveFn: 'req.approve', ladder: 'OPERATIONAL', triggers: {}, sodRules: [], slaHours: 24 },
  { code: 'AR23', name: 'Payroll release/payment', docTypes: ['PayrollRun'], approveFn: 'payroll.approve', ladder: 'FLAT_T4', triggers: {}, sodRules: ['SOD09'], slaHours: 8 },
  { code: 'AR24', name: 'Project baseline/change/milestone', docTypes: ['SalesOrder'], approveFn: 'so.approve', ladder: 'COMMITMENT', triggers: {}, sodRules: [], slaHours: 48 },
  { code: 'AR25', name: 'Refund/concession/case remedy', docTypes: ['Invoice', 'PosSession'], approveFn: 'invoice.creditnote.approve', ladder: 'REVENUE_CONCESSION', triggers: {}, sodRules: ['SOD04'], slaHours: 8 },
  { code: 'AR25P', name: 'POS session variance', docTypes: ['PosSession'], approveFn: 'pos.session.variance.approve', ladder: 'POS_VARIANCE', triggers: {}, sodRules: [], slaHours: 12 },
  { code: 'AR26', name: 'User/role/privileged access', docTypes: ['UserRole'], approveFn: 'role.approve', ladder: 'MASTER', minBand: 'T2', triggers: { privileged: 'T4', breakGlass: 'T4' }, sodRules: ['SOD11'], slaHours: 8 },
  { code: 'AR27', name: 'Configuration/customization/release', docTypes: ['Config'], approveFn: 'role.approve', ladder: 'MASTER', minBand: 'T2', triggers: { production: 'T3' }, sodRules: ['SOD12'], slaHours: 24 },
  { code: 'AR28', name: 'Interface/schema/KPI rule', docTypes: ['KpiSnapshot'], approveFn: 'kpi.certify', ladder: 'MASTER', minBand: 'T2', triggers: { breakingChange: 'T3' }, sodRules: ['SOD14'], slaHours: 48 },
] as const;

export const FAMILY_BY_CODE = new Map(APPROVAL_FAMILIES.map((f) => [f.code, f]));

/** Approvers required. T4 is dual control by definition. */
export function quorumFor(family: ApprovalFamily, band: AuthorityBand): number {
  return family.quorum?.[band] ?? (band === 'T4' ? 2 : band === 'T0' ? 0 : 1);
}

export const REASON_CODES = {
  APPROVE: ['WITHIN_POLICY', 'DOCUMENTED_EXCEPTION', 'COMMERCIAL_NECESSITY', 'EMERGENCY'],
  REJECT: ['POLICY_BREACH', 'INSUFFICIENT_EVIDENCE', 'BUDGET_UNAVAILABLE', 'SOD_CONFLICT', 'DUPLICATE'],
  REQUEST_CHANGE: ['INCOMPLETE_DATA', 'WRONG_ACCOUNT', 'PRICE_CORRECTION', 'ATTACHMENT_MISSING'],
  DELEGATE: ['ABSENCE', 'CAPACITY', 'CONFLICT_OF_INTEREST'],
} as const;
