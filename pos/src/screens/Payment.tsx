import { useRef, useState } from 'react';
import { Receipt } from '../components/Receipt';
import { printReceipt } from '../lib/printer';
import { flush, refreshPending } from '../lib/sync';
import {
  newRef, rupiah, store,
  type CartLine, type LocalOrder, type OrderType, type Tender,
} from '../lib/store';

const TENDERS: Array<{ key: Tender; label: string }> = [
  { key: 'CASH', label: 'Tunai' },
  { key: 'QRIS', label: 'QRIS' },
  { key: 'CARD', label: 'Kartu' },
  { key: 'EWALLET', label: 'E-Wallet' },
];

/** Rounds up to the next note the customer is likely to hand over. */
const suggestions = (total: number) => {
  const steps = [1_000, 5_000, 10_000, 20_000, 50_000, 100_000];
  const out = new Set<number>([total]);
  for (const s of steps) {
    const up = Math.ceil(total / s) * s;
    if (up >= total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 6);
};

export function Payment({
  cart, total, sessionRef, orderType, tableNo, onCancel, onDone,
}: {
  cart: CartLine[]; total: number; sessionRef: string;
  orderType: OrderType; tableNo?: string;
  onCancel: () => void; onDone: () => void;
}) {
  const [tender, setTender] = useState<Tender>('CASH');
  const [paidText, setPaidText] = useState('');
  const [gatewayRef, setGatewayRef] = useState('');
  const [done, setDone] = useState<LocalOrder | null>(null);
  const [printedVia, setPrintedVia] = useState<string>('');

  const paid = tender === 'CASH' ? Number(paidText || 0) : total;
  const change = Math.max(0, paid - total);
  const short = tender === 'CASH' && paid < total;

  const press = (d: string) => setPaidText((v) => (d === '⌫' ? v.slice(0, -1) : d === 'C' ? '' : v + d));

  /**
   * Penjaga klik ganda. Layar sentuh mengirim touchend lalu click, dan kasir
   * yang tidak yakin akan menekan dua kali. `done` tidak menolong: state React
   * baru berlaku setelah render berikutnya. Yang lebih berbahaya, tiap panggilan
   * mencetak clientRef BARU — jadi idempotensi server justru melihat dua
   * transaksi sah, dan omzet hari itu tercatat dobel.
   */
  const sedangMenutup = useRef(false);

  const settle = () => {
    if (short || sedangMenutup.current) return;
    sedangMenutup.current = true;
    const clientRef = newRef('ord');
    const at = new Date().toISOString();

    const order: LocalOrder = {
      clientRef, at, sessionRef, lines: cart, total, tenderType: tender,
      paid, change, gatewayRef: gatewayRef || undefined,
      orderType, tableNo,
      cashierRef: store.cashierRef() || undefined, cashierName: store.cashier(),
    };

    // Local first. The queue is the source of truth until the server confirms.
    store.addOrder(order);
    store.enqueue({
      type: 'ORDER', clientRef, at, sessionRef, total, tenderType: tender,
      gatewayRef: gatewayRef || undefined, orderType, tableNo,
      cashierRef: store.cashierRef() || undefined, lines: cart,
    });
    refreshPending();
    void flush();
    setDone(order);

    // Cash sales pop the drawer; card and QRIS do not.
    void printReceipt(
      { outlet: store.siteCode(), cashier: store.cashier(), order },
      tender === 'CASH',
    ).then((via) => setPrintedVia(via));
  };

  if (done) {
    return (
      <Overlay>
        <Receipt order={done} cashier={store.cashier()} />
        <div className="tile w-full max-w-[420px] p-8 text-center print:hidden">
          <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-leaf-100 text-leaf-700 text-[30px]">✓</div>
          <h2 className="mt-4 text-[20px] font-bold text-navy-800">Pembayaran diterima</h2>
          <p className="mt-1 text-[13px] text-ink-400">Struk {done.clientRef.slice(-8)}</p>

          {tender === 'CASH' && (
            <div className="mt-5 rounded-xl bg-canvas p-4">
              <p className="text-[13px] text-ink-500">Kembalian</p>
              <p className="text-[30px] font-bold text-navy-800 tabular-nums">{rupiah(done.change)}</p>
            </div>
          )}

          <p className="mt-3 h-8 text-[11.5px] text-ink-400 leading-snug">
            {printedVia === 'AGENT' ? 'Struk tercetak · laci terbuka'
              : printedVia === 'NONE' ? 'Printer termal tidak terhubung. Tekan Cetak Ulang bila tamu minta struk.'
              : ''}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => void printReceipt({ outlet: store.siteCode(), cashier: store.cashier(), order: done }, false, true)}
              className="key key-ghost py-3.5 text-[14px]">Cetak Ulang</button>
            <button onClick={onDone} className="key key-leaf py-3.5 text-[14px]">Transaksi Baru</button>
          </div>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div className="tile w-full max-w-[720px] p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold text-navy-800">Pembayaran</h2>
          <span className="text-[26px] font-bold text-navy-800 tabular-nums">{rupiah(total)}</span>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {TENDERS.map((t) => (
            <button key={t.key} onClick={() => setTender(t.key)}
              className={`key py-3.5 text-[14px] ${tender === t.key ? 'key-primary' : 'key-ghost'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tender === 'CASH' ? (
          <div className="mt-5 grid grid-cols-[1fr_240px] gap-5">
            <div>
              <div className="grid grid-cols-3 gap-2">
                {suggestions(total).map((s) => (
                  <button key={s} onClick={() => setPaidText(String(s))}
                    className="key key-ghost py-3 text-[13.5px] tabular-nums">{rupiah(s)}</button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((d) => (
                  <button key={d} onClick={() => press(d)} className="key key-num">{d}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[12.5px] text-ink-500">Uang diterima</label>
              <div className="mt-1 h-14 px-4 rounded-xl border border-line grid items-center text-right text-[22px] font-bold tabular-nums text-navy-800">
                {rupiah(paid)}
              </div>
              <label className="mt-4 text-[12.5px] text-ink-500">Kembalian</label>
              <div className={`mt-1 h-14 px-4 rounded-xl grid items-center text-right text-[22px] font-bold tabular-nums ${
                short ? 'bg-red-50 text-brick-500' : 'bg-leaf-100 text-leaf-700'}`}>
                {short ? 'Kurang' : rupiah(change)}
              </div>
              <div className="mt-auto pt-4 grid grid-cols-2 gap-2">
                <button onClick={onCancel} className="key key-ghost py-3.5 text-[14px]">Batal</button>
                <button onClick={settle} disabled={short} className="key key-leaf py-3.5 text-[14px] disabled:opacity-40">Selesai</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5">
            <label className="text-[12.5px] text-ink-500">Nomor referensi {TENDERS.find((t) => t.key === tender)?.label}</label>
            <input
              autoFocus value={gatewayRef} onChange={(e) => setGatewayRef(e.target.value)}
              placeholder="Tempel / scan referensi transaksi"
              className="mt-1.5 w-full h-14 px-4 rounded-xl border border-line text-[16px] outline-none focus:border-navy-200"
            />
            <p className="mt-2 text-[12px] text-ink-400">
              Referensi dipakai untuk rekonsiliasi settlement gateway. Boleh dikosongkan, tapi baris ini akan tampil sebagai belum cocok.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button onClick={onCancel} className="key key-ghost py-3.5 text-[14px]">Batal</button>
              <button onClick={settle} className="key key-leaf py-3.5 text-[14px]">Selesai</button>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="fixed inset-0 z-50 bg-navy-900/40 grid place-items-center p-6 print:bg-transparent print:block print:p-0">
    {children}
  </div>
);
