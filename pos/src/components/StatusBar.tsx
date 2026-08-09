import { useEffect, useState } from 'react';
import { flush, subscribe, type SyncState } from '../lib/sync';
import { store } from '../lib/store';

/**
 * The cashier must always be able to answer one question at a glance:
 * "is my shift's money already recorded on the server, or still only here?"
 */
export function StatusBar({ right }: { right?: React.ReactNode }) {
  const [s, setS] = useState<SyncState | null>(null);
  useEffect(() => subscribe(setS), []);
  if (!s) return null;

  const tone = !s.online ? 'bg-amber-500' : s.pending > 0 ? 'bg-navy-500' : 'bg-leaf-600';
  const label = !s.online
    ? `Offline — ${s.pending} transaksi tersimpan di kasir`
    : s.syncing ? 'Mengirim…'
    : s.pending > 0 ? `${s.pending} menunggu kirim`
    : 'Tersambung · semua terkirim';

  return (
    <div className="flex items-center gap-3 px-5 h-14 bg-white border-b border-line shrink-0">
      <span className="grid place-items-center w-9 h-9 rounded-lg bg-leaf-600 text-white font-bold text-[15px]">N</span>
      <div className="leading-tight">
        <div className="text-[14px] font-semibold text-navy-700">{store.siteCode()}</div>
        <div className="text-[11.5px] text-ink-400">{store.cashier() || 'Kasir'}</div>
      </div>

      <button
        onClick={() => void flush()}
        title="Kirim sekarang"
        className="ml-4 flex items-center gap-2 px-3 h-9 rounded-lg border border-line hover:bg-navy-50"
      >
        <span className={`w-2.5 h-2.5 rounded-full ${tone} ${s.syncing ? 'animate-pulse' : ''}`} />
        <span className="text-[12.5px] text-ink-600">{label}</span>
      </button>

      {s.lastError && (
        <span className="text-[12px] text-brick-500 truncate max-w-[280px]">{s.lastError}</span>
      )}

      <div className="ml-auto flex items-center gap-3">{right}</div>
    </div>
  );
}
