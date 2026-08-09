import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { Denah } from './screens/Denah';
import { Reservasi } from './screens/Reservasi';
import { Acara } from './screens/Acara';
import { MenuEngineering } from './screens/MenuEngineering';
import { Masuk } from './screens/Masuk';
import { sesi } from './lib/auth';
import { ACARA, MEJA, RESERVASI, kapasitas } from './lib/data';
import { ambilAcara, ambilMeja, ambilReservasi, langgananKoneksi, type Koneksi } from './lib/api';
import { useServer } from './lib/useServer';

const JUDUL: Record<string, [string, string?]> = {
  denah: ['Denah Meja', 'Status ruang dan kursi yang masih bisa dijual'],
  reservasi: ['Reservasi', 'Pemesanan tempat dan penempatan meja'],
  acara: ['Jadwal Acara', 'Private dining, musik, gathering'],
  menu: ['Menu Engineering', 'Menu mana yang benar-benar menghidupi outlet'],
};

export default function App() {
  // Sesi diperiksa sebelum apa pun dimuat: layar yang tampak normal padahal
  // setiap permintaannya ditolak server jauh lebih berbahaya daripada layar masuk.
  const [masuk, setMasuk] = useState(() => sesi() !== null);
  const [view, setView] = useState('denah');
  const [judul, sub] = JUDUL[view] ?? JUDUL.denah!;

  const { data: meja } = useServer(ambilMeja, MEJA, 15_000);
  const { data: reservasi } = useServer(ambilReservasi, RESERVASI, 30_000);
  const { data: acara } = useServer(ambilAcara, ACARA, 60_000);

  const [koneksi, setKoneksi] = useState<Koneksi>({ online: false, terakhir: null, sirkuitTerbuka: false, perluMasuk: false });
  useEffect(() => { const batal = langgananKoneksi(setKoneksi); return () => { batal(); }; }, []);

  const k = kapasitas(meja);
  const badges = {
    denah: k.perluBersih,
    reservasi: reservasi.filter((r) => r.status === 'MENUNGGU').length,
    acara: acara.filter((a) => a.status === 'TENTATIF').length,
  };

  // Status jaringan disebut apa adanya. "Sirkuit terbuka" bukan jargon yang
  // dipamerkan ke pemilik warung — yang dilihatnya adalah kalimat biasa.
  const statusJaringan = koneksi.sirkuitTerbuka ? 'Server tidak merespons — mencoba lagi otomatis'
    : koneksi.online ? 'Tersambung' : 'Mode luring';

  if (!masuk || koneksi.perluMasuk) {
    return <Masuk onMasuk={() => { setMasuk(true); window.location.reload(); }} />;
  }

  return (
    <Shell active={view} onNavigate={setView} title={judul} subtitle={sub}
      badges={badges} usaha={`RESTO-01 · ${statusJaringan}`} user="Dewi Anggraini">
      {view === 'denah' && <Denah />}
      {view === 'reservasi' && <Reservasi />}
      {view === 'acara' && <Acara />}
      {view === 'menu' && <MenuEngineering />}
    </Shell>
  );
}
