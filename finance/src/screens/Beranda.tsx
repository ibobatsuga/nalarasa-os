import { Baris, Card, Stat, Tabel, Uang, Pill, type Kolom } from '../components/ui';
import {
  SETORAN, STRUK, TAGIHAN, TRANSAKSI, akunNama, labaRugi, posisiKas,
  rupiah, tanggal, persen, type Transaksi,
} from '../lib/data';
import { useServer } from '../lib/useServer';
import { ambilLabaRugi, ambilPosisiKas, ambilSetoran, ambilTagihan, ambilTransaksi } from '../lib/api';

/**
 * Layar pertama menjawab pertanyaan yang ditanyakan admin tiap pagi:
 * uang saya ada berapa, apa yang harus dikerjakan hari ini, ada yang aneh tidak.
 */
export function Beranda({ onNavigate }: { onNavigate: (k: string) => void }) {
  // Konstanta demo hanya jadi nilai awal; begitu server menjawab, angka GL menang.
  const { data: kas } = useServer(ambilPosisiKas, posisiKas(), 60_000);
  const totalKas = kas.reduce((s, k) => s + k.saldo, 0);
  const { data: lr, nyata } = useServer(ambilLabaRugi, labaRugi(), 60_000);
  const { data: setoran } = useServer(ambilSetoran, SETORAN, 60_000);
  const { data: tagihan } = useServer(ambilTagihan, TAGIHAN, 60_000);
  const { data: transaksi } = useServer(ambilTransaksi, TRANSAKSI, 60_000);

  const belumSetor = setoran.filter((s) => s.status === 'MENUNGGU_SETOR');
  const strukAntre = STRUK.filter((s) => s.status !== 'DIBUKUKAN');
  const trxMenunggu = transaksi.filter((t) => t.status === 'DIAJUKAN');
  const jatuhTempo = tagihan.filter((t) => t.status === 'JATUH_TEMPO');
  const utangDekat = tagihan.filter((t) => t.jenis === 'UTANG' && t.status === 'BELUM_JATUH_TEMPO');

  const tugas = [
    { label: 'Setoran tunai belum masuk bank', n: belumSetor.length, ke: 'kas', tone: 'warn' as const },
    { label: 'Struk belanja belum dibukukan', n: strukAntre.length, ke: 'struk', tone: 'warn' as const },
    { label: 'Transaksi menunggu persetujuan', n: trxMenunggu.length, ke: 'transaksi', tone: 'info' as const },
    { label: 'Piutang lewat jatuh tempo', n: jatuhTempo.length, ke: 'piutang', tone: 'bad' as const },
  ].filter((t) => t.n > 0);

  const kolomTrx: Kolom<Transaksi>[] = [
    { key: 'tanggal', label: 'Tanggal', render: (t) => tanggal(t.tanggal) },
    { key: 'keterangan', label: 'Keterangan' },
    { key: 'sumber', label: 'Sumber', render: (t) => <Pill label={t.sumber} tone={t.sumber === 'POS' ? 'good' : 'neutral'} /> },
    { key: 'jumlah', label: 'Jumlah', align: 'right', render: (t) => <Uang n={t.arah === 'MASUK' ? t.jumlah : -t.jumlah} /> },
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
        <Stat label="Total kas & bank" value={rupiah(totalKas, true)} note={`${kas.length} rekening`} />
        <Stat label="Laba bersih bulan ini" value={rupiah(lr.labaBersih, true)}
          tone={lr.labaBersih >= 0 ? 'good' : 'bad'} note={`margin kotor ${persen(lr.marginKotor)}`} />
        <Stat label="Utang jatuh tempo 30 hari" value={rupiah(utangDekat.reduce((s, t) => s + t.jumlah - t.terbayar, 0), true)}
          note={`${utangDekat.length} tagihan`} />
        <Stat label="Piutang lewat tempo" value={rupiah(jatuhTempo.reduce((s, t) => s + t.jumlah - t.terbayar, 0), true)}
          tone={jatuhTempo.length ? 'bad' : 'good'} note={`${jatuhTempo.length} tagihan`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <div className="space-y-4">
          <Card title="Perlu dikerjakan hari ini">
            {tugas.length === 0 && <p className="py-8 text-center text-[13px] text-leaf-600">Semua beres. Tidak ada tunggakan.</p>}
            <ul className="space-y-2">
              {tugas.map((t) => (
                <li key={t.label}>
                  <button onClick={() => onNavigate(t.ke)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-line hover:bg-navy-50/60 text-left transition-colors">
                    <Pill label={String(t.n)} tone={t.tone} />
                    <span className="text-[13px] text-ink-600">{t.label}</span>
                    <span className="ml-auto text-ink-400">›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Posisi kas">
            {kas.map((k) => (
              <Baris key={k.akun.kode} label={k.akun.nama} value={<Uang n={k.saldo} />} />
            ))}
            <Baris label="Total" value={<Uang n={totalKas} tebal />} tebal />
            <p className="mt-3 text-[11.5px] text-ink-400">
              Dana gateway adalah uang yang sudah diterima pelanggan tapi belum cair ke bank.
              Jangan dihitung sebagai kas siap pakai.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Transaksi terbaru"
            action={<button onClick={() => onNavigate('transaksi')} className="btn btn-ghost">Lihat semua</button>}>
            <Tabel kolom={kolomTrx}
            data={[...transaksi].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 8)} />
          </Card>

          <Card title="Ringkas bulan berjalan">
            <div className="grid sm:grid-cols-2 gap-x-8">
              <div>
                <Baris label="Pendapatan" value={<Uang n={lr.totalPendapatan} />} />
                <Baris label="Harga pokok penjualan" value={<Uang n={-lr.hpp} />} indent />
                <Baris label="Laba kotor" value={<Uang n={lr.labaKotor} tebal />} tebal />
              </div>
              <div>
                <Baris label="Beban operasional" value={<Uang n={-lr.operasional} />} />
                <Baris label="Laba bersih" value={<Uang n={lr.labaBersih} tebal />} tebal />
                <p className="mt-2 text-[11.5px] text-ink-400">
                  Angka ini hanya dari transaksi berstatus dibukukan. {trxMenunggu.length} transaksi
                  menunggu persetujuan dan belum masuk hitungan.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
