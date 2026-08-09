import { deviceId, store, type Cashier, type CatalogItem } from './store';

/**
 * Outbox sync. The till never blocks on the network: it flushes on an interval,
 * on reconnect, and right after each sale. The server de-duplicates by
 * clientRef, so replaying the same queue twice is harmless.
 */

const BASE = '/api';
const FLUSH_MS = 15_000;

export interface SyncState {
  online: boolean;
  pending: number;
  lastSyncAt: string | null;
  syncing: boolean;
  lastError: string | null;
}

type Listener = (s: SyncState) => void;

let state: SyncState = {
  online: navigator.onLine,
  pending: store.outbox().length,
  lastSyncAt: store.lastSyncAt(),
  syncing: false,
  lastError: null,
};

const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(state));
const patch = (p: Partial<SyncState>) => { state = { ...state, ...p }; emit(); };

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const syncState = (): SyncState => state;
export const refreshPending = () => patch({ pending: store.outbox().length });

function headers(): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-tenant': localStorage.getItem('pos.tenant') ?? 'horison-emerald',
    ...(localStorage.getItem('pos.token') ? { authorization: `Bearer ${localStorage.getItem('pos.token')}` } : {}),
  };
}

export async function flush(companyId = localStorage.getItem('pos.companyId') ?? ''): Promise<void> {
  const items = store.outbox();
  if (items.length === 0 || state.syncing || !navigator.onLine) return;

  patch({ syncing: true, lastError: null });
  try {
    const res = await fetch(`${BASE}/pos/till/sync`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ deviceId: deviceId(), companyId, items }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json() as { results: Array<{ clientRef: string; status: string; reason?: string }> };
    // ACCEPTED and DUPLICATE both mean "the server has it" — drop them.
    const settled = body.results.filter((r) => r.status !== 'REJECTED').map((r) => r.clientRef);
    store.ack(settled);

    const rejected = body.results.filter((r) => r.status === 'REJECTED');
    const now = new Date().toISOString();
    store.setLastSyncAt(now);
    patch({
      online: true, syncing: false, lastSyncAt: now,
      pending: store.outbox().length,
      lastError: rejected.length ? `${rejected.length} transaksi ditolak: ${rejected[0]!.reason ?? '-'}` : null,
    });
  } catch (e) {
    patch({ online: false, syncing: false, lastError: (e as Error).message, pending: store.outbox().length });
  }
}

export interface Bootstrap {
  tenantId: string;
  catalog: CatalogItem[];
  cashiers: Cashier[];
}

/**
 * Downloads menu, cashier PIN digests and the tenant id, so the till can both
 * sell AND authenticate its operators with no connection afterwards.
 */
export async function bootstrap(siteCode: string): Promise<Bootstrap> {
  try {
    const res = await fetch(`${BASE}/pos/till/bootstrap?siteCode=${encodeURIComponent(siteCode)}`, { headers: headers() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as Partial<Bootstrap>;
    if (body.catalog?.length) store.setCatalog(body.catalog);
    if (body.cashiers) store.setCashiers(body.cashiers);
    patch({ online: true });
    return {
      tenantId: body.tenantId ?? localStorage.getItem('pos.tenantId') ?? '',
      catalog: store.catalog(),
      cashiers: store.cashiers(),
    };
  } catch {
    patch({ online: false });
    return {
      tenantId: localStorage.getItem('pos.tenantId') ?? '',
      catalog: store.catalog(),
      cashiers: store.cashiers(),
    };
  }
}

export function startSync(): () => void {
  const onOnline = () => { patch({ online: true }); void flush(); };
  const onOffline = () => patch({ online: false });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const timer = setInterval(() => void flush(), FLUSH_MS);
  void flush();

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    clearInterval(timer);
  };
}
