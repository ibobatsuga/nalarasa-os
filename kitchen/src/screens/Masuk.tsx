import { useState } from 'react';
import { masuk } from '../lib/auth';

/**
 * Gerbang masuk aplikasi dapur.
 *
 * Tanpa ini, layar tetap tampil rapi memakai data contoh sementara server
 * menolak setiap permintaan — supervisor akan menempatkan tamu berdasarkan
 * denah yang bukan denahnya. Lebih baik menahan di depan pintu.
 */
export function Masuk({ onMasuk }: { onMasuk: () => void }) {
  const [subjectId, setSubjectId] = useState('u.svcmgr');
  const [sandi, setSandi] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const kirim = (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk || !subjectId.trim() || !sandi) return;
    setSibuk(true);
    setGalat('');
    void masuk(subjectId.trim(), sandi)
      .then(onMasuk)
      .catch((err: Error) => setGalat(err.message))
      .finally(() => setSibuk(false));
  };

  return (
    <div className="min-h-screen grid place-items-center bg-navy-50 p-6">
      <form onSubmit={kirim} className="w-full max-w-[420px] rounded-2xl border border-line bg-white p-8 shadow-sm">
        <h1 className="text-[22px] font-bold text-navy-800">Dapur</h1>
        <p className="mt-1 text-[13px] text-ink-400">Nalarasa OS · masuk untuk melihat antrean sebenarnya</p>

        <label className="mt-6 block text-[12.5px] font-medium text-ink-600">Nama pengguna</label>
        <input
          value={subjectId} onChange={(e) => setSubjectId(e.target.value)} autoFocus
          className="mt-1 w-full h-11 px-3 rounded-lg border border-line text-[14px] outline-none focus:border-navy-300"
        />

        <label className="mt-4 block text-[12.5px] font-medium text-ink-600">Sandi</label>
        <input
          type="password" value={sandi} onChange={(e) => setSandi(e.target.value)}
          className="mt-1 w-full h-11 px-3 rounded-lg border border-line text-[14px] outline-none focus:border-navy-300"
        />

        <p className="mt-2 h-5 text-[12.5px] text-brick-600">{galat}</p>

        <button
          type="submit" disabled={sibuk || !sandi}
          className="mt-3 w-full h-11 rounded-lg bg-navy-700 text-white text-[14.5px] font-medium disabled:opacity-40">
          {sibuk ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
