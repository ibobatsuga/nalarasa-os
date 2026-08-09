import { useMemo, useState } from 'react';
import { Card, Field, Pill, Stat, Tabel, Uang, input, select, type Kolom, type Tone } from '../components/ui';
import {
  AKUN, KATEGORI_KELUAR, KATEGORI_MASUK, STRUK, TRANSAKSI, akunNama,
  rupiah, tanggal, type Arah, type StatusDoc, type Transaksi as Trx,
} from '../lib/data';
import { useServer } from '../lib/useServer';
import { ambilTransaksi } from '../lib/api';

const STATUS: Record<StatusDoc, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  DIAJUKAN: { label: 'Menunggu setuju', tone: 'warn' },
  DISETUJUI: { label: 'Disetujui', tone: 'info' },
  DIBUKUKAN: { label: 'Dibukukan', tone: 'good' },
  DITOLAK: { label: 'Ditolak', tone: 'bad' },
};

const SUMBER: Record<Trx['sumber'], Tone> = {
  POS: 'good', MANUAL: 'neutral', STRUK: 'info', BANK: 'info', PAYROLL: 'neutral',
};

/**
 * Input transaksi manual. Yang datang dari POS, struk, dan payroll tidak diketik
 * ulang di sini — cukup ditinjau. Yang diketik manual hanya yang memang tidak
 * punya jejak sistem: bayar sewa, token listrik, tarik modal.
 */
export function Transaksi() {
  // Daftar transaksi datang dari buku besar. `setRows` masih dipakai untuk
  // penyuntingan lokal sebelum dikirim; muat ulang server menimpanya.
  const { data: dariServer, nyata } = useServer(ambilTransaksi, TRANSAKSI, 60_000);
  const [suntingan, setRows] = useState<Trx[] | null>(null);
  const rows = suntingan ?? dariServer;
  const [buka, setBuka] = useState(false);
  const [filter, setFilter] = useState<'SEMUA' | StatusDoc>('SEMUA');
  const [q, setQ] = useState('');

  const [arah, setArah] = useState<Arah>('KELUAR');
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().slice(0, 10),
    kategori: KATEGORI_KELUAR[0]!,
    akunKode: '6-400',
    lawanAkunKode: '1-102',
    keterangan: '',
    jumlah: '',
    outlet: 'RESTO-01',
  });

  const tampil = useMemo(() => {
    const n = q.trim().toLowerCase();
    return rows.filter((t) =>
      (filter === 'SEMUA' || t.status === filter) &&
      (!n || t.keterangan.toLowerCase().includes(n) || t.id.toLowerCase().includes(n)));
  }, [rows, filter, q]);

  const menunggu = rows.filter((t) => t.status === 'DIAJUKAN');
  const masukBulan = rows.filter((t) => t.arah === 'MASUK' && t.status === 'DIBUKUKAN').reduce((s, t) => s + t.jumlah, 0);
  const keluarBulan = rows.filter((t) => t.arah === 'KELUAR' && t.status === 'DIBUKUKAN').reduce((s, t) => s + t.jumlah, 0);

  const simpan = () => {
    const jumlah = Number(form.jumlah || 0);
    if (jumlah <= 0 || !form.keterangan.trim()) return;
    const baru: Trx = {
      id: `TRX-${String(232 + rows.length).padStart(4, '0')}`,
      tanggal: form.tanggal, arah, kategori: form.kategori,
      akunKode: arah === 'KELUAR' ? form.akunKode : form.lawanAkunKode,
      lawanAkunKode: arah === 'KELUAR' ? form.lawanAkunKode : form.akunKode,
      keterangan: form.keterangan.trim(), jumlah, outlet: form.outlet,
      sumber: 'MANUAL', status: 'DIAJUKAN',
    };
    setRows([baru, ...rows]);
    setForm({ ...form, keterangan: '', jumlah: '' });
    setBuka(false);
  };

  const kolom: Kolom<Trx>[] = [
    { key: 'id', label: 'Nomor', mono: true },
    { key: 'tanggal', label: 'Tanggal', render: (t) => tanggal(t.tanggal) },
    { key: 'keterangan', label: 'Keterangan' },
    { key: 'kategori', label: 'Kategori' },
    { key: 'akun', label: 'Akun', render: (t) => <span className="text-[12px] text-ink-400">{akunNama(t.arah === 'KELUAR' ? t.akunKode : t.lawanAkunKode)}</span> },
    { key: 'outlet', label: 'Outlet' },
    { key: 'sumber', label: 'Sumber', render: (t) => <Pill label={t.sumber} tone={SUMBER[t.sumber]} /> },
    { key: 'jumlah', label: 'Jumlah', align: 'right', render: (t) => <Uang n={t.arah === 'MASUK' ? t.jumlah : -t.jumlah} tebal /> },
    { key: 'status', label: 'Status', render: (t) => <Pill {...STATUS[t.status]} /> },
  ];

  const daftarAkun = AKUN.filter((a) => (arah === 'KELUAR' ? a.jenis === 'BEBAN' : a.jenis === 'PENDAPATAN'));
  const daftarKas = AKUN.filter((a) => a.kas || a.kode === '2-100' || a.kode === '1-200');

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Uang masuk bulan ini" value={rupiah(masukBulan, true)} tone="good" />
        <Stat label="Uang keluar bulan ini" value={rupiah(keluarBulan, true)} />
        <Stat label="Selisih" value={rupiah(masukBulan - keluarBulan, true)}
          tone={masukBulan - keluarBulan >= 0 ? 'good' : 'bad'} />
        <Stat label="Menunggu persetujuan" value={String(menunggu.length)}
          tone={menunggu.length ? 'warn' : 'good'} note={rupiah(menunggu.reduce((s, t) => s + t.jumlah, 0), true)} />
      </div>

      {buka && (
        <Card title={`Catat transaksi ${arah === 'KELUAR' ? 'keluar' : 'masuk'}`}
          action={<button onClick={() => setBuka(false)} className="btn btn-ghost">Tutup</button>}>
          <div className="flex gap-2 mb-4">
            {(['KELUAR', 'MASUK'] as Arah[]).map((a) => (
              <button key={a} onClick={() => {
                setArah(a);
                setForm((f) => ({
                  ...f,
                  kategori: a === 'KELUAR' ? KATEGORI_KELUAR[0]! : KATEGORI_MASUK[0]!,
                  akunKode: a === 'KELUAR' ? '6-400' : '4-100',
                }));
              }} className={`btn ${arah === a ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>
                {a === 'KELUAR' ? 'Uang keluar' : 'Uang masuk'}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Tanggal">
              <input type="date" className={input} value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
            </Field>
            <Field label="Kategori">
              <select className={select} value={form.kategori}
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}>
                {(arah === 'KELUAR' ? KATEGORI_KELUAR : KATEGORI_MASUK).map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Outlet">
              <select className={select} value={form.outlet}
                onChange={(e) => setForm({ ...form, outlet: e.target.value })}>
                <option>RESTO-01</option><option>RESTO-02</option><option>HO</option>
              </select>
            </Field>

            <Field label={arah === 'KELUAR' ? 'Masuk ke beban' : 'Masuk ke pendapatan'}>
              <select className={select} value={form.akunKode}
                onChange={(e) => setForm({ ...form, akunKode: e.target.value })}>
                {daftarAkun.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </Field>
            <Field label={arah === 'KELUAR' ? 'Dibayar dari' : 'Diterima di'}>
              <select className={select} value={form.lawanAkunKode}
                onChange={(e) => setForm({ ...form, lawanAkunKode: e.target.value })}>
                {daftarKas.map((a) => <option key={a.kode} value={a.kode}>{a.kode} — {a.nama}</option>)}
              </select>
            </Field>
            <Field label="Jumlah" hint={form.jumlah ? rupiah(Number(form.jumlah)) : 'Rupiah, tanpa titik'}>
              <input type="number" className={`${input} text-right`} value={form.jumlah} placeholder="0"
                onChange={(e) => setForm({ ...form, jumlah: e.target.value })} />
            </Field>

            <div className="md:col-span-3">
              <Field label="Keterangan" hint="Tulis apa adanya. Ini yang dibaca pemilik saat menyetujui.">
                <input className={input} value={form.keterangan} placeholder="Contoh: token listrik outlet 2, Agustus"
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="mt-5 flex gap-2">
            <button onClick={simpan} disabled={!form.keterangan.trim() || Number(form.jumlah || 0) <= 0}
              className="btn btn-primary disabled:opacity-40">Simpan & Ajukan</button>
            <button onClick={() => setBuka(false)} className="btn btn-ghost border border-line bg-white">Batal</button>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-400">
            Transaksi di atas ambang batas outlet akan menunggu persetujuan pemilik sebelum masuk buku.
            Ambangnya diatur di Nalarasa OS, bukan di sini.
          </p>
        </Card>
      )}

      <Card title={`Daftar transaksi (${tampil.length})`}
        action={!buka ? <button onClick={() => setBuka(true)} className="btn btn-primary">+ Transaksi Baru</button> : undefined}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan atau nomor…"
            className={`${input} w-[240px]`} />
          {(['SEMUA', 'DIAJUKAN', 'DIBUKUKAN'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`btn ${filter === f ? 'btn-primary' : 'btn-ghost'}`}>
              {f === 'SEMUA' ? 'Semua' : STATUS[f].label}
            </button>
          ))}
          <span className="ml-auto text-[12px] text-ink-400">
            {STRUK.filter((s) => s.status === 'SIAP').length} struk siap dibukukan
          </span>
        </div>
        <Tabel kolom={kolom} data={tampil} />
      </Card>
    </>
  );
}
