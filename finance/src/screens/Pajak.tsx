import { useState } from 'react';
import { Baris, Card, Field, Pill, Stat, Tabel, Uang, input, type Kolom } from '../components/ui';
import {
  BATAS_PKP, TARIF_PPH_FINAL, labaRugi, pph21Bulanan, pphFinal, rupiah, persen,
} from '../lib/data';

interface Upah {
  nama: string;
  jenis: 'BULANAN' | 'HARIAN';
  hari: number;
  bruto: number;
}

const UPAH: Upah[] = [
  { nama: 'Tono Prasetyo', jenis: 'BULANAN', hari: 26, bruto: 4_700_000 },
  { nama: 'Rina Kusuma', jenis: 'BULANAN', hari: 26, bruto: 3_950_000 },
  { nama: 'Bagas Nugroho', jenis: 'BULANAN', hari: 26, bruto: 6_500_000 },
  { nama: 'Dewi Anggraini', jenis: 'BULANAN', hari: 26, bruto: 5_200_000 },
  { nama: 'Sari Wulandari', jenis: 'HARIAN', hari: 18, bruto: 2_880_000 },
  { nama: 'Andi Saputra', jenis: 'HARIAN', hari: 14, bruto: 2_240_000 },
];

/**
 * Pajak untuk pasar sasaran adalah PPh final 0,5% dari omzet — bukan PPN dan
 * bukan SPT badan. Menampilkan kalkulator PPN pada warung yang belum PKP justru
 * menyesatkan; yang berguna adalah peringatan kapan ambang PKP akan terlewati.
 */
export function Pajak() {
  const lr = labaRugi();
  const [omzetKumulatif, setOmzetKumulatif] = useState(1_240_000_000);
  const [orangPribadi, setOrangPribadi] = useState(true);

  const omzetBulan = lr.totalPendapatan;
  const hitung = pphFinal(omzetKumulatif, omzetBulan, orangPribadi);
  const proyeksiTahun = (omzetKumulatif / 8) * 12; // Agustus = bulan ke-8

  const kolomUpah: Kolom<Upah>[] = [
    { key: 'nama', label: 'Nama' },
    { key: 'jenis', label: 'Jenis', render: (u) => <Pill label={u.jenis === 'BULANAN' ? 'Bulanan' : 'Harian'} tone={u.jenis === 'BULANAN' ? 'info' : 'neutral'} /> },
    { key: 'hari', label: 'Hari kerja', align: 'right' },
    { key: 'bruto', label: 'Bruto', align: 'right', render: (u) => <Uang n={u.bruto} /> },
    { key: 'pph', label: 'PPh 21', align: 'right', render: (u) => {
      const p = pph21Bulanan(u.bruto);
      return p.pajak > 0 ? <Uang n={p.pajak} /> : <span className="text-ink-400">nihil</span>;
    } },
    { key: 'neto', label: 'Diterima', align: 'right', render: (u) => <Uang n={u.bruto - pph21Bulanan(u.bruto).pajak} tebal /> },
  ];

  const totalBruto = UPAH.reduce((s, u) => s + u.bruto, 0);
  const totalPph21 = UPAH.reduce((s, u) => s + pph21Bulanan(u.bruto).pajak, 0);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="PPh final bulan ini" value={rupiah(hitung.pajak, true)} note={`${persen(TARIF_PPH_FINAL)} dari omzet kena pajak`} />
        <Stat label="Omzet kumulatif tahun ini" value={rupiah(omzetKumulatif, true)} />
        <Stat label="Sisa ambang PKP" value={rupiah(hitung.sisaAmbangPkp, true)}
          tone={hitung.sisaAmbangPkp < 500_000_000 ? 'warn' : 'good'}
          note={`ambang ${rupiah(BATAS_PKP, true)}`} />
        <Stat label="PPh 21 karyawan" value={rupiah(totalPph21, true)} note={`${UPAH.length} orang`} />
      </div>

      {proyeksiTahun > BATAS_PKP && (
        <div className="card px-4 py-3 flex items-start gap-3 border-orange-200 bg-orange-50/60">
          <span className="w-2 h-2 mt-1.5 rounded-full bg-amber-500 shrink-0" />
          <p className="text-[12.5px] text-ink-600">
            Dengan laju sekarang, omzet setahun diperkirakan {rupiah(proyeksiTahun, true)} — melewati ambang
            {' '}{rupiah(BATAS_PKP, true)}. Siapkan pengukuhan PKP sebelum terlambat: setelah dikukuhkan,
            kewajiban berubah ke PPN dan tarif final 0,5% tidak berlaku lagi.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Hitung PPh final (PP 55/2022)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Omzet kumulatif tahun berjalan" hint={rupiah(omzetKumulatif)}>
              <input type="number" className={`${input} text-right`} value={omzetKumulatif}
                onChange={(e) => setOmzetKumulatif(Number(e.target.value || 0))} />
            </Field>
            <Field label="Bentuk usaha">
              <div className="flex gap-2">
                {([[true, 'Orang pribadi'], [false, 'Badan']] as const).map(([v, l]) => (
                  <button key={l} onClick={() => setOrangPribadi(v)}
                    className={`btn flex-1 justify-center ${orangPribadi === v ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-4">
            <Baris label="Omzet bulan ini" value={<Uang n={omzetBulan} />} />
            {orangPribadi && (
              <Baris label="Bagian bebas pajak terpakai" value={<Uang n={-hitung.bebasDipakai} />} indent />
            )}
            <Baris label="Omzet kena pajak" value={<Uang n={hitung.kenaPajak} />} indent />
            <Baris label={`PPh final ${persen(TARIF_PPH_FINAL)}`} value={<Uang n={hitung.pajak} tebal />} tebal />
          </div>

          <p className="mt-3 text-[11.5px] text-ink-400">
            Orang pribadi bebas PPh final atas Rp 500 juta omzet pertama setiap tahun.
            Badan usaha tidak mendapat pembebasan ini.
          </p>
          <button className="btn btn-primary w-full mt-4 justify-center">Buat Transaksi Setoran Pajak</button>
        </Card>

        <Card title="Upah & PPh 21 bulan berjalan"
          action={<button className="btn btn-ghost border border-line bg-white">Unduh Slip</button>}>
          <Tabel kolom={kolomUpah} data={UPAH} />
          <div className="mt-3 grid sm:grid-cols-3 gap-x-6">
            <Baris label="Total bruto" value={<Uang n={totalBruto} />} />
            <Baris label="Total PPh 21" value={<Uang n={totalPph21} />} />
            <Baris label="Dibayarkan" value={<Uang n={totalBruto - totalPph21} tebal />} />
          </div>
          <p className="mt-3 text-[11.5px] text-ink-400">
            Pekerja harian di bawah batas harian tidak dipotong. Angka di atas mengikuti data payroll
            di Nalarasa OS; ubah gaji di modul Karyawan, bukan di sini.
          </p>
        </Card>
      </div>
    </>
  );
}
