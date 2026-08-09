import { useState, type ReactNode } from 'react';

/**
 * Menu keuangan mengikuti urutan kerja harian admin pembukuan, bukan urutan
 * modul akuntansi: uang masuk dulu, bukti dulu, baru buku dan laporan.
 */
export interface Menu { key: string; label: string; icon: string; badge?: number }
export interface Grup { grup: string; items: Menu[] }

export const NAV: Grup[] = [
  { grup: 'Harian', items: [
    { key: 'beranda', label: 'Beranda', icon: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
    { key: 'kas', label: 'Kas & Setoran', icon: 'M3 7h18v11H3zM3 11h18M7 15h3' },
    { key: 'struk', label: 'Struk Belanja', icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
    { key: 'transaksi', label: 'Transaksi', icon: 'M7 7h13l-3-3M17 17H4l3 3' },
  ] },
  { grup: 'Tagihan', items: [
    { key: 'utang', label: 'Utang Pemasok', icon: 'M4 6h16v12H4zM4 10h16M8 14h4' },
    { key: 'piutang', label: 'Piutang', icon: 'M4 6h16v12H4zM4 10h16M14 14h4' },
  ] },
  { grup: 'Pembukuan', items: [
    { key: 'buku', label: 'Jurnal & Buku Besar', icon: 'M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2zM8 7h7M8 11h7' },
    { key: 'pajak', label: 'Pajak & Upah', icon: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3' },
    { key: 'laporan', label: 'Laporan', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  ] },
  { grup: 'Lainnya', items: [
    { key: 'persetujuan', label: 'Persetujuan', icon: 'M20 6L9 17l-5-5' },
    { key: 'pengaturan', label: 'Pengaturan', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM4 12h2M18 12h2M12 4v2M12 18v2' },
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
              <div className="text-[14px] font-semibold text-navy-700 leading-tight">Keuangan</div>
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
