import { useState } from 'react';
import { newRef, rupiah, store } from '../lib/store';
import { flush, refreshPending } from '../lib/sync';

const FLOATS = [200_000, 300_000, 500_000, 1_000_000];

/** Opening a shift is the first control event: who, where, how much cash. */
export function OpenShift({ onOpened }: { onOpened: () => void }) {
  // The cashier is already known from PIN sign-in; the shift only needs the float.
  const cashier = store.cashier();
  const [site, setSite] = useState(store.siteCode());
  const [floatAmount, setFloatAmount] = useState(300_000);

  const open = () => {
    if (!cashier.trim()) return;
    const clientRef = newRef('ses');
    const at = new Date().toISOString();

    store.setSiteCode(site);
    store.setSession({
      clientRef, siteCode: site, cashier, cashierRef: store.cashierRef() || undefined,
      openedAt: at, openingFloat: floatAmount,
    });
    store.enqueue({
      type: 'SESSION_OPEN', clientRef, at, siteCode: site,
      openingFloat: floatAmount, cashierRef: store.cashierRef() || undefined,
    });
    refreshPending();
    void flush();
    onOpened();
  };

  return (
    <div className="h-full grid place-items-center p-6">
      <div className="tile w-full max-w-[520px] p-8">
        <h1 className="text-[22px] font-bold text-navy-800">Buka Shift</h1>
        <p className="mt-1 text-[13px] text-ink-400">Hitung modal awal laci sebelum mulai berjualan.</p>

        <div className="mt-6 rounded-xl bg-canvas px-4 py-3">
          <p className="text-[12px] text-ink-400">Kasir</p>
          <p className="text-[15px] font-semibold text-navy-800">{cashier}</p>
        </div>

        <label className="block mt-4 text-[13px] font-medium text-ink-600">Outlet</label>
        <select
          value={site} onChange={(e) => setSite(e.target.value)}
          className="mt-1.5 w-full h-12 px-3 rounded-xl border border-line text-[15px] bg-white outline-none focus:border-navy-200"
        >
          <option value="RESTO-01">RESTO-01 — Main Restaurant</option>
          <option value="RESTO-02">RESTO-02 — Second Outlet</option>
        </select>

        <label className="block mt-4 text-[13px] font-medium text-ink-600">Modal awal laci</label>
        <div className="mt-1.5 grid grid-cols-4 gap-2">
          {FLOATS.map((f) => (
            <button key={f} onClick={() => setFloatAmount(f)}
              className={`key py-3 text-[14px] ${floatAmount === f ? 'key-primary' : 'key-ghost'}`}>
              {(f / 1000).toLocaleString('id-ID')} rb
            </button>
          ))}
        </div>
        <input
          type="number" value={floatAmount} min={0} step={50_000}
          onChange={(e) => setFloatAmount(Math.max(0, Number(e.target.value)))}
          className="mt-2 w-full h-12 px-4 rounded-xl border border-line text-[16px] tabular-nums outline-none focus:border-navy-200"
        />
        <p className="mt-1.5 text-[12px] text-ink-400">{rupiah(floatAmount)}</p>

        <button onClick={open} disabled={!cashier.trim()}
          className="key key-leaf w-full mt-7 py-4 text-[16px] disabled:opacity-40">
          Mulai Shift
        </button>
      </div>
    </div>
  );
}
