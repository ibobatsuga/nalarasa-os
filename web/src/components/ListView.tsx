import { useMemo, useState, type ReactNode } from 'react';
import { IconSearch } from './Icons';

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-ink-600',
  info: 'bg-navy-50 text-navy-600',
  good: 'bg-leaf-100 text-leaf-700',
  warn: 'bg-orange-100 text-amber-500',
  bad: 'bg-red-100 text-brick-500',
};

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <span className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${TONE[tone]}`}>{label}</span>;
}

export type Row = Record<string, unknown>;

export interface Column {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Rendered cell. Falls back to the raw value. */
  render?: (row: Row) => ReactNode;
  mono?: boolean;
  strong?: boolean;
}

export interface Metric { label: string; value: string; tone?: Tone }

export interface ListSpec {
  /** Toolbar button label, e.g. "Order Baru". Omitted when the view is read-only. */
  createLabel?: string;
  filters?: string[];
  metrics?: Metric[];
  columns: Column[];
  rows: Row[];
  emptyHint?: string;
}

/**
 * One list component for every module. Odoo-style: toolbar, filters, dense
 * table, right-aligned numbers. Modules supply columns and rows, nothing else.
 */
export function ListView({ spec }: { spec: ListSpec }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('Semua');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return spec.rows.filter((r) => {
      const matchQ = !needle || Object.values(r).some((v) =>
        typeof v === 'string' && v.toLowerCase().includes(needle));
      const matchF = filter === 'Semua' || String(r.status ?? r.stage ?? '') === filter;
      return matchQ && matchF;
    });
  }, [spec.rows, q, filter]);

  return (
    <div className="space-y-4">
      {spec.metrics && spec.metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {spec.metrics.map((m) => (
            <div key={m.label} className="card px-4 py-3">
              <p className="text-[12px] text-ink-500">{m.label}</p>
              <p className={`mt-1 text-[19px] font-semibold tabular-nums ${m.tone === 'bad' ? 'text-brick-500' : m.tone === 'good' ? 'text-leaf-600' : 'text-navy-800'}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="card">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line">
          <label className="relative">
            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari…"
              className="w-[220px] h-8 pl-9 pr-3 rounded-lg bg-white border border-line text-[12.5px] outline-none focus:border-navy-200"
            />
          </label>

          {spec.filters && (
            <div className="flex items-center gap-1 flex-wrap">
              {['Semua', ...spec.filters].map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[12px] transition-colors ${
                    filter === f ? 'bg-navy-700 text-white' : 'text-ink-500 hover:bg-navy-50 hover:text-navy-700'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          )}

          <span className="ml-auto text-[12px] text-ink-400 tabular-nums">{rows.length} baris</span>
          {spec.createLabel && <button className="btn btn-primary">+ {spec.createLabel}</button>}
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400 border-b border-line">
                {spec.columns.map((c) => (
                  <th key={c.key} className={`px-4 py-2.5 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0 hover:bg-navy-50/40 transition-colors">
                  {spec.columns.map((c) => (
                    <td key={c.key}
                      className={`px-4 py-2.5 text-[13px] ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${
                        c.mono ? 'font-mono text-[12px] text-ink-500' : ''
                      } ${c.strong ? 'font-medium text-navy-700' : 'text-ink-600'}`}>
                      {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={spec.columns.length} className="px-4 py-14 text-center text-[13px] text-ink-400">
                    {spec.emptyHint ?? 'Tidak ada data yang cocok'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
