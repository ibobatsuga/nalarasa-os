import { useState } from 'react';
import { Baris, Card, Pill, Stat, Uang } from '../components/ui';
import { TRANSAKSI, labaRugi, persen, posisiKas, rupiah } from '../lib/data';
import { useServer } from '../lib/useServer';
import { ambilLabaRugi, ambilPosisiKas, ambilTransaksi } from '../lib/api';

/**
 * Tiga laporan yang benar-benar dipakai pemilik warung: berapa untungnya,
 * ke mana uangnya pergi, dan outlet mana yang menghidupi yang lain.
 * Neraca lengkap ada di menu Buku; di sini yang dipakai untuk mengambil keputusan.
 */
export function Laporan() {
  const [tab, setTab] = useState<'labarugi' | 'aruskas' | 'outlet'>('labarugi');
  const { data: lr, nyata } = useServer(ambilLabaRugi, labaRugi(), 60_000);
  const { data: kas } = useServer(ambilPosisiKas, posisiKas(), 60_000);

  const { data: transaksi } = useServer(ambilTransaksi, TRANSAKSI, 60_000);
  const dibukukan = transaksi.filter((t) => t.status === 'DIBUKUKAN');
  const masuk = dibukukan.filter((t) => t.arah === 'MASUK');
  const keluar = dibukukan.filter((t) => t.arah === 'KELUAR');

  const perOutlet = ['RESTO-01', 'RESTO-02', 'HO'].map((o) => {
    const p = masuk.filter((t) => t.outlet === o).reduce((s, t) => s + t.jumlah, 0);
    const b = keluar.filter((t) => t.outlet === o).reduce((s, t) => s + t.jumlah, 0);
    return { outlet: o, pendapatan: p, beban: b, laba: p - b };
  });

  const perKategori = [...new Set(keluar.map((t) => t.kategori))]
    .map((k) => ({ kategori: k, jumlah: keluar.filter((t) => t.kategori === k).reduce((s, t) => s + t.jumlah, 0) }))
    .sort((a, b) => b.jumlah - a.jumlah);
  const totalKeluar = perKategori.reduce((s, k) => s + k.jumlah, 0);

  return (
    <>
      {!nyata && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-ink-600">
          Server belum terhubung — angka di bawah adalah data contoh. Jangan dipakai
          untuk keputusan pembayaran atau pelaporan pajak.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pendapatan" value={rupiah(lr.totalPendapatan, true)} />
        <Stat label="Laba kotor" value={rupiah(lr.labaKotor, true)} note={`margin ${persen(lr.marginKotor)}`} />
        <Stat label="Laba bersih" value={rupiah(lr.labaBersih, true)} tone={lr.labaBersih >= 0 ? 'good' : 'bad'} />
        <Stat label="Kas & bank" value={rupiah(kas.reduce((s, k) => s + k.saldo, 0), true)} />
      </div>

      <div className="flex gap-2">
        {([['labarugi', 'Laba rugi'], ['aruskas', 'Arus kas'], ['outlet', 'Per outlet']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>{l}</button>
        ))}
        <button className="btn btn-ghost border border-line bg-white ml-auto">Unduh PDF</button>
      </div>

      {tab === 'labarugi' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Laba rugi bulan berjalan">
            {lr.pendapatan.map((p) => (
              <Baris key={p.akun.kode} label={p.akun.nama} value={<Uang n={p.saldo} />} indent />
            ))}
            <Baris label="Total pendapatan" value={<Uang n={lr.totalPendapatan} tebal />} tebal />
            <Baris label="Harga pokok penjualan" value={<Uang n={-lr.hpp} />} indent />
            <Baris label="Laba kotor" value={<Uang n={lr.labaKotor} tebal />} tebal />
            {lr.beban.filter((b) => b.akun.kode !== '5-100').map((b) => (
              <Baris key={b.akun.kode} label={b.akun.nama} value={<Uang n={-b.saldo} />} indent />
            ))}
            <Baris label="Laba bersih" value={<Uang n={lr.labaBersih} tebal />} tebal />
            <p className="mt-3 text-[11.5px] text-ink-400">
              Margin kotor {persen(lr.marginKotor)}. Untuk kuliner, di bawah 55% biasanya berarti
              porsi bahan terlalu besar atau harga jual tertinggal dari harga pasar.
            </p>
          </Card>

          <Card title="Ke mana uang pergi">
            {perKategori.map((k) => (
              <div key={k.kategori} className="py-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ink-600">{k.kategori}</span>
                  <span><Uang n={k.jumlah} /> <span className="text-ink-400 text-[11.5px]">{persen(k.jumlah / totalKeluar)}</span></span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-navy-50 overflow-hidden">
                  <div className="h-full bg-navy-700 rounded-full" style={{ width: `${(k.jumlah / totalKeluar) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'aruskas' && (
        <Card title="Arus kas — metode langsung" className="max-w-[640px]">
          <p className="text-[12px] text-ink-400 mb-3">
            Disusun dari uang yang benar-benar bergerak, bukan dari akrual. Ini yang cocok
            untuk usaha yang mengelola kas harian.
          </p>
          <Baris label="Penerimaan dari pelanggan"
            value={<Uang n={masuk.filter((t) => t.kategori.includes('Penjualan')).reduce((s, t) => s + t.jumlah, 0)} />} indent />
          <Baris label="Penerimaan pelunasan piutang"
            value={<Uang n={masuk.filter((t) => t.kategori === 'Pelunasan piutang').reduce((s, t) => s + t.jumlah, 0)} />} indent />
          <Baris label="Total kas masuk" value={<Uang n={masuk.reduce((s, t) => s + t.jumlah, 0)} tebal />} tebal />
          {perKategori.map((k) => (
            <Baris key={k.kategori} label={k.kategori} value={<Uang n={-k.jumlah} />} indent />
          ))}
          <Baris label="Total kas keluar" value={<Uang n={-totalKeluar} tebal />} tebal />
          <Baris label="Arus kas bersih"
            value={<Uang n={masuk.reduce((s, t) => s + t.jumlah, 0) - totalKeluar} tebal />} tebal />
          <div className="mt-4 pt-3 border-t border-line">
            {kas.map((k) => <Baris key={k.akun.kode} label={`Saldo akhir — ${k.akun.nama}`} value={<Uang n={k.saldo} />} indent />)}
          </div>
        </Card>
      )}

      {tab === 'outlet' && (
        <Card title="Kinerja per outlet">
          <div className="grid gap-4 md:grid-cols-3">
            {perOutlet.map((o) => (
              <div key={o.outlet} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-navy-700">{o.outlet}</span>
                  <Pill label={o.laba >= 0 ? 'Untung' : 'Rugi'} tone={o.laba >= 0 ? 'good' : 'bad'} />
                </div>
                <div className="mt-3">
                  <Baris label="Pendapatan" value={<Uang n={o.pendapatan} />} />
                  <Baris label="Beban" value={<Uang n={-o.beban} />} />
                  <Baris label="Laba" value={<Uang n={o.laba} tebal />} tebal />
                </div>
                {o.pendapatan > 0 && (
                  <p className="mt-2 text-[11.5px] text-ink-400">Margin {persen(o.laba / o.pendapatan)}</p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[11.5px] text-ink-400">
            HO menampung beban yang tidak dibebankan ke outlet mana pun. Kalau angkanya besar,
            alokasikan ke outlet supaya perbandingan antar outlet jujur.
          </p>
        </Card>
      )}
    </>
  );
}
