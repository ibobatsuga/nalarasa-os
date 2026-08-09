import { store, type LocalOrder } from './store';

/**
 * Receipt printing and the cash-drawer kick.
 *
 * A browser cannot speak ESC/POS to a USB printer, so the till supports two
 * paths and picks whichever is available:
 *
 *  1. Local print agent — a tiny service on the cashier machine listening on
 *     127.0.0.1 that forwards raw ESC/POS bytes to the printer and pulses the
 *     drawer. Configure its URL in Pengaturan; nothing leaves the machine.
 *  2. Browser print — a 58/80 mm print stylesheet. Always works, but the OS
 *     print dialog appears and the drawer stays shut.
 */

const ESC = '\x1b';
const GS = '\x1d';

/** ESC/POS drawer pulse on pin 2, 100 ms on / 250 ms off. */
export const DRAWER_KICK = `${ESC}p\x00\x19\xfa`;

export interface ReceiptContext {
  outlet: string;
  address?: string;
  cashier: string;
  order: LocalOrder;
}

/** Plain-text ESC/POS receipt, 32 columns (58 mm) by default. */
export function escposReceipt(ctx: ReceiptContext, cols = 32): string {
  const { order } = ctx;
  const line = (l: string) => `${l}\n`;
  const rule = () => line('-'.repeat(cols));
  const pair = (l: string, r: string) => {
    const gap = Math.max(1, cols - l.length - r.length);
    return line(l + ' '.repeat(gap) + r);
  };
  const center = (t: string) => line(t.padStart(Math.floor((cols + t.length) / 2)));
  const money = (n: number) => new Intl.NumberFormat('id-ID').format(n);

  let out = `${ESC}@`;                    // initialise
  out += `${ESC}a\x01${ESC}!\x30`;        // centre, double size
  out += center(ctx.outlet);
  out += `${ESC}!\x00`;                   // normal size
  if (ctx.address) out += center(ctx.address);
  out += `${ESC}a\x00`;                   // left align
  out += rule();
  out += line(`${new Date(order.at).toLocaleString('id-ID')}`);
  out += line(`Kasir : ${ctx.cashier}`);
  out += line(`Struk : ${order.clientRef.slice(-10)}`);
  if (order.tableNo) out += line(`Meja  : ${order.tableNo}`);
  out += rule();

  for (const l of order.lines) {
    out += line(l.name.slice(0, cols));
    out += pair(`  ${l.qty} x ${money(l.unitPrice)}`, money(l.qty * l.unitPrice));
    if (l.note) out += line(`  * ${l.note}`);
  }

  out += rule();
  out += `${ESC}!\x08`;                   // emphasised
  out += pair('TOTAL', money(order.total));
  out += `${ESC}!\x00`;
  out += pair(tenderLabel(order.tenderType), money(order.paid));
  if (order.tenderType === 'CASH') out += pair('Kembali', money(order.change));
  if (order.gatewayRef) out += line(`Ref: ${order.gatewayRef}`);
  if (order.voidOfRef) out += line(`PEMBATALAN dari ${order.voidOfRef.slice(-10)}`);
  out += rule();
  out += `${ESC}a\x01`;
  out += center('Terima kasih');
  out += center('Nalarasa OS');
  out += '\n\n\n';
  out += `${GS}V\x42\x00`;                // partial cut
  return out;
}

const tenderLabel = (t: string) =>
  ({ CASH: 'Tunai', QRIS: 'QRIS', CARD: 'Kartu', EWALLET: 'E-Wallet' }[t] ?? t);

async function postAgent(path: string, body: unknown): Promise<boolean> {
  const agent = store.printerAgent();
  if (!agent) return false;
  try {
    const res = await fetch(`${agent.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Mencetak struk. Mengembalikan 'AGENT' bila printer termal menerimanya,
 * 'BROWSER' bila jatuh ke dialog cetak, 'NONE' bila tidak dicetak sama sekali.
 *
 * `allowBrowserFallback` sengaja mati saat pembayaran selesai. `window.print()`
 * membuka dialog sistem yang MEMBLOKIR seluruh layar sampai ditutup — di kasir
 * yang ramai itu berarti antrean berhenti setiap satu transaksi. Dialog hanya
 * boleh muncul kalau kasir sendiri yang menekan tombol cetak.
 */
export async function printReceipt(
  ctx: ReceiptContext, openDrawer: boolean, allowBrowserFallback = false,
): Promise<'AGENT' | 'BROWSER' | 'NONE'> {
  const payload = escposReceipt(ctx) + (openDrawer ? DRAWER_KICK : '');
  if (await postAgent('/print', { raw: payload })) return 'AGENT';

  if (!allowBrowserFallback) return 'NONE';
  window.print();
  return 'BROWSER';
}

/** Kicks the drawer without printing — for float top-ups and cash drops. */
export async function kickDrawer(): Promise<boolean> {
  return postAgent('/print', { raw: DRAWER_KICK });
}

export async function agentAvailable(): Promise<boolean> {
  const agent = store.printerAgent();
  if (!agent) return false;
  try {
    const res = await fetch(`${agent.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}
