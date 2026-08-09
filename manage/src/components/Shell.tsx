import { useState, type ReactNode } from 'react';

/**
 * Menu manajemen outlet dibagi dua: yang dipakai tiap jam (ruang) dan yang
 * dipakai tiap bulan (analisa). Sengaja pendek — supervisor tidak punya waktu
 * menelusuri menu bertingkat saat outlet penuh.
 */
export interface Menu { key: string; label: string; icon: string; badge?: number }
export interface Grup { grup: string; items: Menu[] }

export const NAV: Grup[] = [
  { grup: 'Ruang', items: [
    { key: 'denah', label: 'Denah Meja', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
    { key: 'reservasi', label: 'Reservasi', icon: 'M5 4h14v16H5zM9 2v4M15 2v4M5 9h14' },
    { key: 'acara', label: 'Jadwal Acara', icon: 'M5 4h14v16H5zM9 2v4M15 2v4M9 13h6M9 17h4' },
  ] },
  { grup: 'Analisa', items: [
    { key: 'menu', label: 'Menu Engineering', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  ] },
];

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px] shrink-0">
    <path d={d} />
  </svg>
);

export function Shell({
  active, onNavigate, title, subtitle, badges, usaha, user, children,
}: {
  active: string; onNavigate: (k: string) => void;
  title: string; subtitle?: string;
  badges?: Record<string, number>;
  usaha: string; user: string; children: ReactNode;
}) {
  const [tutup, setTutup] = useState(false);

  return (
    <div className="min-h-screen flex">
      <aside className={`${tutup ? 'w-[68px]' : 'w-[228px]'} shrink-0 bg-white border-r border-line transition-[width] duration-200`}>
        <div className="h-[68px] flex items-center gap-2.5 px-4 border-b border-line">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-leaf-600 text-white shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="w-[18px] h-[18px]">
              <path d="M4 20c0-8 6-14 16-15 0 10-5 15-11 15H4z" strokeLinejoin="round" />
            </svg>
          </span>
          {!tutup && (
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-navy-700 leading-tight">Manajemen</div>
              <div className="text-[11px] text-ink-400 truncate">{usaha}</div>
            </div>
          )}
          <button onClick={() => setTutup(!tutup)} aria-label={tutup ? 'Buka menu' : 'Tutup menu'}
            className="ml-auto text-ink-400 hover:text-navy-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              className={`w-4 h-4 transition-transform ${tutup ? 'rotate-180' : ''}`}>
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <nav className="py-2 pb-8">
          {NAV.map((g) => (
            <div key={g.grup}>
              {!tutup ? <div className="nav-group">{g.grup}</div> : <div className="h-3" />}
              {g.items.map((it) => {
                const n = badges?.[it.key];
                return (
                  <button key={it.key} onClick={() => onNavigate(it.key)}
                    title={tutup ? it.label : undefined}
                    aria-current={active === it.key ? 'page' : undefined}
                    className={`nav-item w-[calc(100%-1.5rem)] ${active === it.key ? 'nav-item-active' : ''} ${tutup ? 'justify-center' : ''}`}>
                    <Icon d={it.icon} />
                    {!tutup && (
                      <>
                        <span className="truncate">{it.label}</span>
                        {n ? (
                          <span className={`ml-auto px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                            active === it.key ? 'bg-white/20 text-white' : 'bg-orange-100 text-amber-500'}`}>
                            {n}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-[68px] flex items-center gap-4 px-6 bg-canvas">
          <div className="min-w-0">
            <h1 className="text-[21px] leading-tight">{title}</h1>
            {subtitle && <p className="text-[12px] text-ink-400">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <a href="http://localhost:5173" className="btn btn-ghost border border-line bg-white">
              Dashboard Nalarasa OS ↗
            </a>
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-full bg-navy-700 text-white text-[12px] font-semibold">
                {user.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden sm:block text-[13px] font-medium text-navy-700">{user}</span>
            </div>
          </div>
        </header>
        <main className="px-6 pb-8 space-y-5">{children}</main>
      </div>
    </div>
  );
}
