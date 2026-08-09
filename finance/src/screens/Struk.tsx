import { useState } from 'react';
import { Card, Field, Pill, Stat, Tabel, Uang, input, select, type Kolom, type Tone } from '../components/ui';
import { KATEGORI_KELUAR, STRUK, rupiah, tanggal, type Struk as StrukRow } from '../lib/data';

const STATUS: Record<StrukRow['status'], { label: string; tone: Tone }> = {
  ANTRE: { label: 'Antre baca', tone: 'neutral' },
  PERLU_KOREKSI: { label: 'Perlu koreksi', tone: 'warn' },
  SIAP: { label: 'Siap dibukukan', tone: 'info' },
  DIBUKUKAN: { label: 'Dibukukan', tone: 'good' },
};

/**
 * Belanja pasar tidak punya faktur pajak — buktinya nota tulis tangan atau foto
 * di HP. Layar ini mengubah foto jadi transaksi, tapi tidak pernah membukukan
 * sendiri: angka hasil pembacaan harus dilihat manusia dulu. Keyakinan rendah
 * ditandai, bukan disembunyikan.
 */
export function Struk() {
  const [rows, setRows] = useState<StrukRow[]>(STRUK);
  const [pilih, setPilih] = useState<StrukRow | null>(null);

  const antre = rows.filter((s) => s.status === 'ANTRE' || s.status === 'PERLU_KOREKSI');
  const siap = rows.filter((s) => s.status === 'SIAP');

  const bukukan = (s: StrukRow) => {
    setRows(rows.map((r) => (r.id === s.id ? { ...r, status: 'DIBUKUKAN' } : r)));
    setPilih(null);
  };

  const kolom: Kolom<StrukRow>[] = [
    { key: 'id', label: 'Nomor', mono: true },
    { key: 'diterima', label: 'Diterima', render: (s) => tanggal(s.diterima) },
    { key: 'pemasok', label: 'Pemasok / pasar' },
    { key: 'outlet', label: 'Outlet' },
    { key: 'jumlahBaris', label: 'Baris', align: 'right' },
    { key: 'keyakinan', label: 'Keyakinan baca', align: 'right', render: (s) => (
      <span className={s.keyakinan >= 0.85 ? 'text-leaf-600' : s.keyakinan >= 0.6 ? 'text-amber-500' : 'text-brick-500'}>
        {Math.round(s.keyakinan * 100)}%
      </span>
    ) },
    { key: 'total', label: 'Total', align: 'right', render: (s) => <Uang n={s.total} /> },
    { key: 'status', label: 'Status', render: (s) => <Pill {...STATUS[s.status]} /> },
    { key: 'aksi', label: '', align: 'right', render: (s) => (
      s.status === 'DIBUKUKAN'
        ? <span className="text-ink-400 text-[12px]">—</span>
        : <button onClick={() => setPilih(s)} className="btn btn-ghost border border-line bg-white">Periksa</button>
    ) },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Antre & perlu koreksi" value={String(antre.length)} tone={antre.length ? 'warn' : 'good'} />
        <Stat label="Siap dibukukan" value={String(siap.length)}
          note={rupiah(siap.reduce((s, x) => s + x.total, 0), true)} />
        <Stat label="Sudah dibukukan bulan ini" value={String(rows.filter((s) => s.status === 'DIBUKUKAN').length)} />
        <Stat label="Rata-rata keyakinan baca"
          value={`${Math.round((rows.reduce((s, x) => s + x.keyakinan, 0) / rows.length) * 100)}%`}
          note="di bawah 60% wajib diketik ulang" />
      </div>

      {pilih && (
        <Card title={`Periksa ${pilih.id} — ${pilih.pemasok}`}
          action={<button onClick={() => setPilih(null)} className="btn btn-ghost">Tutup</button>}>
          {pilih.keyakinan < 0.6 && (
            <div className="mb-4 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-200 text-[12.5px] text-ink-600">
              Pembacaan meragukan ({Math.round(pilih.keyakinan * 100)}%). {pilih.catatan ?? 'Periksa setiap baris sebelum membukukan.'}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Tanggal"><input type="date" className={input} defaultValue={pilih.diterima} /></Field>
            <Field label="Pemasok / pasar"><input className={input} defaultValue={pilih.pemasok} /></Field>
            <Field label="Kategori">
              <select className={select} defaultValue="Belanja bahan pasar">
                {KATEGORI_KELUAR.map((k) => <option key={k}>{k}</option>)}
              </select>
            </Field>
            <Field label="Total" hint={rupiah(pilih.total)}>
              <input type="number" className={`${input} text-right`} defaultValue={pilih.total} />
            </Field>
          </div>
          <div className="mt-5 flex gap-2">
            <button onClick={() => bukukan(pilih)} className="btn btn-primary">Jadikan Transaksi</button>
            <button onClick={() => setPilih(null)} className="btn btn-ghost border border-line bg-white">Nanti dulu</button>
          </div>
        </Card>
      )}

      <Card title="Antrean struk"
        action={<button className="btn btn-primary">+ Unggah Foto Struk</button>}>
        <Tabel kolom={kolom} data={rows} />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Foto struk bisa dikirim dari HP lewat aplikasi karyawan. Sistem membaca angkanya,
          tapi tidak pernah membukukan sendiri — selalu ada mata manusia sebelum masuk buku.
        </p>
      </Card>
    </>
  );
}
