import { useEffect, useState } from 'react';
import { STASIUN_LABEL, TIKET, jam, umurMenit, urgensi, type Stasiun, type Tiket } from '../lib/data';
import { ambilTiket, majukanTiket, tandaiBaris } from '../lib/api';

const WARNA = {
  aman: { border: 'border-line', chip: 'bg-leaf-100 text-leaf-700' },
  dekat: { border: 'border-amber-500/50', chip: 'bg-orange-100 text-amber-500' },
  lewat: { border: 'border-brick-500/60', chip: 'bg-red-100 text-brick-500' },
} as const;

const JENIS: Record<Tiket['jenis'], string> = {
  DINE_IN: 'Makan di tempat', TAKEAWAY: 'Bawa pulang', DELIVERY: 'Antar',
};

/**
 * Rel tiket. Diurutkan dari yang paling lama menunggu, bukan dari yang terbaru —
 * dapur harus selalu melihat pesanan paling terlambat lebih dulu.
 */
export function Antrean() {
  const [tiket, setTiket] = useState<Tiket[]>(TIKET);
  const [stasiun, setStasiun] = useState<Stasiun | 'SEMUA'>('SEMUA');
  const [, tick] = useState(0);

  // Timer di kartu harus hidup; dapur membaca menit, bukan jam masuk.
  // Tarikan ulang tiap 10 detik: pesanan baru dari kasir harus muncul sendiri,
  // tanpa ada yang menyentuh layar berminyak.
  useEffect(() => {
    const segarkan = () => { void ambilTiket().then(setTiket); };
    segarkan();
    const t = setInterval(() => { tick((n) => n + 1); segarkan(); }, 10_000);
    return () => clearInterval(t);
  }, []);

  const tampil = tiket
    .filter((t) => t.status !== 'DIANTAR')
    .filter((t) => stasiun === 'SEMUA' || t.items.some((i) => i.stasiun === stasiun))
    .sort((a, b) => a.masukPada.localeCompare(b.masukPada));

  // Layar diperbarui lebih dulu, server menyusul: juru masak tidak boleh
  // menunggu jaringan untuk mencentang satu piring.
  const toggleItem = (tid: string, idx: number) => {
    const t0 = tiket.find((t) => t.id === tid);
    const item = t0?.items[idx];
    setTiket((all) => all.map((t) => {
      if (t.id !== tid) return t;
      const items = t.items.map((i, k) => (k === idx ? { ...i, siap: !i.siap } : i));
      const semuaSiap = items.every((i) => i.siap);
      return { ...t, items, status: semuaSiap ? 'SIAP' : t.status === 'BARU' ? 'DIMASAK' : t.status };
    }));
    if (item?.id) void tandaiBaris(item.id, !item.siap);
  };

  const bump = (tid: string) => {
    const t0 = tiket.find((t) => t.id === tid);
    const tujuan = t0?.status === 'SIAP' ? 'DIANTAR' : 'SIAP';
    setTiket((all) => all.map((t) => {
      if (t.id !== tid) return t;
      if (t.status === 'SIAP') return { ...t, status: 'DIANTAR' };
      return { ...t, status: 'SIAP', items: t.items.map((i) => ({ ...i, siap: true })) };
    }));
    void majukanTiket(tid, tujuan);
  };

  const lewat = tampil.filter((t) => urgensi(t) === 'lewat').length;

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['SEMUA', 'PANAS', 'DINGIN', 'BAR', 'DESSERT'] as const).map((s) => {
          const n = s === 'SEMUA' ? tampil.length
            : tiket.filter((t) => t.status !== 'DIANTAR' && t.items.some((i) => i.stasiun === s)).length;
          return (
            <button key={s} onClick={() => setStasiun(s)}
              className={`px-4 h-11 rounded-xl text-[14px] font-medium transition-colors ${
                stasiun === s ? 'bg-navy-700 text-white' : 'bg-white border border-line text-ink-600 hover:bg-navy-50'}`}>
              {s === 'SEMUA' ? 'Semua' : STASIUN_LABEL[s]}
              <span className={`ml-2 text-[12px] ${stasiun === s ? 'text-white/70' : 'text-ink-400'}`}>{n}</span>
            </button>
          );
        })}
        {lewat > 0 && (
          <span className="ml-auto px-3 h-11 grid place-items-center rounded-xl bg-red-100 text-brick-500 text-[13.5px] font-semibold">
            {lewat} pesanan lewat waktu
          </span>
        )}
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
        {tampil.map((t) => {
          const u = urgensi(t);
          const menit = umurMenit(t.masukPada);
          const items = stasiun === 'SEMUA' ? t.items : t.items.filter((i) => i.stasiun === stasiun);

          return (
            <article key={t.id} className={`bg-white rounded-xl border-2 ${WARNA[u].border} shadow-sm flex flex-col`}>
              <header className="px-4 py-3 border-b border-line">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-bold text-navy-800">
                    {t.meja ? `Meja ${t.meja}` : t.nomor.slice(-4)}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-[15px] font-bold tabular-nums ${WARNA[u].chip}`}>
                    {menit}′
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-400">
                  {JENIS[t.jenis]} · {jam(t.masukPada)} · target {t.targetMenit}′
                  {t.pramusaji ? ` · ${t.pramusaji}` : ''}
                </p>
              </header>

              <ul className="flex-1 px-2 py-1.5">
                {items.map((i) => {
                  const idx = t.items.indexOf(i);
                  return (
                    <li key={idx}>
                      <button onClick={() => toggleItem(t.id, idx)}
                        className={`w-full text-left px-2.5 py-2.5 rounded-lg flex items-start gap-3 transition-colors ${
                          i.siap ? 'opacity-45' : 'hover:bg-navy-50'}`}>
                        <span className={`mt-0.5 grid place-items-center w-6 h-6 rounded-md border-2 shrink-0 ${
                          i.siap ? 'bg-leaf-600 border-leaf-600 text-white' : 'border-line'}`}>
                          {i.siap ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[15px] font-semibold text-navy-800 ${i.siap ? 'line-through' : ''}`}>
                            {i.qty}× {i.nama}
                          </span>
                          {i.catatan && (
                            <span className="block text-[13px] font-medium text-amber-500">* {i.catatan}</span>
                          )}
                          {stasiun === 'SEMUA' && (
                            <span className="block text-[11.5px] text-ink-400">{STASIUN_LABEL[i.stasiun]}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <footer className="p-2.5 border-t border-line">
                <button onClick={() => bump(t.id)}
                  className={`w-full py-3.5 rounded-xl text-[15px] font-semibold transition-transform active:scale-[.98] ${
                    t.status === 'SIAP' ? 'bg-navy-700 text-white' : 'bg-leaf-600 text-white'}`}>
                  {t.status === 'SIAP' ? 'Sudah Diantar' : 'Tandai Siap'}
                </button>
              </footer>
            </article>
          );
        })}

        {tampil.length === 0 && (
          <p className="col-span-full py-24 text-center text-[15px] text-ink-400">
            Tidak ada pesanan di antrean. Dapur bersih.
          </p>
        )}
      </div>
    </div>
  );
}
