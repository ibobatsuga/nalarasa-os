import { useState, type ReactNode } from 'react';
import {
  IconBadge, IconBell, IconBook, IconBox, IconCart, IconChart, IconCheck,
  IconChevron, IconGrid, IconLeaf, IconRegister, IconSearch, IconSettings,
  IconShield, IconUsers, IconWallet,
} from './Icons';

export interface NavChild { key: string; label: string }
export interface NavApp {
  key: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  children: NavChild[];
}

/**
 * Odoo-style: apps at the top level, menus nested inside. Nalarasa OS runs the
 * client's own daily operations — the HR app is a real HRIS for their staff,
 * not Nalarasa's staffing back-office.
 */
export const NAV: NavApp[] = [
  { key: 'dashboard', label: 'Dashboard', icon: IconGrid, children: [] },
  {
    key: 'pos', label: 'Point of Sale', icon: IconRegister, children: [
      { key: 'pos.session', label: 'Sesi Kasir' },
      { key: 'pos.orders', label: 'Order' },
      { key: 'pos.payments', label: 'Pembayaran & Gateway' },
      { key: 'pos.reports', label: 'Laporan Kasir' },
    ],
  },
  {
    key: 'sales', label: 'Penjualan', icon: IconCart, children: [
      { key: 'sales.orders', label: 'Order Penjualan' },
      { key: 'sales.customers', label: 'Pelanggan' },
      { key: 'sales.pricing', label: 'Harga & Diskon' },
    ],
  },
  {
    key: 'inventory', label: 'Inventaris', icon: IconBox, children: [
      { key: 'inv.products', label: 'Produk & Menu' },
      { key: 'inv.recipes', label: 'Resep & HPP' },
      { key: 'inv.stock', label: 'Stok' },
      { key: 'inv.receipts', label: 'Penerimaan' },
      { key: 'inv.count', label: 'Opname & Waste' },
    ],
  },
  {
    key: 'purchase', label: 'Pembelian', icon: IconBook, children: [
      { key: 'pur.requisitions', label: 'Permintaan' },
      { key: 'pur.orders', label: 'Purchase Order' },
      { key: 'pur.bills', label: 'Tagihan Vendor' },
      { key: 'pur.vendors', label: 'Vendor' },
    ],
  },
  {
    key: 'accounting', label: 'Akuntansi', icon: IconWallet, children: [
      { key: 'acc.invoices', label: 'Faktur & Piutang' },
      { key: 'acc.payments', label: 'Pembayaran' },
      { key: 'acc.journals', label: 'Jurnal' },
      { key: 'acc.bank', label: 'Rekonsiliasi Bank' },
      { key: 'acc.tax', label: 'Pajak' },
      { key: 'acc.close', label: 'Tutup Buku' },
    ],
  },
  {
    key: 'hr', label: 'Karyawan', icon: IconBadge, children: [
      { key: 'hr.employees', label: 'Data Karyawan' },
      { key: 'hr.contracts', label: 'Kontrak' },
      { key: 'hr.attendance', label: 'Absensi' },
      { key: 'hr.schedule', label: 'Jadwal Shift' },
      { key: 'hr.leave', label: 'Cuti & Izin' },
      { key: 'hr.payroll', label: 'Payroll' },
      { key: 'hr.recruitment', label: 'Rekrutmen' },
      { key: 'hr.appraisal', label: 'Penilaian' },
    ],
  },
  {
    key: 'reporting', label: 'Laporan', icon: IconChart, children: [
      { key: 'rep.kpi', label: 'KPI & Lineage' },
      { key: 'rep.finance', label: 'Laporan Keuangan' },
      { key: 'rep.sales', label: 'Analisa Penjualan' },
    ],
  },
  {
    key: 'settings', label: 'Pengaturan', icon: IconSettings, children: [
      { key: 'set.users', label: 'Pengguna & Peran' },
      { key: 'approvals', label: 'Persetujuan' },
      { key: 'sod', label: 'Pemisahan Tugas' },
      { key: 'set.calibration', label: 'Kalibrasi T0–T4' },
      { key: 'set.outlets', label: 'Outlet & Perusahaan' },
    ],
  },
];

const appOf = (key: string) => NAV.find((a) => a.key === key || a.children.some((c) => c.key === key));

export function Shell({
  active, onNavigate, title, subtitle, tenant, user, children,
}: {
  active: string; onNavigate: (key: string) => void;
  title: string; subtitle?: string; tenant: string; user: string; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState<string[]>([appOf(active)?.key ?? 'dashboard']);

  const toggle = (key: string) =>
    setOpen((o) => (o.includes(key) ? o.filter((k) => k !== key) : [...o, key]));

  return (
    <div className="min-h-screen flex">
      <aside className={`${collapsed ? 'w-[68px]' : 'w-[224px]'} shrink-0 bg-white border-r border-line transition-[width] duration-200`}>
        <div className="h-[68px] flex items-center gap-2.5 px-4 border-b border-line">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-leaf-600 text-white shrink-0">
            <IconLeaf className="w-[18px] h-[18px]" />
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-navy-700 leading-tight">Nalarasa OS</div>
              <div className="text-[11px] text-ink-400 truncate">{tenant}</div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Buka menu' : 'Tutup menu'}
            className="ml-auto text-ink-400 hover:text-navy-700">
            <IconChevron className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <nav className="py-3 pb-8">
          {NAV.map((app) => {
            const Icon = app.icon;
            const isLeaf = app.children.length === 0;
            const expanded = open.includes(app.key);
            const activeApp = appOf(active)?.key === app.key;

            return (
              <div key={app.key} className="mb-0.5">
                <button
                  onClick={() => (isLeaf ? onNavigate(app.key) : toggle(app.key))}
                  title={collapsed ? app.label : undefined}
                  aria-expanded={isLeaf ? undefined : expanded}
                  aria-current={active === app.key ? 'page' : undefined}
                  className={`nav-item w-[calc(100%-1.5rem)] ${active === app.key ? 'nav-item-active' : activeApp ? 'text-navy-700 font-medium' : ''} ${collapsed ? 'justify-center' : ''}`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate">{app.label}</span>
                      {!isLeaf && (
                        <IconChevron className={`ml-auto w-3.5 h-3.5 shrink-0 transition-transform ${expanded ? '-rotate-90' : 'rotate-180'}`} />
                      )}
                    </>
                  )}
                </button>

                {!collapsed && !isLeaf && expanded && (
                  <ul className="mt-0.5 mb-1.5 ml-[30px] border-l border-line pl-1">
                    {app.children.map((c) => (
                      <li key={c.key}>
                        <button
                          onClick={() => onNavigate(c.key)}
                          aria-current={active === c.key ? 'page' : undefined}
                          className={`w-full text-left px-3 py-[7px] rounded-md text-[12.5px] transition-colors ${
                            active === c.key ? 'bg-navy-50 text-navy-700 font-medium' : 'text-ink-500 hover:text-navy-700 hover:bg-navy-50/60'
                          }`}
                        >
                          {c.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-[68px] flex items-center gap-4 px-6 bg-canvas">
          <div className="min-w-0">
            <h1 className="text-[21px] leading-tight">{title}</h1>
            {subtitle && <p className="text-[12px] text-ink-400">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="relative hidden md:block">
              <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input placeholder="Cari order, produk, karyawan…"
                className="w-[280px] h-9 pl-9 pr-3 rounded-lg bg-white border border-line text-[13px] outline-none focus:border-navy-200" />
            </label>
            <button className="grid place-items-center w-9 h-9 rounded-lg bg-white border border-line text-ink-500 hover:text-navy-700" aria-label="Notifikasi">
              <IconBell className="w-[18px] h-[18px]" />
            </button>
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

export { IconUsers, IconCheck, IconShield };
