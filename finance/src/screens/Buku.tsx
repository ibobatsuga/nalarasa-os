import { useState } from 'react';
import { Card, Stat, Tabel, Uang, type Kolom } from '../components/ui';
import { TRANSAKSI, akunNama, bukuBesar, jurnal, rupiah, tanggal, type BarisJurnal, type SaldoAkun } from '../lib/data';
import { useServer } from '../lib/useServer';
import { ambilBukuBesar, ambilTransaksi } from '../lib/api';

/**
 * Jurnal diturunkan dari transaksi, tidak disimpan terpisah. Konsekuensinya
 * penting: buku tidak akan pernah berbeda dari transaksi, karena keduanya
 * bukan dua salinan — hanya satu sumber yang ditampilkan dua cara.
 */
export function Buku() {
  const [tab, setTab] = useState<'jurnal' | 'besar' | 'neraca'>('jurnal');
  // Jurnal disusun dari transaksi server; saldo per akun datang dari GL langsung
  // supaya neraca saldo tidak pernah berbeda dari yang dilihat controller.
  const { data: trx } = useServer(ambilTransaksi, TRANSAKSI, 60_000);
  const { data: bb, nyata } = useServer(ambilBukuBesar, bukuBesar(), 60_000);
  const baris = jurnal(trx);

  const totalDebit = baris.reduce((s, b) => s + b.debit, 0);
  const totalKredit = baris.reduce((s, b) => s + b.kredit, 0);
  const seimbang = Math.abs(totalDebit - totalKredit) < 1;

  const kolomJurnal: Kolom<BarisJurnal>[] = [
    { key: 'tanggal', label: 'Tanggal', render: (b) => tanggal(b.tanggal) },
    { key: 'ref', label: 'Ref', mono: true },
    { key: 'akunKode', label: 'Akun', render: (b) => (
      <span><span className="font-mono text-[11.5px] text-ink-400">{b.akunKode}</span> {akunNama(b.akunKode)}</span>
    ) },
    { key: 'keterangan', label: 'Keterangan' },
    { key: 'debit', label: 'Debit', align: 'right', render: (b) => (b.debit ? <Uang n={b.debit} /> : <span className="text-ink-400">—</span>) },
    { key: 'kredit', label: 'Kredit', align: 'right', render: (b) => (b.kredit ? <Uang n={b.kredit} /> : <span className="text-ink-400">—</span>) },
  ];

  const kolomBesar: Kolom<SaldoAkun>[] = [
    { key: 'kode', label: 'Kode', mono: true, render: (s) => s.akun.kode },
    { key: 'nama', label: 'Nama akun', render: (s) => s.akun.nama },
    { key: 'jenis', label: 'Jenis', render: (s) => <span className="text-[12px] text-ink-400">{s.akun.jenis}</span> },
    { key: 'debit', label: 'Debit', align: 'right', render: (s) => <Uang n={s.debit} /> },
    { key: 'kredit', label: 'Kredit', align: 'right', render: (s) => <Uang n={s.kredit} /> },
    { key: 'saldo', label: 'Saldo', align: 'right', render: (s) => <Uang n={s.saldo} tebal /> },
  ];

  const harta = bb.filter((s) => s.akun.jenis === 'HARTA');
  const utang = bb.filter((s) => s.akun.jenis === 'UTANG');
  const modal = bb.filter((s) => s.akun.jenis === 'MODAL');
  const totalHarta = harta.reduce((s, x) => s + x.saldo, 0);
  const totalUtang = utang.reduce((s, x) => s + x.saldo, 0);
  const labaBerjalan = bb.filter((s) => s.akun.jenis === 'PENDAPATAN').reduce((s, x) => s + x.saldo, 0)
    - bb.filter((s) => s.akun.jenis === 'BEBAN').reduce((s, x) => s + x.saldo, 0);
  const totalModal = modal.reduce((s, x) => s + x.saldo, 0) + labaBerjalan;

  return (
    <>
      {!nyata && (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-ink-600">
          Server belum terhubung — angka di bawah adalah data contoh. Jangan dipakai
          untuk keputusan pembayaran atau pelaporan pajak.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Baris jurnal" value={String(baris.length)} note="dari transaksi dibukukan" />
        <Stat label="Total debit" value={rupiah(totalDebit, true)} />
        <Stat label="Total kredit" value={rupiah(totalKredit, true)} />
        <Stat label="Keseimbangan" value={seimbang ? 'Seimbang' : 'Timpang'}
          tone={seimbang ? 'good' : 'bad'} note={seimbang ? 'debit = kredit' : rupiah(totalDebit - totalKredit)} />
      </div>

      <div className="flex gap-2">
        {([['jurnal', 'Jurnal'], ['besar', 'Buku besar'], ['neraca', 'Neraca saldo']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>{l}</button>
        ))}
      </div>

      {tab === 'jurnal' && (
        <Card title="Jurnal umum" action={<button className="btn btn-ghost border border-line bg-white">Unduh Excel</button>}>
          <Tabel kolom={kolomJurnal} data={baris} />
        </Card>
      )}

      {tab === 'besar' && (
        <Card title="Buku besar per akun">
          <Tabel kolom={kolomBesar} data={bb} />
        </Card>
      )}

      {tab === 'neraca' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Harta">
            {harta.map((s) => (
              <div key={s.akun.kode} className="flex justify-between py-1.5 text-[13px]">
                <span className="text-ink-600">{s.akun.nama}</span><Uang n={s.saldo} />
              </div>
            ))}
            <div className="flex justify-between border-t border-line mt-2 pt-2.5 text-[13.5px] font-semibold">
              <span className="text-navy-700">Total harta</span><Uang n={totalHarta} tebal />
            </div>
          </Card>

          <Card title="Utang & modal">
            {utang.map((s) => (
              <div key={s.akun.kode} className="flex justify-between py-1.5 text-[13px]">
                <span className="text-ink-600">{s.akun.nama}</span><Uang n={s.saldo} />
              </div>
            ))}
            {modal.map((s) => (
              <div key={s.akun.kode} className="flex justify-between py-1.5 text-[13px]">
                <span className="text-ink-600">{s.akun.nama}</span><Uang n={s.saldo} />
              </div>
            ))}
            <div className="flex justify-between py-1.5 text-[13px]">
              <span className="text-ink-600">Laba berjalan</span><Uang n={labaBerjalan} />
            </div>
            <div className="flex justify-between border-t border-line mt-2 pt-2.5 text-[13.5px] font-semibold">
              <span className="text-navy-700">Total utang & modal</span><Uang n={totalUtang + totalModal} tebal />
            </div>
            {Math.abs(totalHarta - (totalUtang + totalModal)) > 1 && (
              <p className="mt-3 text-[11.5px] text-brick-500">
                Selisih {rupiah(totalHarta - (totalUtang + totalModal))} — biasanya karena saldo awal
                belum dimasukkan. Isi di Pengaturan → Saldo Awal.
              </p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
