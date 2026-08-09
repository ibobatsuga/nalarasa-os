import { useState } from 'react';
import { Card, Pill, Stat, Tabel, Uang, type Kolom, type Tone } from '../components/ui';
import { BAHAN, PREP, WASTE, jam, rupiah, type BahanDapur, type TugasPrep, type Waste } from '../lib/data';

const SEBAB: Record<Waste['sebab'], { label: string; tone: Tone }> = {
  KEDALUWARSA: { label: 'Kedaluwarsa', tone: 'bad' },
  RUSAK: { label: 'Rusak', tone: 'bad' },
  SALAH_MASAK: { label: 'Salah masak', tone: 'warn' },
  SISA_TAMU: { label: 'Sisa tamu', tone: 'neutral' },
  TUMPAH: { label: 'Tumpah', tone: 'warn' },
};

const STATUS_PREP: Record<TugasPrep['status'], { label: string; tone: Tone }> = {
  BELUM: { label: 'Belum mulai', tone: 'warn' },
  JALAN: { label: 'Sedang dikerjakan', tone: 'info' },
  SELESAI: { label: 'Selesai', tone: 'good' },
};

/**
 * Prep dan stok jadi satu layar karena keduanya menjawab pertanyaan yang sama
 * di pagi hari: apa yang harus dibuat sebelum buka, dan apa yang kurang.
 */
export function Stok() {
  const [prep, setPrep] = useState<TugasPrep[]>(PREP);

  const kritis = BAHAN.filter((b) => b.stok <= b.minimum);
  const kedaluwarsaDekat = BAHAN.filter((b) => b.kedaluwarsa && b.kedaluwarsa <= '2026-08-09');
  const wasteTotal = WASTE.reduce((s, w) => s + w.nilai, 0);
  const prepBelum = prep.filter((p) => p.status !== 'SELESAI');

  const majukan = (id: string) => setPrep(prep.map((p) => {
    if (p.id !== id) return p;
    if (p.status === 'BELUM') return { ...p, status: 'JALAN' };
    return { ...p, status: 'SELESAI', selesai: p.target };
  }));

  const kolomBahan: Kolom<BahanDapur>[] = [
    { key: 'nama', label: 'Bahan' },
    { key: 'lokasi', label: 'Lokasi' },
    { key: 'stok', label: 'Stok', align: 'right', render: (b) => (
      <span className={b.stok === 0 ? 'text-brick-500 font-semibold' : b.stok <= b.minimum ? 'text-amber-500 font-medium' : ''}>
        {b.stok} {b.satuan}
      </span>
    ) },
    { key: 'minimum', label: 'Minimum', align: 'right', render: (b) => `${b.minimum} ${b.satuan}` },
    { key: 'kedaluwarsa', label: 'Kedaluwarsa', render: (b) => (
      b.kedaluwarsa
        ? <span className={b.kedaluwarsa <= '2026-08-09' ? 'text-amber-500 font-medium' : ''}>
            {new Date(b.kedaluwarsa).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
          </span>
        : <span className="text-ink-400">—</span>
    ) },
    { key: 'status', label: 'Status', render: (b) => (
      <Pill label={b.stok === 0 ? 'Habis' : b.stok <= b.minimum ? 'Menipis' : 'Aman'}
        tone={b.stok === 0 ? 'bad' : b.stok <= b.minimum ? 'warn' : 'good'} />
    ) },
    { key: 'aksi', label: '', align: 'right', render: () => (
      <button className="btn btn-ghost border border-line bg-white">Minta Beli</button>
    ) },
  ];

  const kolomWaste: Kolom<Waste>[] = [
    { key: 'waktu', label: 'Jam', render: (w) => jam(w.waktu) },
    { key: 'bahan', label: 'Barang' },
    { key: 'qty', label: 'Jumlah', align: 'right', render: (w) => `${w.qty} ${w.satuan}` },
    { key: 'sebab', label: 'Sebab', render: (w) => <Pill {...SEBAB[w.sebab]} /> },
    { key: 'oleh', label: 'Dicatat oleh' },
    { key: 'nilai', label: 'Nilai', align: 'right', render: (w) => <Uang n={-w.nilai} /> },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Prep belum selesai" value={String(prepBelum.length)}
          tone={prepBelum.length ? 'warn' : 'good'} note={`dari ${prep.length} tugas`} />
        <Stat label="Bahan di bawah minimum" value={String(kritis.length)} tone={kritis.length ? 'warn' : 'good'} />
        <Stat label="Mendekati kedaluwarsa" value={String(kedaluwarsaDekat.length)}
          tone={kedaluwarsaDekat.length ? 'warn' : 'good'} note="dua hari ke depan" />
        <Stat label="Waste hari ini" value={rupiah(wasteTotal)} tone={wasteTotal > 50_000 ? 'bad' : 'neutral'} />
      </div>

      <Card title="Prep hari ini">
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {prep.map((p) => (
            <div key={p.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[15px] font-semibold text-navy-800">{p.nama}</span>
                <Pill {...STATUS_PREP[p.status]} />
              </div>
              <p className="mt-1 text-[12px] text-ink-400">{p.hasil}</p>
              <p className="mt-2 text-[13px] text-ink-600">
                {p.selesai} / {p.target} {p.satuan} · {p.penanggungJawab} · batas {p.batasJam}
              </p>
              <div className="mt-2 h-2 rounded-full bg-navy-50 overflow-hidden">
                <div className="h-full bg-leaf-600 rounded-full"
                  style={{ width: `${Math.min(100, (p.selesai / p.target) * 100)}%` }} />
              </div>
              {p.status !== 'SELESAI' && (
                <button onClick={() => majukan(p.id)}
                  className="mt-3 w-full py-2.5 rounded-lg bg-leaf-600 text-white text-[13.5px] font-semibold">
                  {p.status === 'BELUM' ? 'Mulai Kerjakan' : 'Tandai Selesai'}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-ink-400">
          Hasil prep masuk ke stok sebagai bahan setengah jadi, lalu terpakai otomatis
          saat menu terjual. Karena itu prep yang tidak dicatat membuat HPP terlihat salah.
        </p>
      </Card>

      <Card title="Stok bahan dapur"
        action={<button className="btn btn-primary">Mulai Opname</button>}>
        <Tabel kolom={kolomBahan} data={BAHAN} />
      </Card>

      <Card title="Catatan waste"
        action={<button className="btn btn-primary">+ Catat Waste</button>}>
        <Tabel kolom={kolomWaste} data={WASTE} kosong="Belum ada waste hari ini" />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Waste dicatat di dapur, dinilai otomatis dari HPP, dan muncul di aplikasi Keuangan
          sebagai pengurang persediaan. Menyembunyikannya hanya memindahkan selisih ke opname.
        </p>
      </Card>
    </div>
  );
}
