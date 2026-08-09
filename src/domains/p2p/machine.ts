import { StateMachine, type DocState } from '../../core/statemachine.js';

/** SOP05 Plan-to-Source */
export const requisitionDoc = new StateMachine<DocState>('Requisition', [
  { action: 'req.submit', from: ['DRAFT'], to: 'SUBMITTED', fn: 'req.create' },
  { action: 'req.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'req.approve', requiresApproval: 'AR09', segregateFrom: ['req.submit'] },
  { action: 'req.convert', from: ['APPROVED'], to: 'EXECUTED', fn: 'po.create' },
  { action: 'req.cancel', from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'CANCELLED', fn: 'req.create', terminal: true },
]);

/** SOP06 Procure-to-Pay — PO commitment (SOD02: buyer ≠ approver ≠ receiver). */
export const purchaseOrderDoc = new StateMachine<DocState>('PurchaseOrder', [
  { action: 'po.submit', from: ['DRAFT'], to: 'SUBMITTED', fn: 'po.create' },
  { action: 'po.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'po.approve', requiresApproval: 'AR10', segregateFrom: ['po.submit'] },
  { action: 'po.issue', from: ['APPROVED'], to: 'EXECUTED', fn: 'po.create' },
  { action: 'po.cancel', from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'CANCELLED', fn: 'po.cancel', terminal: true },
  { action: 'po.reverse', from: ['EXECUTED'], to: 'REVERSED', fn: 'po.approve', requiresApproval: 'AR10', terminal: true },
]);

/** SOP07 Inbound-to-Stock (SOD03: receiver ≠ approver). */
export const goodsReceiptDoc = new StateMachine<DocState>('GoodsReceipt', [
  { action: 'receipt.submit', from: ['DRAFT'], to: 'SUBMITTED', fn: 'receipt.create', segregateFrom: ['po.submit'] },
  { action: 'receipt.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'receipt.approve', segregateFrom: ['receipt.submit'] },
  { action: 'receipt.putaway', from: ['APPROVED'], to: 'EXECUTED', fn: 'receipt.approve' },
]);

/** Vendor bill — 3-way match gate before approval. */
export const vendorBillDoc = new StateMachine<DocState>('VendorBill', [
  { action: 'bill.submit', from: ['DRAFT'], to: 'SUBMITTED', fn: 'bill.create' },
  { action: 'bill.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'bill.approve', requiresApproval: 'AR11', segregateFrom: ['bill.submit'] },
  { action: 'bill.post', from: ['APPROVED'], to: 'EXECUTED', fn: 'bill.approve' },
  { action: 'bill.cancel', from: ['DRAFT', 'SUBMITTED'], to: 'CANCELLED', fn: 'bill.create', terminal: true },
]);

/** SOD08 chain is encoded directly in segregateFrom. */
export const paymentBatchDoc = new StateMachine<DocState>('PaymentBatch', [
  { action: 'payment.prepare', from: ['DRAFT'], to: 'SUBMITTED', fn: 'payment.prepare' },
  { action: 'payment.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'payment.approve', requiresApproval: 'AR19', segregateFrom: ['payment.prepare', 'party.bank.change'] },
  { action: 'payment.release', from: ['APPROVED'], to: 'EXECUTED', fn: 'payment.release', segregateFrom: ['payment.prepare', 'payment.approve', 'party.bank.change'] },
  { action: 'payment.cancel', from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'CANCELLED', fn: 'payment.prepare', terminal: true },
  { action: 'payment.reverse', from: ['EXECUTED'], to: 'REVERSED', fn: 'payment.approve', requiresApproval: 'AR19', terminal: true },
]);
