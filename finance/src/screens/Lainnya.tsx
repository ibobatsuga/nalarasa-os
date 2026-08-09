import { Card, Field, Pill, Stat, Tabel, Uang, input, select, type Kolom, type Tone } from '../components/ui';
import { AKUN, TRANSAKSI, rupiah, tanggal, type Akun, type Transaksi } from '../lib/data';

const BAND: Record<string, Tone> = { T0: 'neutral', T1: 'info', T2: 'good', T3: 'warn', T4: 'bad' };

/**
 * Persetujuan di sini hanya menampilkan apa yang MENUNGGU dari sisi keuangan.
 * Keputusannya sendiri diambil di Nalarasa OS — supaya jejak persetujuan,
 * pemisahan tugas, dan riwayat versi tetap satu tempat, tidak terpecah dua.
 */
export function Persetujuan() {
  const menunggu = TRANSAKSI.filter((t) => t.status === 'DIAJUKAN');

  const kolom: Kolom<Transaksi>[] = [
    { key: 'id', label: 'Nomor', mono: true },
    { key: 'tanggal', label: 'Tanggal', render: (t) => tanggal(t.tanggal) },
    { key: 'keterangan', label: 'Keterangan' },
    { key: 'kategori', label: 'Kategori' },
    { key: 'jumlah', label: 'Nilai', align: 'right', render: (t) => <Uang n={t.jumlah} tebal /> },
    { key: 'band', label: 'Band', render: (t) => <Pill label={t.jumlah > 5_000_000 ? 'T2' : t.jumlah > 1_000_000 ? 'T1' : 'T0'} tone={BAND[t.jumlah > 5_000_000 ? 'T2' : t.jumlah > 1_000_000 ? 'T1' : 'T0']!} /> },
    { key: 'aksi', label: '', align: 'right', render: () => (
      <a href="http://localhost:5173" className="btn btn-ghost border border-line bg-white">Putuskan di Nalarasa OS ↗</a>
    ) },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Menunggu keputusan" value={String(menunggu.length)} tone={menunggu.length ? 'warn' : 'good'} />
        <Stat label="Nilai tertahan" value={rupiah(menunggu.reduce((s, t) => s + t.jumlah, 0), true)} />
        <Stat label="Rata-rata menunggu" value="4 jam" note="target di bawah 8 jam" />
      </div>

      <Card title="Transaksi keuangan menunggu persetujuan">
        <Tabel kolom={kolom} data={menunggu} kosong="Tidak ada yang tertahan" />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Ambang T0–T4 diatur per outlet di Nalarasa OS. Nilai kecil lewat tanpa persetujuan,
          nilai besar menunggu pemilik. Transaksi di luar jam operasional naik satu tingkat.
        </p>
      </Card>
    </>
  );
}

export function Pengaturan() {
  const kolom: Kolom<Akun>[] = [
    { key: 'kode', label: 'Kode', mono: true },
    { key: 'nama', label: 'Nama akun' },
    { key: 'jenis', label: 'Jenis' },
    { key: 'kas', label: 'Kas', render: (a) => (a.kas ? <Pill label="Ya" tone="good" /> : <span className="text-ink-400">—</span>) },
  ];

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Profil usaha">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama usaha"><input className={input} defaultValue="Horison Emerald Timoho" /></Field>
            <Field label="NPWP"><input className={input} placeholder="00.000.000.0-000.000" /></Field>
            <Field label="Bentuk usaha">
              <select className={select}><option>Orang pribadi</option><option>Badan (PT/CV)</option></select>
            </Field>
            <Field label="Status PKP">
              <select className={select}><option>Belum PKP</option><option>Sudah PKP</option></select>
            </Field>
            <Field label="Awal tahun buku"><input type="month" className={input} defaultValue="2026-01" /></Field>
            <Field label="Mata uang"><input className={input} defaultValue="IDR" disabled /></Field>
          </div>
          <button className="btn btn-primary mt-4">Simpan Profil</button>
        </Card>

        <Card title="Saldo awal">
          <p className="text-[12.5px] text-ink-400 mb-3">
            Isi sekali saat mulai memakai sistem. Tanpa ini, neraca tidak akan pernah seimbang
            dan laporan hanya mencerminkan periode berjalan.
          </p>
          {AKUN.filter((a) => a.kas || a.kode === '1-200' || a.kode === '2-100' || a.kode === '3-100').map((a) => (
            <div key={a.kode} className="flex items-center gap-3 py-1.5">
              <span className="text-[13px] text-ink-600 flex-1">{a.nama}</span>
              <input type="number" className={`${input} w-[180px] text-right`} placeholder="0" />
            </div>
          ))}
          <button className="btn btn-primary mt-4">Simpan Saldo Awal</button>
        </Card>
      </div>

      <Card title="Bagan akun"
        action={<button className="btn btn-ghost border border-line bg-white">+ Tambah Akun</button>}>
        <Tabel kolom={kolom} data={AKUN} />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Bagan akun sengaja pendek. Menambah akun mempermudah laporan detail, tapi mempersulit
          admin memilih saat mencatat. Tambahkan hanya kalau benar-benar dipakai tiap bulan.
        </p>
      </Card>
    </>
  );
}
