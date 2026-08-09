import { useState } from 'react';
import { StatusBar } from '../components/StatusBar';
import { Receipt } from '../components/Receipt';
import { printReceipt } from '../lib/printer';
import { flush, refreshPending } from '../lib/sync';
import { ORDER_TYPE_LABEL, newRef, rupiah, store, type LocalOrder } from '../lib/store';

const REASONS = [
  'Salah input menu',
  'Pelanggan batal',
  'Salah metode bayar',
  'Menu habis',
  'Komplain kualitas',
];

/**
 * Sales history for this till. Voiding never deletes: it books a mirrored
 * negative order and flags the original, so the drawer, the shift summary and
 * the back-office ledger all stay reconcilable.
 */
export function Orders({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<LocalOrder[]>(() => store.orders());
  const [voiding, setVoiding] = useState<LocalOrder | null>(null);
  const session = store.session();

  const mine = orders.filter((o) => !session || o.sessionRef === session.clientRef);

  const doVoid = (order: LocalOrder, reason: string) => {
    const clientRef = newRef('void');
    const at = new Date().toISOString();
    const reversal: LocalOrder = {
      ...order,
      clientRef, at,
      total: -order.total, paid: -order.paid, change: 0,
      voidOfRef: order.clientRef, voidReason: reason,
    };

    store.addOrder(reversal);
    store.markVoided(order.clientRef, reason, at);
    store.enqueue({
      type: 'VOID', clientRef, at, sessionRef: order.sessionRef,
      voidOfRef: order.clientRef, total: -order.total, reason,
      cashierRef: store.cashierRef() || undefined,
      lines: order.lines.map((l) => ({ ...l, qty: -l.qty })),
    });
    refreshPending();
    void flush();
    setOrders(store.orders());
    setVoiding(null);

    // Cash refunds open the drawer; the customer is getting money back.
    void printReceipt(
      { outlet: store.siteCode(), cashier: store.cashier(), order: reversal },
      order.tenderType === 'CASH',
    );
  };

  return (
    <div className="h-full flex flex-col">
      <StatusBar right={<button onClick={onBack} className="key key-ghost px-4 h-9 text-[13px]">Kembali</button>} />

      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <div className="mx-auto w-full max-w-[900px] space-y-2">
          <h2 className="text-[16px] font-bold text-navy-800">Transaksi shift ini</h2>
          <p className="text-[12.5px] text-ink-400">
            {mine.length} transaksi · pembatalan diajukan ke supervisor sesuai nilai dan jam.
          </p>

          {mine.length === 0 && (
            <div className="tile p-16 text-center text-[13px] text-ink-400">Belum ada transaksi</div>
          )}

          {mine.map((o) => {
            const isReversal = o.total < 0;
            return (
              <div key={o.clientRef} className={`tile p-4 flex items-center gap-4 ${o.voidedAt ? 'opacity-60' : ''}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-navy-800">{o.clientRef.slice(-10)}</span>
                    {isReversal && <Tag label="Pembatalan" tone="bad" />}
                    {o.voidedAt && !isReversal && <Tag label="Dibatalkan" tone="bad" />}
                    <Tag label={ORDER_TYPE_LABEL[o.orderType]} />
                    {o.tableNo && <Tag label={`Meja ${o.tableNo}`} />}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-400">
                    {new Date(o.at).toLocaleTimeString('id-ID')} · {o.lines.length} item · {o.tenderType}
                    {o.voidReason ? ` · ${o.voidReason}` : ''}
                  </p>
                </div>

                <span className={`text-[15px] font-bold tabular-nums ${isReversal ? 'text-brick-500' : 'text-navy-800'}`}>
                  {rupiah(o.total)}
                </span>

                <button
                  onClick={() => void printReceipt({ outlet: store.siteCode(), cashier: store.cashier(), order: o }, false, true)}
                  className="key key-ghost px-3 h-9 text-[12.5px]">Cetak</button>

                {!o.voidedAt && !isReversal && (
                  <button onClick={() => setVoiding(o)}
                    className="key key-ghost px-3 h-9 text-[12.5px] text-brick-500">Batalkan</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {voiding && <VoidDialog order={voiding} onCancel={() => setVoiding(null)} onConfirm={doVoid} />}
      {orders[0] && <Receipt order={orders[0]} cashier={store.cashier()} />}
    </div>
  );
}

function VoidDialog({
  order, onCancel, onConfirm,
}: { order: LocalOrder; onCancel: () => void; onConfirm: (o: LocalOrder, reason: string) => void }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const final = reason === 'Lainnya' ? other.trim() : reason;

  return (
    <div className="fixed inset-0 z-50 bg-navy-900/40 grid place-items-center p-6 print:hidden">
      <div className="tile w-full max-w-[460px] p-6">
        <h2 className="text-[18px] font-bold text-navy-800">Batalkan transaksi</h2>
        <p className="mt-1 text-[13px] text-ink-400">
          {order.clientRef.slice(-10)} · {rupiah(order.total)}. Transaksi tidak dihapus — dibuat transaksi balik.
        </p>

        <p className="mt-4 text-[12.5px] font-medium text-ink-600">Alasan wajib</p>
        <div className="mt-2 grid gap-1.5">
          {[...REASONS, 'Lainnya'].map((r) => (
            <button key={r} onClick={() => setReason(r)}
              className={`key py-2.5 px-3 text-left text-[13px] ${reason === r ? 'key-primary' : 'key-ghost'}`}>
              {r}
            </button>
          ))}
        </div>
        {reason === 'Lainnya' && (
          <input
            autoFocus value={other} onChange={(e) => setOther(e.target.value)}
            placeholder="Tulis alasan"
            className="mt-2 w-full h-11 px-3 rounded-lg border border-line text-[13.5px] outline-none focus:border-navy-200"
          />
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="key key-ghost py-3.5 text-[14px]">Kembali</button>
          <button onClick={() => onConfirm(order, final)} disabled={final.length < 3}
            className="key py-3.5 text-[14px] bg-brick-500 text-white disabled:opacity-40">
            Batalkan
          </button>
        </div>
      </div>
    </div>
  );
}

const Tag = ({ label, tone }: { label: string; tone?: 'bad' }) => (
  <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${
    tone === 'bad' ? 'bg-red-100 text-brick-500' : 'bg-navy-50 text-navy-600'}`}>
    {label}
  </span>
);
