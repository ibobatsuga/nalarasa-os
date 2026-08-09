import { StateMachine, baseTransitions, type DocState, type TransitionDef } from '../../core/statemachine.js';

/** SOP02/SOP03 approval spine of the sales order. */
export const salesOrderDoc = new StateMachine<DocState>('SalesOrder', [
  ...baseTransitions({
    prefix: 'so', createFn: 'so.create', submitFn: 'so.submit',
    approveFn: 'so.approve', executeFn: 'so.create', family: 'AR06',
    segregateFrom: ['so.submit'], // SOD04
  }),
]);

/** SOP03 fulfilment stages: Order → Reserved → Delivered → Billed → Settled. */
export type OrderStage = 'ORDER' | 'RESERVED' | 'DELIVERED' | 'BILLED' | 'SETTLED';

const stageDefs: TransitionDef<OrderStage>[] = [
  { action: 'so.reserve', from: ['ORDER'], to: 'RESERVED', fn: 'so.reserve' },
  { action: 'so.deliver', from: ['RESERVED'], to: 'DELIVERED', fn: 'so.deliver' },
  { action: 'so.bill', from: ['DELIVERED'], to: 'BILLED', fn: 'so.bill' },
  { action: 'so.settle', from: ['BILLED'], to: 'SETTLED', fn: 'so.settle' },
];

export const salesOrderStage = new StateMachine<OrderStage>('SalesOrder', stageDefs);

/** SOP04 POS session: open → close (count) → variance approval → post. */
export const posSession = new StateMachine<DocState>('PosSession', [
  { action: 'pos.close', from: ['DRAFT'], to: 'SUBMITTED', fn: 'pos.session.close' },
  { action: 'pos.approve_variance', from: ['SUBMITTED'], to: 'APPROVED', fn: 'pos.session.variance.approve', requiresApproval: 'AR25P', segregateFrom: ['pos.close'] },
  { action: 'pos.post', from: ['APPROVED'], to: 'EXECUTED', fn: 'pos.gateway.reconcile' },
  { action: 'pos.cancel', from: ['DRAFT', 'SUBMITTED'], to: 'CANCELLED', fn: 'pos.session.close', terminal: true },
]);

/** SOP04 subscription lifecycle. */
export const subscription = new StateMachine<DocState>('Subscription', [
  { action: 'sub.submit', from: ['DRAFT'], to: 'SUBMITTED', fn: 'subscription.create' },
  { action: 'sub.approve', from: ['SUBMITTED'], to: 'APPROVED', fn: 'subscription.approve', requiresApproval: 'AR07', segregateFrom: ['sub.submit'] },
  { action: 'sub.activate', from: ['APPROVED'], to: 'EXECUTED', fn: 'subscription.create' },
  { action: 'sub.cancel', from: ['DRAFT', 'SUBMITTED', 'APPROVED', 'EXECUTED'], to: 'CANCELLED', fn: 'subscription.cancel', terminal: true },
]);
