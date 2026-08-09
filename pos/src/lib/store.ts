/**
 * Local-first storage for the till. Every sale is written here FIRST and only
 * then queued for the server. A dropped connection, a router reboot or a power
 * cut must never cost the outlet a transaction.
 */

export type Tender = 'CASH' | 'QRIS' | 'CARD' | 'EWALLET';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'Makan di tempat',
  TAKEAWAY: 'Bawa pulang',
  DELIVERY: 'Antar',
};

export interface CatalogItem {
  code: string;
  name: string;
  category: string;
  price: number;
  barcode?: string;
  /** Dikuasai dapur. Kasir hanya membaca — lihat kitchen/src/lib/api.ts. */
  available?: boolean;
  unavailableReason?: string | null;
}

export interface Cashier {
  employeeNo: string;
  name: string;
  position?: string | null;
  pinHash: string;
  /** Garam acak per karyawan; kosong hanya pada cache dari versi lama. */
  pinSalt?: string;
  /** Iterasi PBKDF2 yang dipakai server saat digest dibuat. */
  pinIter?: number;
}

export interface CartLine {
  productCode: string;
  name: string;
  qty: number;
  unitPrice: number;
  note?: string;
}

export interface LocalOrder {
  clientRef: string;
  at: string;
  sessionRef: string;
  lines: CartLine[];
  total: number;
  tenderType: Tender;
  paid: number;
  change: number;
  gatewayRef?: string;
  orderType: OrderType;
  tableNo?: string;
  cashierRef?: string;
  cashierName?: string;
  voidedAt?: string;
  voidReason?: string;
  voidOfRef?: string;
}

export interface HeldOrder {
  id: string;
  label: string;          // table number or customer name
  orderType: OrderType;
  lines: CartLine[];
  heldAt: string;
}

export interface LocalSession {
  clientRef: string;
  siteCode: string;
  cashier: string;
  cashierRef?: string;
  openedAt: string;
  openingFloat: number;
  closedAt?: string;
  countedCash?: number;
}

export type OutboxItem =
  | { type: 'SESSION_OPEN'; clientRef: string; at: string; siteCode: string; openingFloat: number; cashierRef?: string }
  | { type: 'ORDER'; clientRef: string; at: string; sessionRef: string; total: number; tenderType: Tender; gatewayRef?: string; orderType: OrderType; tableNo?: string; cashierRef?: string; lines: CartLine[] }
  | { type: 'VOID'; clientRef: string; at: string; sessionRef: string; voidOfRef: string; total: number; reason: string; cashierRef?: string; lines: CartLine[] }
  | { type: 'SESSION_CLOSE'; clientRef: string; at: string; sessionRef: string; countedCash: number };

const KEY = {
  device: 'pos.deviceId',
  site: 'pos.siteCode',
  cashier: 'pos.cashier',
  cashierRef: 'pos.cashierRef',
  cashiers: 'pos.cashiers',
  session: 'pos.session',
  orders: 'pos.orders',
  held: 'pos.held',
  outbox: 'pos.outbox',
  catalog: 'pos.catalog',
  synced: 'pos.lastSyncAt',
  printer: 'pos.printerAgent',
} as const;

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};
const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

/** Collision-resistant without a network round-trip. */
export function newRef(prefix: string): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${Date.now().toString(36)}-${hex}`;
}

export function deviceId(): string {
  let id = localStorage.getItem(KEY.device);
  if (!id) { id = newRef('till'); localStorage.setItem(KEY.device, id); }
  return id;
}

export const store = {
  siteCode: () => localStorage.getItem(KEY.site) ?? 'RESTO-01',
  setSiteCode: (v: string) => localStorage.setItem(KEY.site, v),

  cashier: () => localStorage.getItem(KEY.cashier) ?? '',
  cashierRef: () => localStorage.getItem(KEY.cashierRef) ?? '',
  setCashier: (name: string, ref?: string) => {
    localStorage.setItem(KEY.cashier, name);
    if (ref) localStorage.setItem(KEY.cashierRef, ref);
  },
  signOut: () => { localStorage.removeItem(KEY.cashier); localStorage.removeItem(KEY.cashierRef); },

  cashiers: () => read<Cashier[]>(KEY.cashiers, []),
  setCashiers: (c: Cashier[]) => write(KEY.cashiers, c),

  session: () => read<LocalSession | null>(KEY.session, null),
  setSession: (s: LocalSession | null) => (s ? write(KEY.session, s) : localStorage.removeItem(KEY.session)),

  orders: () => read<LocalOrder[]>(KEY.orders, []),
  addOrder: (o: LocalOrder) => write(KEY.orders, [o, ...read<LocalOrder[]>(KEY.orders, [])].slice(0, 500)),
  markVoided: (clientRef: string, reason: string, at: string) => write(
    KEY.orders,
    read<LocalOrder[]>(KEY.orders, []).map((o) =>
      o.clientRef === clientRef ? { ...o, voidedAt: at, voidReason: reason } : o),
  ),
  clearOrders: () => localStorage.removeItem(KEY.orders),

  held: () => read<HeldOrder[]>(KEY.held, []),
  hold: (h: HeldOrder) => write(KEY.held, [...read<HeldOrder[]>(KEY.held, []).filter((x) => x.id !== h.id), h]),
  release: (id: string) => write(KEY.held, read<HeldOrder[]>(KEY.held, []).filter((h) => h.id !== id)),

  catalog: () => read<CatalogItem[]>(KEY.catalog, []),
  setCatalog: (c: CatalogItem[]) => write(KEY.catalog, c),

  outbox: () => read<OutboxItem[]>(KEY.outbox, []),
  enqueue: (item: OutboxItem) => write(KEY.outbox, [...read<OutboxItem[]>(KEY.outbox, []), item]),
  /** Drops only the refs the server confirmed; anything else stays queued. */
  ack: (refs: string[]) => {
    const done = new Set(refs);
    write(KEY.outbox, read<OutboxItem[]>(KEY.outbox, []).filter((i) => !done.has(i.clientRef)));
  },

  lastSyncAt: () => localStorage.getItem(KEY.synced),
  setLastSyncAt: (iso: string) => localStorage.setItem(KEY.synced, iso),

  printerAgent: () => localStorage.getItem(KEY.printer) ?? '',
  setPrinterAgent: (url: string) => localStorage.setItem(KEY.printer, url),
};

/** Session cash position, computed locally so closing works offline. */
export function cashPosition(session: LocalSession, orders: LocalOrder[]) {
  const sales = orders.filter((o) => o.sessionRef === session.clientRef);
  const live = sales.filter((o) => !o.voidedAt);
  const cash = live.filter((o) => o.tenderType === 'CASH').reduce((s, o) => s + o.total, 0);
  return {
    orderCount: live.filter((o) => o.total > 0).length,
    voidCount: sales.filter((o) => o.total < 0).length,
    grossSales: live.reduce((s, o) => s + o.total, 0),
    cashSales: cash,
    expectedCash: session.openingFloat + cash,
    byTender: (['CASH', 'QRIS', 'CARD', 'EWALLET'] as Tender[]).map((t) => ({
      tender: t,
      amount: live.filter((o) => o.tenderType === t).reduce((s, o) => s + o.total, 0),
      count: live.filter((o) => o.tenderType === t).length,
    })),
  };
}

export const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);

/** Same digest the server stores, computed in the browser for offline login. */
/**
 * Digest PIN, dihitung di perangkat supaya kasir tetap bisa masuk saat internet
 * mati. PBKDF2 dengan garam per karyawan: satu verifikasi memakan ratusan
 * milidetik — tak terasa saat mengetik PIN, tapi membuat penelusuran seluruh
 * 10^6 kemungkinan dari cache yang dicuri memakan waktu belasan jam per orang.
 */
export async function pinDigest(kasir: Cashier, pin: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(kasir.pinSalt ?? ''), iterations: kasir.pinIter ?? 210_000, hash: 'SHA-256' },
    key, 256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}
