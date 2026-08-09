import { useState } from 'react';
import { Baris, Card, Pill, Stat, Tabel, Uang, type Kolom, type Tone } from '../components/ui';
import { SETORAN, TRANSAKSI, posisiKas, rupiah, tanggal, type SetoranKas, type Transaksi } from '../lib/data';

const STATUS: Record<SetoranKas['status'], { label: string; tone: Tone }> = {
  MENUNGGU_SETOR: { label: 'Belum disetor', tone: 'warn' },
  DISETOR: { label: 'Sudah disetor', tone: 'info' },
  COCOK_BANK: { label: 'Cocok bank', tone: 'good' },
};

/**
 * Setoran tunai adalah titik paling rawan di usaha kuliner: uang berpindah dari
 * laci ke tangan orang ke bank. Layar ini merapatkan tiga angka yang harus sama
 * — kas sistem, kas dihitung, dan yang benar-benar masuk rekening.
 */
export function Kas() {
  const [tab, setTab] = useState<'setoran' | 'buku'>('setoran');
  const kas = posisiKas();
  const belumSetor = SETORAN.filter((s) => s.status === 'MENUNGGU_SETOR');
  const selisihTotal = SETORAN.reduce((s, x) => s + x.selisih, 0);

  const kolomSetoran: Kolom<SetoranKas>[] = [
    { key: 'tanggal', label: 'Tanggal', render: (s) => tanggal(s.tanggal) },
    { key: 'outlet', label: 'Outlet' },
    { key: 'sesiPos', label: 'Sesi POS', mono: true },
    { key: 'kasSistem', label: 'Kas sistem', align: 'right', render: (s) => <Uang n={s.kasSistem} /> },
    { key: 'kasDihitung', label: 'Kas dihitung', align: 'right', render: (s) => <Uang n={s.kasDihitung} /> },
    { key: 'selisih', label: 'Selisih', align: 'right', render: (s) => <Uang n={s.selisih} /> },
    { key: 'disetor', label: 'Masuk bank', align: 'right', render: (s) => <Uang n={s.disetor} /> },
    { key: 'status', label: 'Status', render: (s) => <Pill {...STATUS[s.status]} /> },
  ];

  const bukuKas = TRANSAKSI.filter((t) => t.status === 'DIBUKUKAN');
  let saldo = 0;
  const barisBuku = bukuKas
    .slice()
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal))
    .map((t) => {
      const delta = t.arah === 'MASUK' ? t.jumlah : -t.jumlah;
      saldo += delta;
      return { ...t, delta, saldo };
    })
    .reverse();

  const kolomBuku: Kolom<(typeof barisBuku)[number]>[] = [
    { key: 'tanggal', label: 'Tanggal', render: (t) => tanggal(t.tanggal) },
    { key: 'id', label: 'Ref', mono: true },
    { key: 'keterangan', label: 'Keterangan' },
    { key: 'masuk', label: 'Masuk', align: 'right', render: (t) => (t.delta > 0 ? <Uang n={t.delta} /> : <span className="text-ink-400">—</span>) },
    { key: 'keluar', label: 'Keluar', align: 'right', render: (t) => (t.delta < 0 ? <Uang n={t.delta} /> : <span className="text-ink-400">—</span>) },
    { key: 'saldo', label: 'Saldo', align: 'right', render: (t) => <Uang n={t.saldo} tebal /> },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Kas & bank" value={rupiah(kas.reduce((s, k) => s + k.saldo, 0), true)} />
        <Stat label="Belum disetor ke bank" value={rupiah(belumSetor.reduce((s, x) => s + x.kasDihitung, 0), true)}
          tone={belumSetor.length ? 'warn' : 'good'} note={`${belumSetor.length} sesi`} />
        <Stat label="Selisih kas bulan ini" value={rupiah(selisihTotal)}
          tone={selisihTotal === 0 ? 'good' : 'bad'} note="dari seluruh sesi kasir" />
        <Stat label="Dana gateway belum cair"
          value={rupiah(kas.find((k) => k.akun.kode === '1-120')?.saldo ?? 0, true)} note="QRIS, kartu, e-wallet" />
      </div>

      <div className="flex gap-2">
        {([['setoran', 'Setoran dari POS'], ['buku', 'Buku kas']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`btn ${tab === k ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>{l}</button>
        ))}
      </div>

      {tab === 'setoran' ? (
        <Card title="Setoran tunai per sesi kasir"
          action={<button className="btn btn-primary">+ Catat Setoran</button>}>
          <Tabel kolom={kolomSetoran} data={SETORAN} />
          <p className="mt-3 text-[11.5px] text-ink-400">
            Baris ini datang otomatis dari aplikasi kasir saat shift ditutup. Selisih di luar
            batas outlet sudah diajukan ke pemilik lewat Nalarasa OS — tidak perlu diajukan lagi di sini.
          </p>
        </Card>
      ) : (
        <Card title="Buku kas" action={<button className="btn btn-ghost border border-line bg-white">Unduh Excel</button>}>
          <Tabel kolom={kolomBuku} data={barisBuku} />
        </Card>
      )}

      <Card title="Rekonsiliasi bank" className="max-w-[520px]">
        <Baris label="Saldo buku" value={<Uang n={kas.find((k) => k.akun.kode === '1-110')?.saldo ?? 0} />} />
        <Baris label="Setoran dalam perjalanan" value={<Uang n={belumSetor.reduce((s, x) => s + x.kasDihitung, 0)} />} indent />
        <Baris label="Saldo rekening koran" value={<Uang n={(kas.find((k) => k.akun.kode === '1-110')?.saldo ?? 0) + belumSetor.reduce((s, x) => s + x.kasDihitung, 0)} tebal />} tebal />
        <button className="btn btn-primary w-full mt-4 justify-center">Unggah Rekening Koran</button>
      </Card>
    </>
  );
}

export type { Transaksi };
