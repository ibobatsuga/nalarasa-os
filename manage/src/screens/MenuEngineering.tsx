import { useState } from 'react';
import { ambilKinerjaMenu } from '../lib/api';
import { useServer } from '../lib/useServer';
import { Card, Pill, Stat, Tabel, Uang, type Kolom, type Tone } from '../components/ui';
import {
  KELAS_LABEL, KELAS_SARAN, KINERJA_MENU, klasifikasiMenu, persen, ringkasMenu, rupiah,
  type KelasMenu, type MenuTerkelas,
} from '../lib/data';

const TONE: Record<KelasMenu, Tone> = {
  BINTANG: 'good', KUDA_BEBAN: 'info', TEKA_TEKI: 'warn', ANJING: 'bad',
  BELUM_CUKUP_DATA: 'info',
};

/**
 * Menu engineering: memetakan setiap menu pada dua sumbu — seberapa sering
 * dipesan, dan berapa rupiah margin yang dibawanya. Empat kuadran yang keluar
 * bukan sekadar label; masing-masing punya tindakan yang berbeda, dan itulah
 * yang membuatnya berguna bagi pemilik yang tidak punya waktu menganalisis.
 */
export function MenuEngineering() {
  // Dihitung server dari PosOrderLine 30 hari terakhir. Kalau tak terjangkau,
  // data contoh dipakai dan spanduk di bawah mengatakannya terang-terangan.
  const { data: kinerja, nyata } = useServer(
    async () => (await ambilKinerjaMenu(30)).data, KINERJA_MENU, 120_000,
  );
  const [sorot, setSorot] = useState<KelasMenu | 'SEMUA'>('SEMUA');
  const r = ringkasMenu(kinerja);
  const data = klasifikasiMenu(kinerja);

  const tampil = sorot === 'SEMUA' ? data : data.filter((m) => m.kelas === sorot);

  // Sumbu grafik memakai skala relatif terhadap nilai tertinggi supaya titik
  // tidak menumpuk di sudut ketika ada satu menu yang jauh lebih laris.
  // Semua pembagi di bawah bisa nol pada outlet yang belum berjualan, dan
  // Math.max atas array kosong mengembalikan -Infinity. Sekali salah satu
  // menyusup, seluruh koordinat grafik menjadi NaN dan tidak ada yang tergambar.
  const totalTerjual = data.reduce((s, m) => s + m.terjual, 0);
  const maksPangsa = data.length ? Math.max(...data.map((m) => m.pangsa)) : 0;
  const maksMargin = data.length ? Math.max(...data.map((m) => m.margin)) : 0;
  const ambangPangsa = data.length ? (1 / data.length) * 0.7 : 0;
  const ambangMargin = totalTerjual ? r.totalMargin / totalTerjual : 0;

  const kolom: Kolom<MenuTerkelas>[] = [
    { key: 'nama', label: 'Menu' },
    { key: 'kategori', label: 'Kategori' },
    { key: 'terjual', label: 'Terjual', align: 'right' },
    { key: 'pangsa', label: 'Pangsa', align: 'right', render: (m) => persen(m.pangsa) },
    { key: 'harga', label: 'Harga', align: 'right', render: (m) => <Uang n={m.harga} /> },
    { key: 'hpp', label: 'HPP', align: 'right', render: (m) => <Uang n={m.hpp} /> },
    { key: 'margin', label: 'Margin/porsi', align: 'right', render: (m) => <Uang n={m.margin} /> },
    { key: 'marginPct', label: 'Margin %', align: 'right', render: (m) => persen(m.harga ? m.margin / m.harga : 0) },
    { key: 'kontribusi', label: 'Total margin', align: 'right', render: (m) => <Uang n={m.kontribusi} tebal /> },
    { key: 'kelas', label: 'Kelas', render: (m) => <Pill label={KELAS_LABEL[m.kelas]} tone={TONE[m.kelas]} /> },
  ];

  return (
    <>
      {!nyata && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-ink-600">
          Server belum terhubung — angka di bawah adalah data contoh. Jangan dipakai
          mengambil keputusan menu sampai penjualan nyata termuat.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Omzet menu" value={rupiah(r.totalOmzet, true)} />
        <Stat label="Total margin" value={rupiah(r.totalMargin, true)} note={`rata-rata ${persen(r.marginRata)}`} />
        <Stat label="Menu bintang" value={String(r.perKelas[0]!.menu.length)} tone="good"
          note={`${persen(r.totalMargin ? r.perKelas[0]!.kontribusi / r.totalMargin : 0)} dari margin`} />
        <Stat label="Kandidat dihapus" value={String(r.perKelas[3]!.menu.length)}
          tone={r.perKelas[3]!.menu.length ? 'warn' : 'good'} note="kelas anjing" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Peta menu"
          action={<span className="text-[11.5px] text-ink-400">horizontal: popularitas · vertikal: margin per porsi</span>}>
          <div className="relative aspect-[4/3] w-full">
            <svg viewBox="0 0 400 300" className="w-full h-full">
              <line x1={40} y1={260} x2={390} y2={260} stroke="#e8ecf2" />
              <line x1={40} y1={10} x2={40} y2={260} stroke="#e8ecf2" />
              {/* Garis ambang membagi empat kuadran. */}
              <line x1={40 + (ambangPangsa / maksPangsa) * 350} y1={10}
                x2={40 + (ambangPangsa / maksPangsa) * 350} y2={260}
                stroke="#b8c8e0" strokeDasharray="4 4" />
              <line x1={40} y1={260 - (ambangMargin / maksMargin) * 250}
                x2={390} y2={260 - (ambangMargin / maksMargin) * 250}
                stroke="#b8c8e0" strokeDasharray="4 4" />

              <text x={385} y={30} textAnchor="end" className="fill-ink-400 text-[9px]">Bintang</text>
              <text x={45} y={30} className="fill-ink-400 text-[9px]">Teka-teki</text>
              <text x={385} y={252} textAnchor="end" className="fill-ink-400 text-[9px]">Kuda beban</text>
              <text x={45} y={252} className="fill-ink-400 text-[9px]">Anjing</text>

              {/* Tanpa penjualan tidak ada koordinat yang bermakna; titik disembunyikan
                  daripada menumpuk semuanya di sudut kiri bawah. */}
              {(totalTerjual ? data : []).map((m) => {
                const cx = 40 + (maksPangsa ? m.pangsa / maksPangsa : 0) * 350;
                const cy = 260 - (maksMargin ? m.margin / maksMargin : 0) * 250;
                const rr = 4 + Math.sqrt(r.totalMargin ? m.kontribusi / r.totalMargin : 0) * 22;
                const warna = {
                  BINTANG: '#3f9142', KUDA_BEBAN: '#17376b', TEKA_TEKI: '#f28c28',
                  ANJING: '#e03131', BELUM_CUKUP_DATA: '#8a94a6',
                }[m.kelas];
                const redup = sorot !== 'SEMUA' && m.kelas !== sorot;
                return (
                  <g key={m.kode} opacity={redup ? 0.2 : 1}>
                    <circle cx={cx} cy={cy} r={rr} fill={warna} fillOpacity={0.28} stroke={warna} strokeWidth={1.5} />
                    <title>{m.nama} — {m.terjual} terjual, margin {rupiah(m.margin)}</title>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="mt-2 text-[11.5px] text-ink-400">
            Besar lingkaran menunjukkan sumbangan margin total. Menu kecil di kanan atas berarti
            untung besar per porsi tapi jarang dipesan — biasanya paling cepat diperbaiki.
          </p>
        </Card>

        <div className="space-y-3">
          {r.perKelas.map((k) => (
            <button key={k.kelas} onClick={() => setSorot(sorot === k.kelas ? 'SEMUA' : k.kelas)}
              className={`w-full text-left card card-pad transition-colors ${
                sorot === k.kelas ? 'border-navy-200 bg-navy-50/40' : 'hover:bg-navy-50/30'}`}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Pill label={KELAS_LABEL[k.kelas]} tone={TONE[k.kelas]} />
                  <span className="text-[12.5px] text-ink-400">{k.menu.length} menu</span>
                </span>
                <span className="text-[13px] font-semibold text-navy-800 tabular-nums">
                  {rupiah(k.kontribusi, true)}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] text-ink-500 leading-snug">{KELAS_SARAN[k.kelas]}</p>
              {k.menu.length > 0 && (
                <p className="mt-1.5 text-[12px] text-navy-700">
                  {k.menu.slice(0, 3).map((m) => m.nama).join(' · ')}
                  {k.menu.length > 3 ? ` +${k.menu.length - 3}` : ''}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      <Card title={sorot === 'SEMUA' ? 'Semua menu' : `Kelas ${KELAS_LABEL[sorot]}`}
        action={sorot !== 'SEMUA'
          ? <button onClick={() => setSorot('SEMUA')} className="btn btn-ghost">Tampilkan semua</button>
          : undefined}>
        <Tabel kolom={kolom} data={tampil} />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Angka terjual diambil dari POS, HPP dari resep di modul Inventaris. Kalau resep belum
          diisi, menu itu akan terlihat untung besar padahal belum tentu — periksa resepnya dulu
          sebelum mengambil keputusan menaikkan harga.
        </p>
      </Card>
    </>
  );
}
