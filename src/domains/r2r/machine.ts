import { StateMachine, type DocState } from '../../core/statemachine.js';

/** SOP12 Record-to-Report. SOD07: prepare ≠ approve ≠ post. */
export const journalDoc = new StateMachine<DocState>('JournalEntry', [
  { action: 'journal.prepare', from: ['DRAFT'], to: 'SUBMITTED', fn: 'journal.prepare' },
  { action: 'journal.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'journal.approve', requiresApproval: 'AR18', segregateFrom: ['journal.prepare'] },
  { action: 'journal.post', from: ['APPROVED'], to: 'EXECUTED', fn: 'journal.post', segregateFrom: ['journal.prepare', 'journal.approve'] },
  { action: 'journal.cancel', from: ['DRAFT', 'SUBMITTED'], to: 'CANCELLED', fn: 'journal.prepare', terminal: true },
  { action: 'journal.reverse', from: ['EXECUTED'], to: 'REVERSED', fn: 'journal.reverse', requiresApproval: 'AR18', terminal: true },
]);

/** Period states are governed by AR20; reopen is always T4 dual control. */
export const periodDoc = new StateMachine<'OPEN' | 'SOFT_CLOSED' | 'LOCKED' | 'REOPENED'>('Period', [
  { action: 'period.soft_close', from: ['OPEN', 'REOPENED'], to: 'SOFT_CLOSED', fn: 'period.close' },
  { action: 'period.lock', from: ['SOFT_CLOSED'], to: 'LOCKED', fn: 'period.close' },
  { action: 'period.reopen', from: ['LOCKED'], to: 'REOPENED', fn: 'period.reopen', requiresApproval: 'AR20', segregateFrom: ['period.lock'] },
]);

/** SOD09: run ≠ approve ≠ pay. */
export const payrollDoc = new StateMachine<DocState>('PayrollRun', [
  { action: 'payroll.run', from: ['DRAFT'], to: 'SUBMITTED', fn: 'payroll.run' },
  { action: 'payroll.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'payroll.approve', requiresApproval: 'AR23', segregateFrom: ['payroll.run'] },
  { action: 'payroll.pay', from: ['APPROVED'], to: 'EXECUTED', fn: 'payroll.pay', segregateFrom: ['payroll.run', 'payroll.approve'] },
  { action: 'payroll.cancel', from: ['DRAFT', 'SUBMITTED'], to: 'CANCELLED', fn: 'payroll.run', terminal: true },
]);
