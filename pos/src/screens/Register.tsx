import { useMemo, useState } from 'react';
import { StatusBar } from '../components/StatusBar';
import { Payment } from './Payment';
import { useBarcodeScanner } from '../lib/scanner';
import {
  ORDER_TYPE_LABEL, newRef, rupiah, store,
  type CartLine, type CatalogItem, type HeldOrder, type OrderType,
} from '../lib/store';

const ORDER_TYPES: OrderType[] = ['DINE_IN', 'TAKEAWAY', 'DELIVERY'];

/** The selling screen: menu on the left, running bill on the right. */
export function Register({
  catalog, onCloseShift, onOrders,
}: { catalog: CatalogItem[]; onCloseShift: () => void; onOrders: () => void }) {
  const categories = useMemo(() => [...new Set(catalog.map((c) => c.category))], [catalog]);
  const [cat, setCat] = useState(categories[0] ?? '');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [tableNo, setTableNo] = useState('');
  const [paying, setPaying] = useState(false);
  const [held, setHeld] = useState<HeldOrder[]>(() => store.held());
  const [toast, setToast] = useState('');
  const [noteFor, setNoteFor] = useState<number | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.filter((c) => (needle ? c.name.toLowerCase().includes(needle) : c.category === cat));
  }, [catalog, cat, q]);

  const total = cart.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const add = (item: CatalogItem) => {
    // Pagar terakhir: kalaupun tombolnya tertekan, menu yang dimatikan dapur
    // tidak boleh masuk keranjang.
    if (item.available === false) {
      flash(`${item.name} sedang habis${item.unavailableReason ? ` — ${item.unavailableReason}` : ''}`);
      return;
    }
    tambah(item);
  };

  const tambah = (item: CatalogItem) => setCart((c) => {
    const at = c.findIndex((l) => l.productCode === item.code && !l.note);
    if (at >= 0) {
      const next = [...c];
      next[at] = { ...next[at]!, qty: next[at]!.qty + 1 };
      return next;
    }
    return [...c, { productCode: item.code, name: item.name, qty: 1, unitPrice: item.price }];
  });

  // Any USB scanner works: it types the code and presses Enter.
  useBarcodeScanner((code) => {
    const hit = catalog.find((c) => c.barcode === code || c.code === code)
      ?? catalog.find((c) => c.code.toUpperCase() === code.toUpperCase());
    if (!hit) { flash(`Barcode ${code} tidak dikenal`); return; }
    if (hit.available === false) { flash(`${hit.name} sedang habis`); return; }
    tambah(hit); flash(`+ ${hit.name}`);
  }, !paying);

  const bump = (i: number, by: number) => setCart((c) =>
    c.flatMap((l, idx) => (idx === i ? (l.qty + by <= 0 ? [] : [{ ...l, qty: l.qty + by }]) : [l])));

  const setNote = (i: number, note: string) => setCart((c) =>
    c.map((l, idx) => (idx === i ? { ...l, note: note.trim() || undefined } : l)));

  const holdOrder = () => {
    if (cart.length === 0) return;
    const label = tableNo.trim() || `Simpan ${held.length + 1}`;
    const h: HeldOrder = { id: newRef('hold'), label, orderType, lines: cart, heldAt: new Date().toISOString() };
    store.hold(h);
    setHeld(store.held());
    setCart([]); setTableNo('');
    flash(`Pesanan "${label}" disimpan`);
  };

  const recall = (h: HeldOrder) => {
    if (cart.length > 0) { flash('Selesaikan atau simpan pesanan aktif dulu'); return; }
    setCart(h.lines); setOrderType(h.orderType); setTableNo(h.label);
    store.release(h.id); setHeld(store.held());
  };

  const session = store.session()!;

  return (
    <div className="h-full flex flex-col">
      <StatusBar right={
        <>
          <button onClick={onOrders} className="key key-ghost px-4 h-9 text-[13px]">Transaksi</button>
          <button onClick={onCloseShift} className="key key-ghost px-4 h-9 text-[13px]">Tutup Shift</button>
        </>
      } />

      <div className="flex-1 min-h-0 flex">
        {/* menu */}
        <div className="flex-1 min-w-0 flex flex-col p-4 gap-3">
          <div className="flex gap-2 items-center">
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari menu / scan barcode…"
              className="h-11 px-4 rounded-xl border border-line text-[14px] w-[260px] outline-none focus:border-navy-200 bg-white"
            />
            <div className="flex gap-2 overflow-x-auto">
              {categories.map((c) => (
                <button key={c} onClick={() => { setCat(c); setQ(''); }}
                  className={`key px-4 h-11 text-[13.5px] whitespace-nowrap ${cat === c && !q ? 'key-primary' : 'key-ghost'}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {held.length > 0 && (
            <div className="flex gap-2 items-center overflow-x-auto">
              <span className="text-[12px] text-ink-400 shrink-0">Ditahan:</span>
              {held.map((h) => (
                <button key={h.id} onClick={() => recall(h)}
                  className="key key-ghost px-3 h-9 text-[12.5px] whitespace-nowrap border-amber-500/40">
                  {h.label} · {h.lines.reduce((s, l) => s + l.qty, 0)} item
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
              {items.map((item) => {
                const habis = item.available === false;
                return (
                  <button key={item.code} onClick={() => add(item)} disabled={habis}
                    className={`key h-[104px] p-3 text-left flex flex-col justify-between ${
                      habis ? 'bg-slate-100 border border-line cursor-not-allowed' : 'key-ghost'}`}>
                    <span className={`text-[13.5px] leading-snug line-clamp-2 ${habis ? 'text-ink-400 line-through' : 'text-navy-800'}`}>
                      {item.name}
                    </span>
                    {habis ? (
                      <span className="text-[11.5px] font-semibold text-brick-500 line-clamp-2">
                        Habis{item.unavailableReason ? ` — ${item.unavailableReason}` : ''}
                      </span>
                    ) : (
                      <span className="text-[14px] font-bold text-leaf-700 tabular-nums">{rupiah(item.price)}</span>
                    )}
                  </button>
                );
              })}
              {items.length === 0 && (
                <p className="col-span-full py-16 text-center text-[13px] text-ink-400">Menu tidak ditemukan</p>
              )}
            </div>
          </div>
        </div>

        {/* bill */}
        <aside className="w-[392px] shrink-0 bg-white border-l border-line flex flex-col">
          <header className="px-4 pt-3 pb-3 border-b border-line">
            <div className="grid grid-cols-3 gap-1.5">
              {ORDER_TYPES.map((t) => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={`key py-2 text-[12px] ${orderType === t ? 'key-primary' : 'key-ghost'}`}>
                  {ORDER_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            {orderType === 'DINE_IN' && (
              <input
                value={tableNo} onChange={(e) => setTableNo(e.target.value)}
                placeholder="Nomor meja"
                className="mt-2 w-full h-10 px-3 rounded-lg border border-line text-[13.5px] outline-none focus:border-navy-200"
              />
            )}
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11.5px] text-ink-400">Shift {session.clientRef.slice(-6)} · {count} item</span>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-[12px] text-brick-500 hover:underline">Kosongkan</button>
              )}
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
            {cart.length === 0 && (
              <p className="py-24 text-center text-[13px] text-ink-400">Pilih menu atau scan barcode</p>
            )}
            {cart.map((l, i) => (
              <div key={`${l.productCode}-${i}`} className="py-2.5 border-b border-line last:border-0">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-navy-800 truncate">{l.name}</p>
                    <p className="text-[12px] text-ink-400 tabular-nums">{rupiah(l.unitPrice)}</p>
                  </div>
                  <button onClick={() => bump(i, -1)} className="key key-ghost w-9 h-9 text-[18px] leading-none">−</button>
                  <span className="w-7 text-center text-[14px] font-semibold tabular-nums">{l.qty}</span>
                  <button onClick={() => bump(i, 1)} className="key key-ghost w-9 h-9 text-[18px] leading-none">+</button>
                  <span className="w-[86px] text-right text-[13.5px] font-semibold tabular-nums text-navy-800">
                    {rupiah(l.qty * l.unitPrice)}
                  </span>
                </div>
                {noteFor === i ? (
                  <input
                    autoFocus defaultValue={l.note ?? ''}
                    onBlur={(e) => { setNote(i, e.target.value); setNoteFor(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="Catatan: pedas, tanpa bawang…"
                    className="mt-1.5 w-full h-9 px-3 rounded-lg border border-line text-[12.5px] outline-none focus:border-navy-200"
                  />
                ) : (
                  <button onClick={() => setNoteFor(i)}
                    className={`mt-1 text-[12px] ${l.note ? 'text-amber-500' : 'text-ink-400'} hover:underline`}>
                    {l.note ? `* ${l.note}` : '+ catatan'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <footer className="p-4 border-t border-line">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-500">Total</span>
              <span className="text-[26px] font-bold text-navy-800 tabular-nums">{rupiah(total)}</span>
            </div>
            <div className="grid grid-cols-[1fr_2fr] gap-2 mt-3">
              <button onClick={holdOrder} disabled={cart.length === 0}
                className="key key-ghost py-4 text-[14px] disabled:opacity-40">Tahan</button>
              <button onClick={() => setPaying(true)} disabled={cart.length === 0}
                className="key key-leaf py-4 text-[17px] disabled:opacity-40">Bayar</button>
            </div>
          </footer>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl bg-navy-800 text-white text-[13px] shadow-lg">
          {toast}
        </div>
      )}

      {paying && (
        <Payment
          cart={cart} total={total} sessionRef={session.clientRef}
          orderType={orderType} tableNo={tableNo.trim() || undefined}
          onCancel={() => setPaying(false)}
          onDone={() => { setPaying(false); setCart([]); setTableNo(''); }}
        />
      )}
    </div>
  );
}
