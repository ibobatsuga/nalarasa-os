/** SOD01–SOD14. Static side = grant analysis; chain = runtime actor analysis. */
export interface SodChain {
  /** Actions on the SAME business object that must never share one actor. */
  docType: string;
  a: string;
  b: string;
}

export interface SodRule {
  id: string;
  domain: string;
  conflict: string;
  sideA: readonly string[];
  sideB: readonly string[];
  mitigation: string;
  chains: readonly SodChain[];
}

export const SOD_RULES: readonly SodRule[] = [
  {
    id: 'SOD01', domain: 'Vendor/party bank',
    conflict: 'Create/change bank account vs approve or execute payment',
    sideA: ['party.bank.change'],
    sideB: ['payment.approve', 'payment.release'],
    mitigation: 'Independent callback verification + dual authorization',
    chains: [
      { docType: 'BankAccount', a: 'party.bank.change', b: 'party.bank.verify' },
      { docType: 'PaymentBatch', a: 'party.bank.change', b: 'payment.approve' },
      { docType: 'PaymentBatch', a: 'party.bank.change', b: 'payment.release' },
    ],
  },
  {
    id: 'SOD02', domain: 'Procurement',
    conflict: 'Create supplier/PO vs high-band approve and receive/bill alone',
    sideA: ['po.create', 'party.create'],
    sideB: ['po.approve', 'receipt.create', 'bill.create'],
    mitigation: 'Buyer/approver/receiver/AP separation',
    chains: [
      { docType: 'PurchaseOrder', a: 'po.create', b: 'po.approve' },
      { docType: 'PurchaseOrder', a: 'po.create', b: 'receipt.create' },
      { docType: 'VendorBill', a: 'bill.create', b: 'bill.approve' },
    ],
  },
  {
    id: 'SOD03', domain: 'Inventory',
    conflict: 'Record receipt/adjustment vs approve own adjustment and reconcile',
    sideA: ['receipt.create'], sideB: ['receipt.approve'],
    mitigation: 'Independent count/approval',
    chains: [{ docType: 'GoodsReceipt', a: 'receipt.create', b: 'receipt.approve' }],
  },
  {
    id: 'SOD04', domain: 'Sales',
    conflict: 'Create quote/discount vs approve restricted discount/credit note',
    sideA: ['so.create', 'discount.request'],
    sideB: ['discount.approve', 'invoice.creditnote.approve'],
    mitigation: 'Pricing/credit/finance approval',
    chains: [{ docType: 'SalesOrder', a: 'so.submit', b: 'so.approve' }],
  },
  {
    id: 'SOD05', domain: 'Manufacturing',
    conflict: 'Consume/produce/scrap vs approve own scrap and close variance',
    sideA: [], sideB: [], mitigation: 'Supervisor/Quality/Controller separation', chains: [],
  },
  {
    id: 'SOD06', domain: 'Quality',
    conflict: 'Perform inspection vs approve own high-risk concession',
    sideA: [], sideB: [], mitigation: 'Independent disposition for critical class', chains: [],
  },
  {
    id: 'SOD07', domain: 'Finance journal',
    conflict: 'Prepare manual journal vs approve/post/reconcile and close period',
    sideA: ['journal.prepare'],
    sideB: ['journal.approve', 'journal.post', 'period.close'],
    mitigation: 'Preparer/approver/close-reviewer separation',
    chains: [
      { docType: 'JournalEntry', a: 'journal.prepare', b: 'journal.approve' },
      { docType: 'JournalEntry', a: 'journal.prepare', b: 'journal.post' },
      { docType: 'JournalEntry', a: 'journal.approve', b: 'journal.post' },
    ],
  },
  {
    id: 'SOD08', domain: 'Payment',
    conflict: 'Prepare payment batch vs sole approve/release and reconcile bank',
    sideA: ['payment.prepare'],
    sideB: ['payment.approve', 'payment.release', 'payment.reconcile'],
    mitigation: 'Dual approval + independent reconciliation',
    chains: [
      { docType: 'PaymentBatch', a: 'payment.prepare', b: 'payment.approve' },
      { docType: 'PaymentBatch', a: 'payment.prepare', b: 'payment.release' },
      { docType: 'PaymentBatch', a: 'payment.approve', b: 'payment.release' },
      { docType: 'PaymentBatch', a: 'payment.prepare', b: 'payment.reconcile' },
    ],
  },
  {
    id: 'SOD09', domain: 'Payroll',
    conflict: 'Maintain pay input/run payroll vs sole approve/pay/reconcile',
    sideA: ['payroll.run'],
    sideB: ['payroll.approve', 'payroll.pay', 'payroll.reconcile'],
    mitigation: 'HR/Payroll/Treasury/Finance split',
    chains: [
      { docType: 'PayrollRun', a: 'payroll.run', b: 'payroll.approve' },
      { docType: 'PayrollRun', a: 'payroll.run', b: 'payroll.pay' },
      { docType: 'PayrollRun', a: 'payroll.approve', b: 'payroll.pay' },
    ],
  },
  {
    id: 'SOD10', domain: 'People',
    conflict: 'Create employee/position vs grant privileged role and approve compensation',
    sideA: ['employee.create'],
    sideB: ['role.admin', 'compensation.approve'],
    mitigation: 'HR/Manager/IAM/Risk split', chains: [],
  },
  {
    id: 'SOD11', domain: 'Access',
    conflict: 'Administer role/group vs approve own privileged access and audit logs',
    sideA: ['role.admin'], sideB: ['role.approve'],
    mitigation: 'Role owner + Risk; immutable log',
    chains: [{ docType: 'UserRole', a: 'role.admin', b: 'role.approve' }],
  },
  {
    id: 'SOD12', domain: 'System change',
    conflict: 'Develop/configure vs approve and deploy own production change',
    sideA: [], sideB: [], mitigation: 'Peer review/test/change authority/deployer', chains: [],
  },
  {
    id: 'SOD13', domain: 'Master data',
    conflict: 'Create restricted master vs approve and consume in high-risk transaction',
    sideA: ['party.create', 'product.create', 'account.create'],
    sideB: ['party.approve', 'product.approve', 'account.approve'],
    mitigation: 'Steward/Data Owner/executor split',
    chains: [
      { docType: 'Party', a: 'party.create', b: 'party.approve' },
      { docType: 'Product', a: 'product.create', b: 'product.approve' },
    ],
  },
  {
    id: 'SOD14', domain: 'Reporting',
    conflict: 'Define/transform KPI vs sole certification without reconciliation owner',
    sideA: ['kpi.define'], sideB: ['kpi.certify'],
    mitigation: 'KPI Owner + Data Owner + Controller',
    chains: [{ docType: 'KpiSnapshot', a: 'kpi.define', b: 'kpi.certify' }],
  },
] as const;

export const SOD_BY_ID = new Map(SOD_RULES.map((r) => [r.id, r]));

/** Runtime index: "docType:actionA:actionB" -> ruleId (order-insensitive). */
export const CHAIN_INDEX = new Map<string, string>();
for (const rule of SOD_RULES) {
  for (const c of rule.chains) {
    CHAIN_INDEX.set(`${c.docType}:${c.a}:${c.b}`, rule.id);
    CHAIN_INDEX.set(`${c.docType}:${c.b}:${c.a}`, rule.id);
  }
}
