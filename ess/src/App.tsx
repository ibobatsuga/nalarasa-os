import { useCallback, useEffect, useState } from 'react';
import { Absen } from './screens/Absen';
import { CutiLayar, Gaji, Jadwal, ProfilLayar } from './screens/Lainnya';
import {
  ambilAbsensi, ambilCuti, ambilProfil, ambilSaldoCuti, ambilShift, ambilSlip,
  antrean, type Absensi, type Cuti, type Profil, type SaldoCuti, type Shift, type Slip,
} from './lib/api';
import { ABSENSI, CUTI, PROFIL, SALDO_CUTI, SHIFT, SLIP } from './lib/demo';

type Tab = 'absen' | 'jadwal' | 'cuti' | 'gaji' | 'profil';

const TAB: Array<{ key: Tab; label: string; icon: string }> = [
  { key: 'absen', label: 'Absen', icon: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'jadwal', label: 'Jadwal', icon: 'M5 4h14v16H5zM9 2v4M15 2v4M5 9h14' },
  { key: 'cuti', label: 'Cuti', icon: 'M4 20c0-8 6-14 16-15 0 10-5 15-11 15H4z' },
  { key: 'gaji', label: 'Gaji', icon: 'M3 7h18v11H3zM3 11h18M7 15h3' },
  { key: 'profil', label: 'Saya', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0' },
];

/**
 * Navigasi bawah, lima tab. Aplikasi dipegang satu tangan sambil berdiri —
 * semua target sentuh berada di jangkauan ibu jari, dan tidak ada menu
 * bertingkat sama sekali.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('absen');
  const [online, setOnline] = useState(true);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [absensi, setAbsensi] = useState<Absensi>(ABSENSI);
  const [shift, setShift] = useState<Shift[]>(SHIFT);
  const [saldo, setSaldo] = useState<SaldoCuti[]>(SALDO_CUTI);
  const [cuti, setCuti] = useState<Cuti[]>(CUTI);
  const [slip, setSlip] = useState<Slip[]>(SLIP);

  const muat = useCallback(async () => {
    const [p, a, s, sc, c, sl] = await Promise.all([
      ambilProfil(), ambilAbsensi(), ambilShift(), ambilSaldoCuti(), ambilCuti(), ambilSlip(),
    ]);
    // Server hidup bila salah satu panggilan menjawab; sisanya boleh kosong.
    const hidup = [p, a, s, sc, c, sl].some((x) => x !== null);
    setOnline(hidup);
    setProfil(p ?? (hidup ? null : PROFIL));
    if (a) setAbsensi(a);
    if (s) setShift(s);
    if (sc) setSaldo(sc);
    if (c) setCuti(c);
    if (sl) setSlip(sl);
  }, []);

  useEffect(() => { void muat(); }, [muat]);

  const nama = profil?.nama ?? PROFIL.nama;
  const antre = antrean().length;

  return (
    <div className="min-h-screen flex flex-col pb-[72px]">
      <header className="sticky top-0 z-10 flex items-center gap-3 px-4 h-14 bg-white border-b border-line">
        <span className="grid place-items-center w-9 h-9 rounded-full bg-navy-700 text-white text-[12px] font-bold">
          {nama.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[13.5px] font-semibold text-navy-800 truncate">{nama}</p>
          <p className="text-[11px] text-ink-400 truncate">
            {(profil ?? PROFIL).outlet?.kode ?? '—'} · {(profil ?? PROFIL).posisi}
          </p>
        </div>
        <span className={`ml-auto flex items-center gap-1.5 text-[11.5px] ${online ? 'text-ink-400' : 'text-amber-500'}`}>
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-leaf-600' : 'bg-amber-500'}`} />
          {online ? 'Tersambung' : antre > 0 ? `Offline · ${antre} tertunda` : 'Offline'}
        </span>
      </header>

      <main className="flex-1">
        {tab === 'absen' && <Absen data={absensi} muat={() => void muat()} />}
        {tab === 'jadwal' && <Jadwal data={shift} />}
        {tab === 'cuti' && <CutiLayar saldo={saldo} riwayat={cuti} muat={() => void muat()} />}
        {tab === 'gaji' && <Gaji data={slip} profil={profil ?? PROFIL} />}
        {tab === 'profil' && <ProfilLayar data={profil ?? PROFIL} />}
      </main>

      <nav className="fixed bottom-0 inset-x-0 max-w-[480px] mx-auto bg-white border-t border-line grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {TAB.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex flex-col items-center gap-1 py-2.5 ${tab === t.key ? 'text-navy-700' : 'text-ink-400'}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <path d={t.icon} />
            </svg>
            <span className={`text-[11px] ${tab === t.key ? 'font-semibold' : ''}`}>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
