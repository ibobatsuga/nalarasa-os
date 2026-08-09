import { useEffect, useState } from 'react';
import { Antrean } from './screens/Antrean';
import { Menu } from './screens/Menu';
import { Stok } from './screens/Stok';
import { BAHAN, MENU, PREP, TIKET, urgensi } from './lib/data';
import { Masuk } from './screens/Masuk';
import { sesi } from './lib/auth';

type Layar = 'antrean' | 'menu' | 'stok';

const TAB: Array<{ key: Layar; label: string }> = [
  { key: 'antrean', label: 'Antrean' },
  { key: 'menu', label: 'Menu & 86' },
  { key: 'stok', label: 'Prep & Stok' },
];

/**
 * Navigasi dapur memakai bar atas, bukan sidebar: layarnya menempel di dinding
 * dan disentuh dengan tangan berminyak. Tiga tab, target sentuh besar, tanpa
 * menu bertingkat.
 */
export default function App() {
  // Sesi diperiksa sebelum data dimuat: layar yang tampak normal padahal
  // setiap permintaannya ditolak server lebih berbahaya daripada layar masuk.
  const [masuk, setMasuk] = useState(() => sesi() !== null);
  const [layar, setLayar] = useState<Layar>('antrean');
  const [jam, setJam] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setJam(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const antre = TIKET.filter((t) => t.status !== 'DIANTAR');
  const lewat = antre.filter((t) => urgensi(t) === 'lewat').length;
  const badge: Record<Layar, number> = {
    antrean: antre.length,
    menu: MENU.filter((m) => !m.tersedia).length,
    stok: PREP.filter((p) => p.status !== 'SELESAI').length + BAHAN.filter((b) => b.stok <= b.minimum).length,
  };

  if (!masuk) {
    return <Masuk onMasuk={() => { setMasuk(true); window.location.reload(); }} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-16 shrink-0 flex items-center gap-3 px-4 bg-white border-b border-line">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-leaf-600 text-white shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-5 h-5">
            <path d="M4 20c0-8 6-14 16-15 0 10-5 15-11 15H4z" strokeLinejoin="round" />
          </svg>
        </span>
        <div className="leading-tight mr-2">
          <div className="text-[15px] font-bold text-navy-800">Dapur</div>
          <div className="text-[11.5px] text-ink-400">RESTO-01</div>
        </div>

        <nav className="flex gap-2">
          {TAB.map((t) => (
            <button key={t.key} onClick={() => setLayar(t.key)}
              className={`px-5 h-11 rounded-xl text-[15px] font-semibold transition-colors ${
                layar === t.key ? 'bg-navy-700 text-white' : 'bg-canvas border border-line text-ink-600 hover:bg-navy-50'}`}>
              {t.label}
              {badge[t.key] > 0 && (
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[11.5px] ${
                  layar === t.key ? 'bg-white/20' : 'bg-orange-100 text-amber-500'}`}>
                  {badge[t.key]}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {lewat > 0 && (
            <span className="px-3 h-11 grid place-items-center rounded-xl bg-red-100 text-brick-500 text-[14px] font-bold">
              {lewat} lewat waktu
            </span>
          )}
          <span className="text-[20px] font-bold tabular-nums text-navy-800">
            {jam.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto bg-canvas">
        {layar === 'antrean' && <Antrean />}
        {layar === 'menu' && <Menu />}
        {layar === 'stok' && <Stok />}
      </main>
    </div>
  );
}
