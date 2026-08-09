import type { ReactNode } from 'react';
import { rupiah } from '../lib/data';

const uang = (n: number, ringkas?: boolean) =>
  ringkas
    ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0, notation: 'compact' }).format(n)
    : rupiah(n);

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-ink-600',
  info: 'bg-navy-50 text-navy-600',
  good: 'bg-leaf-100 text-leaf-700',
  warn: 'bg-orange-100 text-amber-500',
  bad: 'bg-red-100 text-brick-500',
};

export const Pill = ({ label, tone = 'neutral' }: { label: string; tone?: Tone }) => (
  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold whitespace-nowrap ${TONE[tone]}`}>{label}</span>
);

export function Card({ title, action, children, className = '' }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 mb-4">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: {
  label: string; value: string; note?: string; tone?: Tone;
}) {
  const warna = tone === 'bad' ? 'text-brick-500' : tone === 'good' ? 'text-leaf-600' : 'text-navy-800';
  return (
    <div className="card px-4 py-3.5">
      <p className="text-[12px] text-ink-500">{label}</p>
      <p className={`mt-1 text-[21px] font-bold tabular-nums leading-none ${warna}`}>{value}</p>
      {note && <p className="mt-1.5 text-[11.5px] text-ink-400">{note}</p>}
    </div>
  );
}

/** Angka uang: negatif selalu merah, nol selalu redup. Tanpa kecuali. */
export function Uang({ n, ringkas, tebal }: { n: number; ringkas?: boolean; tebal?: boolean }) {
  const warna = n < 0 ? 'text-brick-500' : n === 0 ? 'text-ink-400' : 'text-navy-800';
  return <span className={`tabular-nums ${tebal ? 'font-semibold' : ''} ${warna}`}>{uang(n, ringkas)}</span>;
}

export interface Kolom<T> {
  key: string;
  label: string;
  align?: 'right';
  render?: (row: T) => ReactNode;
  mono?: boolean;
}

export function Tabel<T extends object>({ kolom, data, kosong, footer }: {
  kolom: Kolom<T>[]; data: T[]; kosong?: string; footer?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400 border-b border-line">
            {kolom.map((k) => (
              <th key={k.key} className={`px-3 py-2.5 font-semibold ${k.align === 'right' ? 'text-right' : ''}`}>
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-line last:border-0 hover:bg-navy-50/40 transition-colors">
              {kolom.map((k) => (
                <td key={k.key} className={`px-3 py-2.5 text-[13px] ${k.align === 'right' ? 'text-right tabular-nums' : ''} ${k.mono ? 'font-mono text-[12px] text-ink-500' : 'text-ink-600'}`}>
                  {k.render ? k.render(row) : String((row as Record<string, unknown>)[k.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={kolom.length} className="px-3 py-14 text-center text-[13px] text-ink-400">
              {kosong ?? 'Belum ada data'}
            </td></tr>
          )}
        </tbody>
        {footer}
      </table>
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block">
    <span className="block text-[12.5px] font-medium text-ink-600">{label}</span>
    <div className="mt-1.5">{children}</div>
    {hint && <span className="mt-1 block text-[11.5px] text-ink-400">{hint}</span>}
  </label>
);

export const input = 'w-full h-10 px-3 rounded-lg border border-line bg-white text-[13.5px] outline-none focus:border-navy-200';
export const select = `${input} pr-8`;

export const Baris = ({ label, value, tebal, indent }: {
  label: string; value: ReactNode; tebal?: boolean; indent?: boolean;
}) => (
  <div className={`flex items-baseline justify-between gap-4 py-1.5 ${tebal ? 'border-t border-line pt-2.5 mt-1' : ''}`}>
    <span className={`text-[13px] ${indent ? 'pl-4 text-ink-500' : tebal ? 'font-semibold text-navy-700' : 'text-ink-600'}`}>{label}</span>
    <span className={`text-[13.5px] ${tebal ? 'font-bold' : ''}`}>{value}</span>
  </div>
);
