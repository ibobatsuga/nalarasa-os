import { useEffect, useState } from 'react';
import { absenKeluar, absenMasuk, antrean, kirimAntrean, type Absensi, type HasilAbsen } from '../lib/api';

const jamStr = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tgl = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
const durasi = (m: number) => `${Math.floor(m / 60)} jam ${m % 60} menit`;

/**
 * Layar utama. Satu tombol besar yang menjawab satu pertanyaan: sudah absen
 * atau belum. Semua hal lain berada di bawahnya.
 */
export function Absen({ data, muat }: { data: Absensi; muat: () => void }) {
  const hariIni = data.riwayat.find((r) => new Date(r.tanggal).toDateString() === new Date().toDateString());
  const sudahMasuk = Boolean(hariIni && !hariIni.keluar);
  const sudahPulang = Boolean(hariIni?.keluar);

  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<HasilAbsen | null>(null);
  const [antre, setAntre] = useState(antrean().length);

  useEffect(() => {
    void kirimAntrean().then((n) => { if (n > 0) { setAntre(antrean().length); muat(); } });
  }, [muat]);

  const ketuk = async () => {
    setSibuk(true);
    const r = sudahMasuk ? await absenKeluar() : await absenMasuk();
    setHasil(r);
    setAntre(antrean().length);
    setSibuk(false);
    if (r.terkirim) muat();
    setTimeout(() => setHasil(null), 6000);
  };

  return (
    <div className="p-4 space-y-4">
      <section className="sheet p-6 text-center">
        <p className="text-[13px] text-ink-400">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <p className="mt-1 text-[40px] font-bold text-navy-800 tabular-nums leading-none">
          {new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </p>

        {hariIni && (
          <div className="mt-4 flex justify-center gap-6 text-[13px]">
            <span><span className="text-ink-400">Masuk </span><strong className="text-navy-800">{jamStr(hariIni.masuk)}</strong></span>
            <span><span className="text-ink-400">Keluar </span>
              <strong className="text-navy-800">{hariIni.keluar ? jamStr(hariIni.keluar) : '—'}</strong>
            </span>
          </div>
        )}

        <button
          onClick={() => void ketuk()}
          disabled={sibuk || sudahPulang}
          className={`tap w-full mt-5 py-5 text-[18px] disabled:opacity-45 ${
            sudahPulang ? 'tap-ghost' : sudahMasuk ? 'tap-primary' : 'tap-leaf'}`}
        >
          {sibuk ? 'Memproses…'
            : sudahPulang ? 'Sudah absen pulang'
            : sudahMasuk ? 'Absen Pulang' : 'Absen Masuk'}
        </button>

        <p className="mt-3 text-[11.5px] text-ink-400 leading-snug">
          Lokasi dipakai untuk memastikan absen dilakukan di outlet. Kalau GPS meleset,
          absen tetap tercatat — hanya ditandai untuk diperiksa supervisor.
        </p>

        {antre > 0 && (
          <p className="mt-2 text-[12px] font-medium text-amber-500">
            {antre} absen menunggu terkirim. Jangan hapus aplikasi.
          </p>
        )}
      </section>

      {hasil && (
        <div className={`sheet p-4 ${hasil.terkirim ? 'border-leaf-600/40' : 'border-amber-500/40'}`}>
          {hasil.terkirim ? (
            <>
              <p className="text-[14px] font-semibold text-navy-800">Absen tercatat</p>
              <p className="mt-1 text-[12.5px] text-ink-500">
                {hasil.jarakM != null && `Jarak ${hasil.jarakM} m dari outlet. `}
                {hasil.terlambatMenit ? `Terlambat ${hasil.terlambatMenit} menit.` : 'Tepat waktu.'}
              </p>
              {hasil.ditandai && (
                <p className="mt-1.5 text-[12.5px] text-amber-500">Ditandai: {hasil.alasan}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-navy-800">Belum terkirim</p>
              <p className="mt-1 text-[12.5px] text-ink-500">{hasil.pesan}</p>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { l: 'Hari hadir', v: String(data.hariHadir), n: '30 hari terakhir' },
          { l: 'Total lembur', v: `${Math.round(data.totalLemburMenit / 60)} jam`, n: `${data.totalLemburMenit} menit` },
          { l: 'Terlambat', v: `${data.totalTerlambatMenit}′`, n: data.ditandai ? `${data.ditandai} ditandai` : 'bersih' },
        ].map((s) => (
          <div key={s.l} className="sheet px-3 py-3">
            <p className="text-[11.5px] text-ink-400">{s.l}</p>
            <p className="mt-0.5 text-[18px] font-bold text-navy-800 tabular-nums">{s.v}</p>
            <p className="text-[11px] text-ink-400">{s.n}</p>
          </div>
        ))}
      </div>

      <section className="sheet">
        <h2 className="px-4 pt-4 pb-2 text-[14px] font-semibold text-navy-800">Riwayat absen</h2>
        <ul className="px-4 pb-2">
          {data.riwayat.map((r) => (
            <li key={r.id} className="py-3 border-b border-line last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] font-medium text-navy-800">{tgl(r.tanggal)}</span>
                <span className="text-[13px] tabular-nums text-ink-600">
                  {jamStr(r.masuk)} – {r.keluar ? jamStr(r.keluar) : 'belum pulang'}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-ink-400">
                {r.keluar && durasi(Math.round((new Date(r.keluar).getTime() - new Date(r.masuk).getTime()) / 60_000))}
                {r.terlambatMenit > 0 && <span className="text-amber-500"> · telat {r.terlambatMenit}′</span>}
                {r.lemburMenit > 0 && <span className="text-leaf-700"> · lembur {r.lemburMenit}′</span>}
              </p>
              {r.ditandai && <p className="mt-1 text-[11.5px] text-brick-500">Ditandai: {r.alasan}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
