import { useState } from 'react';
import { Card, Pill, Stat, type Tone } from '../components/ui';
import { MEJA, RESERVASI, kapasitas, persen, type Meja, type StatusMeja } from '../lib/data';

const GAYA: Record<StatusMeja, { label: string; tone: Tone; kotak: string }> = {
  KOSONG: { label: 'Kosong', tone: 'good', kotak: 'border-leaf-600/40 bg-leaf-100/40' },
  TERISI: { label: 'Terisi', tone: 'info', kotak: 'border-navy-200 bg-navy-50' },
  DIPESAN: { label: 'Dipesan', tone: 'warn', kotak: 'border-amber-500/40 bg-orange-50' },
  PERLU_BERSIH: { label: 'Perlu dibersihkan', tone: 'bad', kotak: 'border-brick-500/40 bg-red-50' },
  DIGABUNG: { label: 'Digabung', tone: 'neutral', kotak: 'border-line bg-slate-50' },
};

/**
 * Denah meja. Yang membuatnya berguna bukan gambarnya, tapi satu angka:
 * berapa kursi yang MASIH BISA DIJUAL malam ini. Meja kotor yang tidak
 * dibereskan adalah kursi yang hilang, dan itu ditampilkan terang-terangan.
 */
export function Denah() {
  const [meja, setMeja] = useState<Meja[]>(MEJA);
  const [pilih, setPilih] = useState<Meja | null>(null);
  const k = kapasitas(meja);

  const area = [...new Set(meja.map((m) => m.area))];
  const ubah = (kode: string, status: StatusMeja) => {
    setMeja(meja.map((m) => (m.kode === kode
      ? { ...m, status, dudukSejak: status === 'TERISI' ? 0 : undefined, tamu: status === 'TERISI' ? m.tamu : undefined }
      : m)));
    setPilih(null);
  };

  const resDari = (id?: string) => RESERVASI.find((r) => r.id === id);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Okupansi sekarang" value={persen(k.okupansi)}
          note={`${k.terpakai} dari ${k.total} kursi`} tone={k.okupansi > 0.8 ? 'warn' : 'good'} />
        <Stat label="Kursi siap dijual" value={String(k.siapJual)} tone={k.siapJual < 8 ? 'warn' : 'good'} />
        <Stat label="Kursi sudah dipesan" value={String(k.dipesan)} />
        <Stat label="Rata-rata lama duduk" value={`${k.rataDuduk} menit`}
          note={k.rataDuduk > 75 ? 'perputaran melambat' : 'perputaran sehat'}
          tone={k.rataDuduk > 75 ? 'warn' : 'good'} />
        <Stat label="Meja perlu dibersihkan" value={String(k.perluBersih)}
          tone={k.perluBersih ? 'bad' : 'good'} note={k.perluBersih ? 'kursi yang hilang percuma' : 'semua siap'} />
      </div>

      {pilih && (
        <Card title={`Meja ${pilih.kode} — ${pilih.area}, ${pilih.kursi} kursi`}
          action={<button onClick={() => setPilih(null)} className="btn btn-ghost">Tutup</button>}>
          {pilih.reservasiId && resDari(pilih.reservasiId) && (
            <p className="mb-3 text-[13px] text-ink-600">
              Dipesan untuk <strong>{resDari(pilih.reservasiId)!.nama}</strong> pukul{' '}
              {resDari(pilih.reservasiId)!.waktu} · {resDari(pilih.reservasiId)!.pax} orang
              {resDari(pilih.reservasiId)!.catatan ? ` · ${resDari(pilih.reservasiId)!.catatan}` : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(['KOSONG', 'TERISI', 'DIPESAN', 'PERLU_BERSIH', 'DIGABUNG'] as StatusMeja[]).map((s) => (
              <button key={s} onClick={() => ubah(pilih.kode, s)}
                className={`btn ${pilih.status === s ? 'btn-primary' : 'btn-ghost border border-line bg-white'}`}>
                {GAYA[s].label}
              </button>
            ))}
          </div>
        </Card>
      )}

      {area.map((a) => (
        <Card key={a} title={a}
          action={<span className="text-[12px] text-ink-400">
            {meja.filter((m) => m.area === a && m.status === 'KOSONG').reduce((s, m) => s + m.kursi, 0)} kursi kosong
          </span>}>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
            {meja.filter((m) => m.area === a).map((m) => (
              <button key={m.kode} onClick={() => setPilih(m)}
                className={`rounded-xl border-2 p-3 text-left transition-transform active:scale-[.98] ${GAYA[m.status].kotak}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[17px] font-bold text-navy-800">{m.kode}</span>
                  <span className="text-[12px] text-ink-500">{m.kursi} kursi</span>
                </div>
                <div className="mt-2"><Pill label={GAYA[m.status].label} tone={GAYA[m.status].tone} /></div>
                {m.status === 'TERISI' && (
                  <p className="mt-2 text-[12px] text-ink-500">
                    {m.tamu} tamu · {m.dudukSejak}′
                    {m.pramusaji ? ` · ${m.pramusaji}` : ''}
                  </p>
                )}
                {m.status === 'DIPESAN' && resDari(m.reservasiId) && (
                  <p className="mt-2 text-[12px] text-amber-500">
                    {resDari(m.reservasiId)!.waktu} · {resDari(m.reservasiId)!.nama}
                  </p>
                )}
              </button>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}
