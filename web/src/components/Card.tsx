import type { ReactNode } from 'react';

export function Card({ title, action, children, className = '' }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-4">
          {title && <h2 className="card-title">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatCard({ label, value, delta, note, icon }: {
  label: string; value: string; delta?: number; note?: string; icon: ReactNode;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <section className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-ink-500">{label}</p>
        <span className="chip shrink-0">{icon}</span>
      </div>
      <p className="mt-2 text-[26px] font-bold text-navy-800 tabular-nums leading-none">{value}</p>
      {delta !== undefined && (
        <p className="mt-3 text-[12px]">
          <span className={up ? 'delta-up' : 'delta-down'}>
            {up ? '↗' : '↘'} {up ? '+' : ''}{delta.toFixed(1)}%
          </span>
          <span className="text-ink-400 ml-1.5">{note ?? 'vs bulan lalu'}</span>
        </p>
      )}
      {delta === undefined && note && <p className="mt-3 text-[12px] text-ink-400">{note}</p>}
    </section>
  );
}

export function Band({ band }: { band: string }) {
  return <span className={`band band-${band}`}>{band}</span>;
}

export function Row({ icon, title, meta, right }: {
  icon: ReactNode; title: string; meta?: string; right?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="chip w-8 h-8 shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-navy-700 truncate">{title}</p>
        {meta && <p className="text-[12px] text-ink-400 truncate">{meta}</p>}
      </div>
      {right && <div className="text-[13px] font-semibold text-navy-700 tabular-nums shrink-0">{right}</div>}
    </li>
  );
}
