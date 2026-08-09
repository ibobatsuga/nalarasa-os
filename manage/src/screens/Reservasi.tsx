import { useState } from 'react';
import { ambilMeja, ambilReservasi, buatReservasi, ubahStatusReservasi } from '../lib/api';
import { useServer } from '../lib/useServer';
import { Card, Field, Pill, Stat, Tabel, input, select, type Kolom, type Tone } from '../components/ui';
import { MEJA, RESERVASI, kapasitas, type Reservasi as Row, type StatusReservasi } from '../lib/data';

const STATUS: Record<StatusReservasi, { label: string; tone: Tone }> = {
  DIKONFIRMASI: { label: 'Dikonfirmasi', tone: 'good' },
  MENUNGGU: { label: 'Menunggu konfirmasi', tone: 'warn' },
  DATANG: { label: 'Sudah datang', tone: 'info' },
  TIDAK_DATANG: { label: 'Tidak datang', tone: 'bad' },
  BATAL: { label: 'Batal', tone: 'neutral' },
};

const HARI_INI = '2026-08-07';

/**
 * Reservasi. Dua hal yang sering dilupakan sistem sejenis dan sengaja
 * ditampilkan di sini: jumlah kunjungan tamu (pelanggan tetap layak diprioritaskan
 * saat penuh) dan angka tidak-datang, karena itulah kursi yang terbuang paling mahal.
 */
export function Reservasi() {
  const { data: rows, nyata, muatUlang } = useServer(ambilReservasi, RESERVASI, 30_000);
  const { data: meja } = useServer(ambilMeja, MEJA, 60_000);
  const [buka, setBuka] = useState(false);
  const [tgl, setTgl] = useState(HARI_INI);
  const [galat, setGalat] = useState('');
  const [form, setForm] = useState({ nama: '', telepon: '', waktu: '19:00', pax: '2', meja: '', catatan: '', sumber: 'WHATSAPP' });

  const k = kapasitas(meja);
  const hariIni = rows.filter((r) => r.tanggal === tgl && r.status !== 'BATAL');
  const paxDipesan = hariIni.filter((r) => r.status !== 'TIDAK_DATANG').reduce((s, r) => s + r.pax, 0);
  const tidakDatang = rows.filter((r) => r.status === 'TIDAK_DATANG');
  const belumBerkursi = hariIni.filter((r) => !r.meja && r.status !== 'TIDAK_DATANG');

  const simpan = () => {
    const pax = Number(form.pax || 0);
    if (!form.nama.trim() || pax <= 0) return;
    setGalat('');
    // Server yang menentukan kunjungan ke berapa dan menolak meja yang terlalu
    // kecil; menyimpan dulu di layar berarti menjanjikan tempat yang belum tentu ada.
    void buatReservasi({
      nama: form.nama.trim(), telepon: form.telepon,
      waktuIso: `${tgl}T${form.waktu}:00.000Z`, pax,
      meja: form.meja || undefined, sumber: form.sumber as Row['sumber'],
      catatan: form.catatan || undefined,
    })
      .then(() => {
        setForm({ ...form, nama: '', telepon: '', catatan: '', meja: '' });
        setBuka(false);
        muatUlang();
      })
      .catch((e: Error) => setGalat(e.message));
  };

  const ubahStatus = (id: string, status: StatusReservasi) => {
    setGalat('');
    void ubahStatusReservasi(id, status).then(() => muatUlang()).catch((e: Error) => setGalat(e.message));
  };

  const kolom: Kolom<Row>[] = [
    { key: 'waktu', label: 'Jam', render: (r) => <span className="font-semibold text-navy-800">{r.waktu}</span> },
    { key: 'nama', label: 'Nama', render: (r) => (
      <span>
        {r.nama}
        {r.kunjunganKe >= 3 && <span className="ml-2 text-[11px] text-leaf-700 font-medium">tamu tetap ({r.kunjunganKe}×)</span>}
      </span>
    ) },
    { key: 'telepon', label: 'Telepon', mono: true },
    { key: 'pax', label: 'Orang', align: 'right' },
    { key: 'meja', label: 'Meja', render: (r) => (
      r.meja ? <Pill label={r.meja} tone="info" /> : <span className="text-amber-500 text-[12px]">belum ditentukan</span>
    ) },
    { key: 'sumber', label: 'Sumber', render: (r) => <span className="text-[12px] text-ink-400">{r.sumber}</span> },
    { key: 'catatan', label: 'Catatan', render: (r) => (
      r.catatan ? <span className="text-[12px] text-amber-500">{r.catatan}</span> : <span className="text-ink-400">—</span>
    ) },
    { key: 'status', label: 'Status', render: (r) => <Pill {...STATUS[r.status]} /> },
    { key: 'aksi', label: '', align: 'right', render: (r) => (
      r.status === 'MENUNGGU' || r.status === 'DIKONFIRMASI' ? (
        <div className="flex gap-1.5 justify-end">
          {r.status === 'MENUNGGU' && (
            <button onClick={() => ubahStatus(r.id, 'DIKONFIRMASI')} className="btn btn-primary">Konfirmasi</button>
          )}
          <button onClick={() => ubahStatus(r.id, 'DATANG')} className="btn btn-ghost border border-line bg-white">Datang</button>
        </div>
      ) : <span className="text-ink-400 text-[12px]">—</span>
    ) },
  ];

  const mejaKosong = MEJA.filter((m) => m.status === 'KOSONG');

  return (
    <>
      {!nyata && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-ink-600">
          Server belum terhubung — daftar di bawah adalah data contoh, bukan reservasi outlet Anda.
        </p>
      )}
      {galat && (
        <p className="mb-3 rounded-lg border border-brick-300 bg-brick-50 px-3 py-2 text-[12.5px] text-brick-600">{galat}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Reservasi hari ini" value={String(hariIni.length)} note={`${paxDipesan} orang`} />
        <Stat label="Kursi tersisa setelah reservasi" value={String(Math.max(0, k.siapJual - paxDipesan))}
          tone={k.siapJual - paxDipesan <= 0 ? 'bad' : 'good'} />
        <Stat label="Belum dapat meja" value={String(belumBerkursi.length)}
          tone={belumBerkursi.length ? 'warn' : 'good'} />
        <Stat label="Tidak datang bulan ini" value={String(tidakDatang.length)}
          tone={tidakDatang.length ? 'bad' : 'good'} note="kursi terbuang percuma" />
      </div>

      {buka && (
        <Card title="Reservasi baru" action={<button onClick={() => setBuka(false)} className="btn btn-ghost">Tutup</button>}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Nama tamu">
              <input className={input} value={form.nama} placeholder="Nama pemesan"
                onChange={(e) => setForm({ ...form, nama: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <input className={input} value={form.telepon} placeholder="08xx"
                onChange={(e) => setForm({ ...form, telepon: e.target.value })} />
            </Field>
            <Field label="Sumber">
              <select className={select} value={form.sumber} onChange={(e) => setForm({ ...form, sumber: e.target.value })}>
                <option value="WHATSAPP">WhatsApp</option><option value="TELEPON">Telepon</option>
                <option value="ONLINE">Online</option><option value="WALK_IN">Datang langsung</option>
              </select>
            </Field>
            <Field label="Jam">
              <input type="time" className={input} value={form.waktu}
                onChange={(e) => setForm({ ...form, waktu: e.target.value })} />
            </Field>
            <Field label="Jumlah orang">
              <input type="number" className={input} value={form.pax}
                onChange={(e) => setForm({ ...form, pax: e.target.value })} />
            </Field>
            <Field label="Meja" hint={`${mejaKosong.length} meja kosong saat ini`}>
              <select className={select} value={form.meja} onChange={(e) => setForm({ ...form, meja: e.target.value })}>
                <option value="">Tentukan nanti</option>
                {MEJA.filter((m) => m.kursi >= Number(form.pax || 0)).map((m) => (
                  <option key={m.kode} value={m.kode}>{m.kode} — {m.area}, {m.kursi} kursi</option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-3">
              <Field label="Catatan" hint="Alergi, ulang tahun, permintaan khusus. Ini yang dibaca pramusaji.">
                <input className={input} value={form.catatan}
                  onChange={(e) => setForm({ ...form, catatan: e.target.value })} />
              </Field>
            </div>
          </div>
          <button onClick={simpan} disabled={!form.nama.trim()} className="btn btn-primary mt-4 disabled:opacity-40">
            Simpan Reservasi
          </button>
        </Card>
      )}

      <Card title="Daftar reservasi"
        action={
          <div className="flex items-center gap-2">
            <input type="date" className={`${input} w-[150px]`} value={tgl} onChange={(e) => setTgl(e.target.value)} />
            {!buka && <button onClick={() => setBuka(true)} className="btn btn-primary">+ Reservasi</button>}
          </div>
        }>
        <Tabel kolom={kolom} data={rows.filter((r) => r.tanggal === tgl)} kosong="Belum ada reservasi di tanggal ini" />
        <p className="mt-3 text-[11.5px] text-ink-400">
          Reservasi yang sudah punya meja otomatis mengunci meja itu di denah, sehingga
          pramusaji tidak menempatkan tamu lain di sana.
        </p>
      </Card>
    </>
  );
}
