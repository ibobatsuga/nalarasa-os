import { useState } from 'react';
import { Card, Pill, Stat, Tabel, Uang, type Kolom, type Tone } from '../components/ui';
import { TAGIHAN, rupiah, tanggal, type Tagihan as Row } from '../lib/data';
import { useServer } from '../lib/useServer';
import { ambilTagihan } from '../lib/api';

const STATUS: Record<Row['status'], { label: string; tone: Tone }> = {
  BELUM_JATUH_TEMPO: { label: 'Belum jatuh tempo', tone: 'info' },
  JATUH_TEMPO: { label: 'Lewat tempo', tone: 'bad' },
  LUNAS: { label: 'Lunas', tone: 'good' },
};

const umur = (iso: string) =>
  Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);

/**
 * Utang dan piutang memakai layar yang sama karena pertanyaannya sama: siapa,
 * berapa, kapan, dan sudah lewat berapa hari. Yang berbeda hanya arah uangnya.
 */
export function Tagihan({ jenis }: { jenis: Row['jenis'] }) {
  const { data: semua, nyata } = useServer(ambilTagihan, TAGIHAN, 60_000);
  const rows = semua.filter((t) => t.jenis === jenis);
  const [filter, setFilter] = useState<'SEMUA' | Row['status']>('SEMUA');

  const tampil = rows.filter((t) => filter === 'SEMUA' || t.status === filter);
  const sisa = (t: Row) => t.jumlah - t.terbayar;
  const belumLunas = rows.filter((t) => t.status !== 'LUNAS');
  const lewat = rows.filter((t) => t.status === 'JATUH_TEMPO');

  // Umur piutang: alat penagihan paling sederhana yang benar-benar dipakai.
  const ember = [
    { label: 'Belum jatuh tempo', uji: (t: Row) => t.status === 'BELUM_JATUH_TEMPO' },
    { label: '1–30 hari', uji: (t: Row) => t.status === 'JATUH_TEMPO' && umur(t.jatuhTempo) <= 30 },
    { label: '31–60 hari', uji: (t: Row) => t.status === 'JATUH_TEMPO' && umur(t.jatuhTempo) > 30 && umur(t.jatuhTempo) <= 60 },
    { label: 'Di atas 60 hari', uji: (t: Row) => t.status === 'JATUH_TEMPO' && umur(t.jatuhTempo) > 60 },
  ];

  const kolom: Kolom<Row>[] = [
    { key: 'nomor', label: 'Nomor', mono: true },
    { key: 'pihak', label: jenis === 'UTANG' ? 'Pemasok' : 'Pelanggan' },
    { key: 'tanggal', label: 'Tanggal', render: (t) => tanggal(t.tanggal) },
    { key: 'jatuhTempo', label: 'Jatuh tempo', render: (t) => (
      <span className={t.status === 'JATUH_TEMPO' ? 'text-brick-500 font-medium' : ''}>
        {tanggal(t.jatuhTempo)}
        {t.status === 'JATUH_TEMPO' && <span className="ml-1.5 text-[11px]">+{umur(t.jatuhTempo)} hari</span>}
      </span>
    ) },
    { key: 'jumlah', label: 'Nilai', align: 'right', render: (t) => <Uang n={t.jumlah} /> },
    { key: 'sisa', label: 'Sisa', align: 'right', render: (t) => <Uang n={sisa(t)} tebal /> },
    { key: 'refDokumen', label: 'Sumber', render: (t) => (
      t.refDokumen ? <span className="font-mono text-[11.5px] text-ink-400">{t.refDokumen}</span> : <span className="text-ink-400">manual</span>
    ) },
    { key: 'status', label: 'Status', render: (t) => <Pill {...STATUS[t.status]} /> },
    { key: 'aksi', label: '', align: 'right', render: (t) => (
      t.status === 'LUNAS' ? <span className="text-ink-400 text-[12px]">—</span>
        : <button className="btn btn-ghost border border-line bg-white">
            {jenis === 'UTANG' ? 'Bayar' : 'Tagih'}
          </button>
    ) },
  ];

  return (
    <>
      {!nyata && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-ink-600">
          Server belum terhubung — angka di bawah adalah data contoh. Jangan dipakai
          untuk keputusan pembayaran atau pelaporan pajak.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={jenis === 'UTANG' ? 'Total utang' : 'Total piutang'}
          value={rupiah(belumLunas.reduce((s, t) => s + sisa(t), 0), true)} note={`${belumLunas.length} tagihan`} />
        <Stat label="Lewat jatuh tempo" value={rupiah(lewat.reduce((s, t) => s + sisa(t), 0), true)}
          tone={lewat.length ? 'bad' : 'good'} note={`${lewat.length} tagihan`} />
        <Stat label="Lunas bulan ini" value={String(rows.filter((t) => t.status === 'LUNAS').length)} tone="good" />
        <Stat label={jenis === 'UTANG' ? 'Rata-rata termin' : 'Rata-rata umur'}
          value={`${Math.round(rows.reduce((s, t) => s + (new Date(t.jatuhTempo).getTime() - new Date(t.tanggal).getTime()) / 86_400_000, 0) / (rows.length || 1))} hari`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_2.2fr]">
        <Card title="Umur tagihan">
          {ember.map((e) => {
            const isi = rows.filter(e.uji);
            const nilai = isi.reduce((s, t) => s + sisa(t), 0);
            return (
              <div key={e.label} className="flex items-baseline justify-between py-2 border-b border-line last:border-0">
                <span className="text-[13px] text-ink-600">{e.label}</span>
                <span className="text-[13px]"><Uang n={nilai} /> <span className="text-ink-400 text-[11.5px]">({isi.length})</span></span>
              </div>
            );
          })}
        </Card>

        <Card title={jenis === 'UTANG' ? 'Utang pemasok' : 'Piutang pelanggan'}
          action={
            <div className="flex gap-1.5">
              {(['SEMUA', 'JATUH_TEMPO', 'LUNAS'] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
                  {f === 'SEMUA' ? 'Semua' : STATUS[f].label}
                </button>
              ))}
            </div>
          }>
          <Tabel kolom={kolom} data={tampil} />
          <p className="mt-3 text-[11.5px] text-ink-400">
            {jenis === 'UTANG'
              ? 'Tagihan yang punya nomor PO datang otomatis dari modul pembelian Nalarasa OS setelah lolos pencocokan tiga arah.'
              : 'Faktur katering dan korporat datang otomatis dari modul penjualan. Penjualan POS langsung lunas, tidak muncul di sini.'}
          </p>
        </Card>
      </div>
    </>
  );
}
