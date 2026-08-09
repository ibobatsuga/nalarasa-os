import type { AuthorityBand } from '../core/types.js';

export interface RoleDef {
  code: string;
  name: string;
  /** Highest band this role may DECIDE at. Least privilege: default T0. */
  maxBand: AuthorityBand;
  privileged?: boolean;
  grants: readonly string[];
}

/** R01–R51 business roles. Users are never granted functions directly. */
export const ROLES: readonly RoleDef[] = [
  // governance
  { code: 'R01', name: 'Executive Sponsor', maxBand: 'T4', grants: ['*.read', 'kpi.read', 'period.reopen', 'payment.approve', 'payroll.approve', 'compensation.approve', 'role.approve', 'party.bank.approve'] },
  { code: 'R02', name: 'End-to-End Process Owner', maxBand: 'T3', grants: ['so.read', 'po.read', 'kpi.read', 'audit.read', 'party.read', 'product.read'] },
  { code: 'R03', name: 'Risk & Control Owner', maxBand: 'T3', grants: ['audit.read', 'kpi.read', 'role.approve', 'party.read', 'po.read', 'so.read'] },
  { code: 'R04', name: 'Internal Auditor', maxBand: 'T0', grants: ['audit.read', 'kpi.read', 'so.read', 'po.read', 'party.read', 'product.read', 'account.read'] },
  { code: 'R05', name: 'Data Owner', maxBand: 'T3', grants: ['party.approve', 'product.approve', 'account.approve', 'party.read', 'product.read', 'account.read', 'kpi.read'] },
  { code: 'R06', name: 'Data Steward', maxBand: 'T1', grants: ['party.create', 'product.create', 'account.create', 'party.read', 'product.read', 'account.read'] },
  { code: 'R07', name: 'KPI Owner / BI Analyst', maxBand: 'T2', grants: ['kpi.define', 'kpi.read'] },

  // commercial
  { code: 'R08', name: 'Marketing Specialist', maxBand: 'T0', grants: ['party.read', 'so.read'] },
  { code: 'R09', name: 'CRM / Sales Representative', maxBand: 'T0', grants: ['so.create', 'so.submit', 'so.read', 'discount.request', 'party.read', 'product.read'] },
  { code: 'R10', name: 'Sales Manager', maxBand: 'T2', grants: ['so.read', 'so.approve', 'so.cancel', 'discount.approve', 'party.read', 'reservation.read', 'event.read', 'event.write'] },
  { code: 'R11', name: 'Pricing / Credit Reviewer', maxBand: 'T2', grants: ['discount.approve', 'so.read', 'party.read'] },
  { code: 'R12', name: 'Digital Commerce / POS Operator', maxBand: 'T0', grants: ['pos.session.open', 'pos.session.close', 'pos.order.create', 'so.read', 'product.read', 'reservation.read', 'reservation.write', 'event.read'] },
  { code: 'R13', name: 'Customer Service Agent', maxBand: 'T0', grants: ['so.read', 'party.read', 'reservation.read', 'reservation.write', 'event.read'] },
  { code: 'R14', name: 'Service Manager', maxBand: 'T2', grants: ['so.read', 'so.cancel', 'invoice.creditnote.approve', 'pos.session.variance.approve', 'reservation.read', 'reservation.write', 'event.read', 'event.write', 'kpi.read',
    // Mesin kasir dipasang dengan kredensial supervisor outlet; token perangkat
    // itulah yang mengautentikasi ke server. Siapa yang MELAYANI tiap transaksi
    // tetap datang dari cashierRef hasil masuk-PIN, bukan dari token ini.
    'pos.session.open', 'pos.session.close', 'pos.order.create', 'product.read'] },

  // supply
  { code: 'R15', name: 'Business Requester', maxBand: 'T0', grants: ['req.create', 'po.read', 'product.read'] },
  { code: 'R16', name: 'Buyer', maxBand: 'T0', grants: ['po.create', 'po.read', 'req.create', 'party.read', 'product.read'] },
  { code: 'R17', name: 'Procurement Manager', maxBand: 'T2', grants: ['po.approve', 'po.cancel', 'req.approve', 'po.read', 'party.read'] },
  { code: 'R18', name: 'Receiving Clerk', maxBand: 'T0', grants: ['receipt.create', 'po.read'] },
  { code: 'R19', name: 'Inventory Controller', maxBand: 'T1', grants: ['receipt.approve', 'po.read'] },
  { code: 'R20', name: 'Warehouse Supervisor', maxBand: 'T1', grants: ['receipt.approve', 'so.deliver', 'po.read'] },
  { code: 'R21', name: 'Logistics Coordinator', maxBand: 'T0', grants: ['so.deliver', 'so.read'] },

  // make
  { code: 'R22', name: 'Demand / Production Planner', maxBand: 'T1', grants: ['so.reserve', 'so.read', 'po.read', 'product.read'] },
  { code: 'R23', name: 'Production Operator', maxBand: 'T0', grants: ['product.read', 'so.read', 'menu.availability'] },
  { code: 'R24', name: 'Production Supervisor', maxBand: 'T1', grants: ['product.read', 'so.read', 'menu.availability'] },
  { code: 'R25', name: 'Quality Inspector', maxBand: 'T0', grants: ['receipt.create', 'product.read'] },
  { code: 'R26', name: 'Quality Manager', maxBand: 'T2', grants: ['receipt.approve', 'product.approve', 'menu.availability'] },
  { code: 'R27', name: 'Maintenance Technician', maxBand: 'T0', grants: ['product.read'] },
  { code: 'R28', name: 'Maintenance Manager', maxBand: 'T2', grants: ['req.approve', 'po.read'] },

  // finance
  { code: 'R29', name: 'Billing / AR Accountant', maxBand: 'T0', grants: ['invoice.create', 'invoice.post', 'so.bill', 'so.read'] },
  { code: 'R30', name: 'Collections Officer', maxBand: 'T0', grants: ['so.settle', 'so.read', 'party.read'] },
  { code: 'R31', name: 'AP Accountant', maxBand: 'T0', grants: ['bill.create', 'bill.match', 'po.read', 'payment.prepare', 'journal.read', 'account.read'] },
  { code: 'R32', name: 'General Accountant', maxBand: 'T0', grants: ['journal.prepare', 'account.read', 'bank.reconcile', 'journal.read'] },
  { code: 'R33', name: 'Controller', maxBand: 'T3', grants: ['journal.approve', 'journal.post', 'journal.reverse', 'journal.read', 'period.close', 'bill.approve', 'account.read', 'kpi.certify', 'kpi.read', 'invoice.creditnote.approve', 'pos.gateway.reconcile', 'pos.session.variance.approve'] },
  { code: 'R34', name: 'Treasury Preparer', maxBand: 'T0', grants: ['payment.prepare', 'party.bank.change', 'bank.reconcile'] },
  { code: 'R35', name: 'Treasury Approver', maxBand: 'T3', grants: ['payment.approve', 'payment.release', 'party.bank.verify', 'party.bank.approve'] },
  { code: 'R36', name: 'CFO / Finance Director', maxBand: 'T4', grants: ['payment.approve', 'period.reopen', 'period.close', 'payroll.approve', 'party.bank.approve', 'journal.approve', 'journal.read', 'account.read', 'bill.approve', 'compensation.approve', 'kpi.read', 'kpi.certify', 'audit.read'] },

  // people
  { code: 'R37', name: 'Employee Self-Service', maxBand: 'T0', grants: [] },
  { code: 'R38', name: 'Line Manager', maxBand: 'T1', grants: ['req.approve'] },
  { code: 'R39', name: 'Recruiter', maxBand: 'T0', grants: ['employee.create'] },
  { code: 'R40', name: 'HR Officer', maxBand: 'T1', grants: ['employee.create'] },
  { code: 'R41', name: 'Payroll Preparer', maxBand: 'T0', grants: ['payroll.run'] },
  { code: 'R42', name: 'Payroll Approver', maxBand: 'T4', grants: ['payroll.approve', 'compensation.approve'] },

  // delivery
  { code: 'R43', name: 'Project Team Member', maxBand: 'T0', grants: ['so.read'] },
  { code: 'R44', name: 'Project Manager', maxBand: 'T2', grants: ['so.read', 'so.bill', 'req.create'] },
  { code: 'R45', name: 'PMO Controller', maxBand: 'T3', grants: ['so.read', 'kpi.read'] },

  // technology
  { code: 'R46', name: 'Helpdesk Analyst', maxBand: 'T0', grants: ['so.read', 'party.read'] },
  { code: 'R47', name: 'IAM / Security Administrator', maxBand: 'T2', privileged: true, grants: ['role.admin', 'audit.read'] },
  { code: 'R48', name: 'Application Admin — Non-Production', maxBand: 'T1', privileged: true, grants: ['audit.read'] },
  { code: 'R49', name: 'Release / Deployment Manager', maxBand: 'T2', privileged: true, grants: ['audit.read'] },
  { code: 'R50', name: 'Integration Service Identity', maxBand: 'T0', privileged: true, grants: ['so.read', 'po.read', 'kpi.read', 'pos.gateway.reconcile'] },
  { code: 'R51', name: 'Emergency Break-Glass Admin', maxBand: 'T0', privileged: true, grants: ['audit.read'] },
] as const;

export const ROLE_BY_CODE = new Map(ROLES.map((r) => [r.code, r]));
