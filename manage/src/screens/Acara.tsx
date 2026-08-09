import { useState } from 'react';
import { ambilAcara, ambilMeja, ubahStatusAcara } from '../lib/api';
import { useServer } from '../lib/useServer';
import { Card, Pill, Stat, Tabel, Uang, type Kolom, type Tone } from '../components/ui';
import { ACARA, MEJA, rupiah, tanggal, type Acara as Row } from '../lib/data';

const STATUS: Record<Row['status'], { label: string; tone: Tone }> = {
  TENTATIF: { label: 'Tentatif', tone: 'warn' },
  PASTI: { label: 'Pasti', tone: 'good' },
  SELESAI: { label: 'Selesai', tone: 'neutral' },
  BATAL: { label: 'Batal', tone: 'bad' },
};

const JENIS: Record<Row['jenis'], string> = {
  PRIVATE_DINING: 'Private dining', MUSIK: 'Musik', GATHERING: 'Gathering',
  ULANG_TAHUN: 'Ulang tahun', MEETING: 'Meeting',
};

/**
 * Jadwal acara. Nilainya bukan pada kalendernya, tapi pada peringatan bentrok:
 * acara yang mengunci satu area berarti kursi di area itu tidak bisa dijual ke
 * tamu biasa, dan itu harus terlihat sebelum reservasi diterima.
 */
export function Acara() {
  const { data: rows, nyata, muatUlang } = useServer(ambilAcara, ACARA, 60_000);
  const [galat, setGalat] = useState('');
  const { data: meja } = useServer(ambilMeja, MEJA, 60_000);
  const [filter, setFilter] = useState<'MENDATANG' | 'SEMUA'>('MENDATANG');
  const hariIni = '2026-08-07';

  const tampil = rows
    .filter((a) => (filter === 'SEMUA' ? true : a.tanggal >= hariIni && a.status !== 'BATAL'))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.mulai.localeCompare(b.mulai));

  const mendatang = rows.filter((a) => a.tanggal >= hariIni && a.status !== 'BATAL');
  const tentatif = mendatang.filter((a) => a.status === 'TENTATIF');
  const nilaiTerkunci = mendatang.filter((a) => a.status === 'PASTI').reduce((s, a) => s + a.nilai, 0);

  // Bentrok: dua acara pasti di area yang sama, pada tanggal dan jam beririsan.
  const bentrok = (a: Row) => rows.some((b) =>
    b.id !== a.id && b.tanggal === a.tanggal && b.area === a.area &&
    b.status !== 'BATAL' && a.status !== 'BATAL' &&
    a.mulai < b.selesai && b.mulai < a.selesai);

  const kursiArea = (area: string) =>
    meja.filter((m) => m.area === area).reduce((s, m) => s + m.kursi, 0);

  const naikkan = (id: string) => {
    setGalat('');
    void ubahStatusAcara(id, 'PASTI').then(() => muatUlang()).catch((e: Error) => setGalat(e.message));
  };

  const kolom: Kolom<Row>[] = [
    { key: 'tanggal', label: 'Tanggal', render: (a) => (
      <span className="font-medium text-navy-800">{tanggal(a.tanggal)}</span>
    ) },
    { key: 'jam', label: 'Jam', render: (a) => `${a.mulai}–${a.selesai}` },
    { key: 'nama', label: 'Acara', render: (a) => (
      <span>
        {a.nama}
        {bentrok(a) && <span className="ml-2 text-[11px] font-semibold text-brick-500">bentrok area</span>}
      </span>
    ) },
    { key: 'jenis', label: 'Jenis', render: (a) => <Pill label={JENIS[a.jenis]} tone="info" /> },
    { key: 'area', label: 'Area', render: (a) => (
      <span>{a.area} <span className="text-[11.5px] text-ink-400">({kursiArea(a.area)} kursi)</span></span>
    ) },
    { key: 'pax', label: 'Orang', align: 'right' },
    { key: 'nilai', label: 'Nilai', align: 'right', render: (a) => (
      a.nilai ? <Uang n={a.nilai} /> : <span className="text-ink-400">tanpa tagihan</span>
    ) },
    { key: 'penanggungJawab', label: 'PIC' },
    { key: 'status', label: 'Status', render: (a) => <Pill {...STATUS[a.status]} /> },
    { key: 'aksi', label: '', align: 'right', render: (a) => (
      a.status === 'TENTATIF'
        ? <button onClick={() => naikkan(a.id)} className="btn btn-primary">Pastikan</button>
        : <span className="text-ink-400 text-[12px]">—</span>
    ) },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Acara mendatang" value={String(mendatang.length)} />
        <Stat label="Masih tentatif" value={String(tentatif.length)} tone={tentatif.length ? 'warn' : 'good'}
          note="belum ada DP" />
        <Stat label="Nilai sudah pasti" value={rupiah(nilaiTerkunci, true)} tone="good" />
        <Stat label="Potensi dari tentatif"
          value={rupiah(tentatif.reduce((s, a) => s + a.nilai, 0), true)} note="belum boleh dihitung sebagai omzet" />
      </div>

      {rows.some(bentrok) && (
        <div className="card px-4 py-3 flex items-start gap-3 border-brick-500/40 bg-red-50/60">
          <span className="w-2 h-2 mt-1.5 rounded-full bg-brick-500 shrink-0" />
          <p className="text-[12.5px] text-ink-600">
            Ada acara yang memakai area sama pada jam beririsan. Selesaikan sebelum menerima
            reservasi baru di area itu — kursinya sudah tidak bisa dijual dua kali.
          </p>
        </div>
      )}

      <Card title="Jadwal acara"
        action={
          <div className="flex gap-1.5">
            {(['MENDATANG', 'SEMUA'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
                {f === 'MENDATANG' ? 'Mendatang' : 'Semua'}
              </button>
            ))}
            <button className="btn btn-primary ml-1">+ Acara</button>
          </div>
        }>
        <Tabel kolom={kolom} data={tampil} kosong="Belum ada acara terjadwal" />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Acara berstatus pasti mengunci areanya di denah meja pada jam tersebut. Acara tentatif
          tidak mengunci apa pun — dan nilainya tidak boleh dihitung sebagai pendapatan sampai DP masuk.
        </p>
      </Card>
    </>
  );
}
