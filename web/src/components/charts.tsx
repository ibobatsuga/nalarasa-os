/** Hand-rolled SVG charts. No charting dependency, exact brand palette. */

export const SERIES = ['#17376b', '#a3c644', '#f28c28', '#e03131', '#dbe4f0'];

// ─── dual-axis line chart ─────────────────────────────────────────────────────

export interface LinePoint { label: string; a: number; b: number }

export function DualLineChart({
  data, aName, bName, aFormat = fmtShort, bFormat = (v: number) => `${Math.round(v)}%`,
}: {
  data: LinePoint[]; aName: string; bName: string;
  aFormat?: (v: number) => string; bFormat?: (v: number) => string;
}) {
  const W = 760, H = 300, P = { t: 16, r: 46, b: 30, l: 46 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  if (data.length === 0) return <Empty height={H} />;

  const [aLo, aHi] = niceDomain(data.map((d) => d.a), 5);
  const [bLo, bHi] = niceDomain(data.map((d) => d.b), 5);

  const x = (i: number) => P.l + (i / Math.max(1, data.length - 1)) * iw;
  const yA = (v: number) => P.t + ih - ((v - aLo) / (aHi - aLo)) * ih;
  const yB = (v: number) => P.t + ih - ((v - bLo) / (bHi - bLo)) * ih;

  // Catmull-Rom → cubic Bézier: the gentle curve in the reference design.
  const smooth = (pts: Array<[number, number]>) => pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const p0 = pts[i - 2] ?? pts[i - 1]!, p1 = pts[i - 1]!, p2 = p, p3 = pts[i + 1] ?? p;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    return `C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }).join(' ');

  const ptsA = data.map((d, i) => [x(i), yA(d.a)] as [number, number]);
  const ptsB = data.map((d, i) => [x(i), yB(d.b)] as [number, number]);
  const ticks = 5;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[600px]" role="img" aria-label={`${aName} dan ${bName}`}>
        <defs>
          <linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17376b" stopOpacity=".14" />
            <stop offset="100%" stopColor="#17376b" stopOpacity="0" />
          </linearGradient>
        </defs>

        {Array.from({ length: ticks + 1 }, (_, i) => {
          const y = P.t + (i / ticks) * ih;
          const av = aHi - (i / ticks) * (aHi - aLo);
          const bv = bHi - (i / ticks) * (bHi - bLo);
          return (
            <g key={i}>
              <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eef2f7" />
              <text x={P.l - 8} y={y + 4} textAnchor="end" className="fill-ink-400 text-[10px]">{aFormat(av)}</text>
              <text x={W - P.r + 8} y={y + 4} className="fill-ink-400 text-[10px]">{bFormat(bv)}</text>
            </g>
          );
        })}

        <path d={`${smooth(ptsA)} L${x(data.length - 1)},${P.t + ih} L${P.l},${P.t + ih} Z`} fill="url(#fillA)" />
        <path d={smooth(ptsA)} fill="none" stroke="#17376b" strokeWidth="2.4" />
        <path d={smooth(ptsB)} fill="none" stroke="#a3c644" strokeWidth="2.4" />
        {ptsA.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke="#17376b" strokeWidth="2" />)}

        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-400 text-[10px]">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}

/**
 * Rounds the axis to human steps (1/2/2.5/5 x 10^n) so ticks read as
 * 0 · 50 jt · 100 jt, never 83090k.
 */
function niceDomain(values: number[], ticks: number): [number, number] {
  // Deret kosong membuat Math.min/Math.max mengembalikan ±Infinity, dan seluruh
  // perhitungan sumbu di bawahnya berubah jadi NaN — grafik gagal digambar
  // tanpa pesan apa pun. Terjadi pada setiap tenant di hari pertama.
  if (values.length === 0) return [0, 1];
  const lo = Math.min(...values), hi = Math.max(...values);
  if (hi === lo) return [lo - 1, hi + 1];
  const raw = (hi - lo) / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

/** Indonesian short scale: rb / jt / M. */
export function fmtShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${trim(n / 1e9)} M`;
  if (a >= 1e6) return `${trim(n / 1e6)} jt`;
  if (a >= 1e3) return `${trim(n / 1e3)} rb`;
  return Math.round(n).toString();
}
const trim = (n: number) => Number(n.toFixed(1)).toString().replace('.', ',');

// ─── donut ────────────────────────────────────────────────────────────────────

export interface Slice { label: string; value: number }

export function Donut({ data, centerLabel }: { data: Slice[]; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Empty height={220} />;
  const R = 68, r = 44, C = 90, gap = 0.02;
  let acc = -Math.PI / 2;

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 180 180" className="w-[180px] h-[180px] shrink-0">
        {data.map((d, i) => {
          const frac = d.value / total;
          const a0 = acc + gap / 2, a1 = acc + frac * Math.PI * 2 - gap / 2;
          acc += frac * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const p = (rad: number, ang: number) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
          const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1);
          const [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
          return (
            <path key={d.label}
              d={`M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`}
              fill={SERIES[i % SERIES.length]} />
          );
        })}
        {centerLabel && (
          <text x={C} y={C + 5} textAnchor="middle" className="fill-navy-700 text-[15px] font-semibold">{centerLabel}</text>
        )}
      </svg>
      <ul className="space-y-2 text-[12.5px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="text-ink-600">{d.label}</span>
            <span className="ml-auto tabular-nums text-ink-400">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Empty = ({ height }: { height: number }) => (
  <div className="grid place-items-center text-[12.5px] text-ink-400" style={{ height }}>
    Belum ada data
  </div>
);
