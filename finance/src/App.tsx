import { useState } from 'react';
import { Shell } from './components/Shell';
import { Beranda } from './screens/Beranda';
import { Kas } from './screens/Kas';
import { Struk } from './screens/Struk';
import { Transaksi } from './screens/Transaksi';
import { Tagihan } from './screens/Tagihan';
import { Buku } from './screens/Buku';
import { Pajak } from './screens/Pajak';
import { Laporan } from './screens/Laporan';
import { Persetujuan, Pengaturan } from './screens/Lainnya';
import { SETORAN, STRUK, TAGIHAN, TRANSAKSI } from './lib/data';

const JUDUL: Record<string, [string, string?]> = {
  beranda: ['Beranda', 'Ringkasan keuangan hari ini'],
  kas: ['Kas & Setoran', 'Uang tunai dari laci sampai rekening'],
  struk: ['Struk Belanja', 'Foto nota pasar menjadi transaksi'],
  transaksi: ['Transaksi', 'Pemasukan dan pengeluaran'],
  utang: ['Utang Pemasok', 'Tagihan yang harus dibayar'],
  piutang: ['Piutang', 'Tagihan yang harus ditagih'],
  buku: ['Jurnal & Buku Besar', 'Diturunkan otomatis dari transaksi'],
  pajak: ['Pajak & Upah', 'PPh final UMKM dan PPh 21 karyawan'],
  laporan: ['Laporan', 'Laba rugi, arus kas, kinerja outlet'],
  persetujuan: ['Persetujuan', 'Transaksi yang menunggu keputusan pemilik'],
  pengaturan: ['Pengaturan', 'Profil usaha, saldo awal, bagan akun'],
};

export default function App() {
  const [view, setView] = useState('beranda');
  const [judul, sub] = JUDUL[view] ?? JUDUL.beranda!;

  const badges = {
    kas: SETORAN.filter((s) => s.status === 'MENUNGGU_SETOR').length,
    struk: STRUK.filter((s) => s.status !== 'DIBUKUKAN').length,
    piutang: TAGIHAN.filter((t) => t.jenis === 'PIUTANG' && t.status === 'JATUH_TEMPO').length,
    persetujuan: TRANSAKSI.filter((t) => t.status === 'DIAJUKAN').length,
  };

  return (
    <Shell
      active={view} onNavigate={setView}
      title={judul} subtitle={sub} badges={badges}
      usaha="Horison Emerald Timoho" user="Admin Keuangan"
    >
      {view === 'beranda' && <Beranda onNavigate={setView} />}
      {view === 'kas' && <Kas />}
      {view === 'struk' && <Struk />}
      {view === 'transaksi' && <Transaksi />}
      {view === 'utang' && <Tagihan jenis="UTANG" />}
      {view === 'piutang' && <Tagihan jenis="PIUTANG" />}
      {view === 'buku' && <Buku />}
      {view === 'pajak' && <Pajak />}
      {view === 'laporan' && <Laporan />}
      {view === 'persetujuan' && <Persetujuan />}
      {view === 'pengaturan' && <Pengaturan />}
    </Shell>
  );
}
