import { useState } from 'react';
import { Shell } from './components/Shell';
import { Denah } from './screens/Denah';
import { Reservasi } from './screens/Reservasi';
import { Acara } from './screens/Acara';
import { MenuEngineering } from './screens/MenuEngineering';
import { ACARA, MEJA, RESERVASI, kapasitas } from './lib/data';

const JUDUL: Record<string, [string, string?]> = {
  denah: ['Denah Meja', 'Status ruang dan kursi yang masih bisa dijual'],
  reservasi: ['Reservasi', 'Pemesanan tempat dan penempatan meja'],
  acara: ['Jadwal Acara', 'Private dining, musik, gathering'],
  menu: ['Menu Engineering', 'Menu mana yang benar-benar menghidupi outlet'],
};

export default function App() {
  const [view, setView] = useState('denah');
  const [judul, sub] = JUDUL[view] ?? JUDUL.denah!;
  const k = kapasitas();

  const badges = {
    denah: k.perluBersih,
    reservasi: RESERVASI.filter((r) => r.status === 'MENUNGGU').length,
    acara: ACARA.filter((a) => a.status === 'TENTATIF').length,
  };

  return (
    <Shell active={view} onNavigate={setView} title={judul} subtitle={sub}
      badges={badges} usaha="RESTO-01 · Horison Emerald" user="Dewi Anggraini">
      {view === 'denah' && <Denah />}
      {view === 'reservasi' && <Reservasi />}
      {view === 'acara' && <Acara />}
      {view === 'menu' && <MenuEngineering />}
    </Shell>
  );
}
