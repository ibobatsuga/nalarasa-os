/** MD33 KPI definitions. Every published tile is versioned and lineage-bound. */
export interface KpiDef {
  code: string;              // K01..K66
  name: string;
  formula: string;
  unit: 'RATIO' | 'PERCENT' | 'DAYS' | 'CURRENCY' | 'COUNT';
  direction: 'HIGHER_BETTER' | 'LOWER_BETTER' | 'ZERO_TARGET';
  owner: string;             // role code
  sources: readonly string[];
  version: string;
  implemented: boolean;
}

const def = (
  code: string, name: string, formula: string, unit: KpiDef['unit'],
  direction: KpiDef['direction'], owner: string, sources: readonly string[] = [],
  implemented = false,
): KpiDef => ({ code, name, formula, unit, direction, owner, sources, version: '1.0.0', implemented });

export const KPI_DEFS: readonly KpiDef[] = [
  def('K01', 'Net revenue vs plan', 'net_revenue / approved_plan', 'RATIO', 'HIGHER_BETTER', 'R36', ['Invoice', 'KpiPlan'], true),
  def('K02', 'Gross margin %', '(net_revenue - cogs) / net_revenue', 'PERCENT', 'HIGHER_BETTER', 'R33', ['SalesOrderLine', 'Invoice'], true),
  def('K03', 'Cash conversion cycle', 'DIO + DSO - DPO', 'DAYS', 'LOWER_BETTER', 'R36', ['Invoice', 'VendorBill', 'GoodsReceipt'], true),
  def('K04', 'Enterprise OTIF', 'on_time_in_full_deliveries / eligible_deliveries', 'PERCENT', 'HIGHER_BETTER', 'R02', ['SalesOrder'], true),
  def('K05', 'Control health index', 'Σ(weight × passed) / Σ(weight × due)', 'PERCENT', 'HIGHER_BETTER', 'R03', ['SodConflict', 'ApprovalRequest', 'VendorBill', 'Period'], true),
  def('K17', '3-way match first pass', 'bills_matched_without_exception / matched_bills', 'PERCENT', 'HIGHER_BETTER', 'R31', ['VendorBill'], true),
  def('K20', 'Dock-to-stock time', 'median(availableAt - receivedAt)', 'DAYS', 'LOWER_BETTER', 'R20', ['GoodsReceipt'], true),
  def('K37', 'DSO', 'average_AR / credit_sales × days', 'DAYS', 'LOWER_BETTER', 'R29', ['Invoice'], true),
  def('K40', 'DPO / term compliance', 'average_AP / purchases × days', 'DAYS', 'HIGHER_BETTER', 'R31', ['VendorBill'], true),
  def('K43', 'Manual journal ratio', 'manual_journal_lines / journal_lines', 'PERCENT', 'LOWER_BETTER', 'R33', ['JournalEntry'], true),
  def('K44', 'Payment exception rate', 'failed_or_reversed_payments / attempts', 'PERCENT', 'LOWER_BETTER', 'R35', ['PaymentBatch'], true),
  def('K47', 'Payroll accuracy', 'payslips_without_correction / payslips', 'PERCENT', 'HIGHER_BETTER', 'R42', ['Payslip'], true),
  def('K63', 'Unmitigated SoD conflicts', 'count(open conflicts without valid mitigation)', 'COUNT', 'ZERO_TARGET', 'R03', ['SodConflict'], true),
  def('K65', 'KPI freshness', 'tiles_refreshed_within_SLA / published_tiles', 'PERCENT', 'HIGHER_BETTER', 'R07', ['KpiSnapshot'], true),
] as const;

export const KPI_BY_CODE = new Map(KPI_DEFS.map((k) => [k.code, k]));

/** K05 component weights — approved control checks. */
export const CONTROL_HEALTH_WEIGHTS = {
  sodClean: 0.30,       // K63 = 0 is a hard gate
  approvalOnTime: 0.20,
  matchFirstPass: 0.20,
  bankReconciled: 0.15,
  periodLocked: 0.15,
} as const;
