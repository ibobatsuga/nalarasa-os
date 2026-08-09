import { useState } from 'react';
import { StatusBar } from '../components/StatusBar';
import { cashPosition, newRef, rupiah, store } from '../lib/store';
import { flush, refreshPending, syncState } from '../lib/sync';

const TENDER_LABEL: Record<string, string> = {
  CASH: 'Tunai', QRIS: 'QRIS', CARD: 'Kartu', EWALLET: 'E-Wallet',
};

/**
 * Closing counts the drawer and computes the variance the back office will
 * route through AR25P. The cashier sees the number before it leaves the till.
 */
export function CloseShift({ onBack, onClosed }: { onBack: () => void; onClosed: () => void }) {
  const session = store.session()!;
  const pos = cashPosition(session, store.orders());
  const [countedText, setCountedText] = useState('');
  const [done, setDone] = useState(false);

  const counted = Number(countedText || 0);
  const variance = counted - pos.expectedCash;

  const close = () => {
    const clientRef = newRef('cls');
    const at = new Date().toISOString();
    store.enqueue({ type: 'SESSION_CLOSE', clientRef, at, sessionRef: session.clientRef, countedCash: counted });
    store.setSession({ ...session, closedAt: at, countedCash: counted });
    refreshPending();
    void flush();
    setDone(true);
  };

  if (done) {
    const pending = syncState().pending;
    return (
      <div className="h-full flex flex-col">
        <StatusBar />
        <div className="flex-1 grid place-items-center p-6">
          <div className="tile w-full max-w-[480px] p-8 text-center">
            <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-leaf-100 text-leaf-700 text-[30px]">✓</div>
            <h2 className="mt-4 text-[20px] font-bold text-navy-800">Shift ditutup</h2>
            <p className="mt-1 text-[13px] text-ink-400">
              {pending > 0
                ? `${pending} data masih menunggu kirim. Jangan matikan komputer sampai terkirim.`
                : 'Semua transaksi sudah terkirim ke pusat.'}
            </p>
            <div className="mt-5 rounded-xl bg-canvas p-4 text-left space-y-1.5 text-[13px]">
              <Line label="Penjualan" value={rupiah(pos.grossSales)} />
              <Line label="Kas seharusnya" value={rupiah(pos.expectedCash)} />
              <Line label="Kas dihitung" value={rupiah(counted)} />
              <Line label="Selisih" value={rupiah(variance)} tone={variance === 0 ? 'flat' : variance < 0 ? 'bad' : 'good'} />
            </div>
            <button onClick={() => { store.setSession(null); onClosed(); }}
              className="key key-primary w-full mt-6 py-3.5 text-[15px]">
              Selesai
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <StatusBar right={<button onClick={onBack} className="key key-ghost px-4 h-9 text-[13px]">Kembali</button>} />

      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-[860px] grid gap-4 md:grid-cols-2">
          <section className="tile p-6">
            <h2 className="text-[16px] font-bold text-navy-800">Ringkasan shift</h2>
            <p className="mt-1 text-[12.5px] text-ink-400">
              {session.cashier} · dibuka {new Date(session.openedAt).toLocaleString('id-ID')}
            </p>
            <div className="mt-4 space-y-2 text-[13.5px]">
              <Line label="Jumlah transaksi" value={String(pos.orderCount)} />
              <Line label="Total penjualan" value={rupiah(pos.grossSales)} />
              <div className="h-px bg-line my-2" />
              {pos.byTender.map((t) => (
                <Line key={t.tender} label={`${TENDER_LABEL[t.tender]} (${t.count})`} value={rupiah(t.amount)} muted />
              ))}
              <div className="h-px bg-line my-2" />
              <Line label="Modal awal" value={rupiah(session.openingFloat)} muted />
              <Line label="Kas seharusnya" value={rupiah(pos.expectedCash)} strong />
            </div>
          </section>

          <section className="tile p-6">
            <h2 className="text-[16px] font-bold text-navy-800">Hitung kas laci</h2>
            <p className="mt-1 text-[12.5px] text-ink-400">Masukkan jumlah uang tunai yang benar-benar ada.</p>

            <input
              autoFocus type="number" value={countedText} min={0} step={1000}
              onChange={(e) => setCountedText(e.target.value)}
              placeholder="0"
              className="mt-4 w-full h-16 px-4 rounded-xl border border-line text-right text-[26px] font-bold tabular-nums outline-none focus:border-navy-200"
            />

            <div className={`mt-4 rounded-xl p-4 ${
              countedText === '' ? 'bg-canvas' : variance === 0 ? 'bg-leaf-100' : 'bg-red-50'}`}>
              <p className="text-[12.5px] text-ink-500">Selisih</p>
              <p className={`text-[28px] font-bold tabular-nums ${
                countedText === '' ? 'text-ink-400' : variance === 0 ? 'text-leaf-700' : 'text-brick-500'}`}>
                {countedText === '' ? '—' : `${variance > 0 ? '+' : ''}${rupiah(variance)}`}
              </p>
              {countedText !== '' && variance !== 0 && (
                <p className="mt-1 text-[12px] text-ink-500">
                  Selisih akan diajukan ke supervisor untuk disetujui.
                </p>
              )}
            </div>

            <button onClick={close} disabled={countedText === ''}
              className="key key-leaf w-full mt-6 py-4 text-[16px] disabled:opacity-40">
              Tutup Shift
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value, muted, strong, tone }: {
  label: string; value: string; muted?: boolean; strong?: boolean;
  tone?: 'good' | 'bad' | 'flat';
}) {
  const color = tone === 'bad' ? 'text-brick-500' : tone === 'good' ? 'text-leaf-700' : strong ? 'text-navy-800' : 'text-ink-700';
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={muted ? 'text-ink-400' : 'text-ink-500'}>{label}</span>
      <span className={`tabular-nums ${strong || tone ? 'font-bold' : 'font-medium'} ${color}`}>{value}</span>
    </div>
  );
}
