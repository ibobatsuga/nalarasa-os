import { useState } from 'react';
import { ajukanCuti, type Cuti, type Profil, type SaldoCuti, type Shift, type Slip } from '../lib/api';

const rupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
const jamStr = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tglPanjang = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
const tglPendek = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

// ─── jadwal ───────────────────────────────────────────────────────────────────

export function Jadwal({ data }: { data: Shift[] }) {
  const hariIni = new Date().toDateString();
  const jamKerja = data.reduce(
    (s, x) => s + (new Date(x.selesai).getTime() - new Date(x.mulai).getTime()) / 3_600_000, 0);

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="sheet px-4 py-3">
          <p className="text-[11.5px] text-ink-400">Shift 14 hari</p>
          <p className="mt-0.5 text-[20px] font-bold text-navy-800">{data.length}</p>
        </div>
        <div className="sheet px-4 py-3">
          <p className="text-[11.5px] text-ink-400">Total jam</p>
          <p className="mt-0.5 text-[20px] font-bold text-navy-800">{Math.round(jamKerja)}</p>
        </div>
      </div>

      <section className="sheet">
        <h2 className="px-4 pt-4 pb-1 text-[14px] font-semibold text-navy-800">Jadwal saya</h2>
        <ul className="px-4 pb-3">
          {data.map((s) => {
            const ini = new Date(s.tanggal).toDateString() === hariIni;
            return (
              <li key={s.id} className={`py-3 border-b border-line last:border-0 ${ini ? '-mx-2 px-2 rounded-lg bg-navy-50/60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-navy-800">
                    {tglPanjang(s.tanggal)}
                    {ini && <span className="ml-2 text-[11px] font-semibold text-navy-600">hari ini</span>}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums text-navy-800">
                    {jamStr(s.mulai)}–{jamStr(s.selesai)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-400">
                  {s.outlet}{s.peran ? ` · ${s.peran}` : ''}
                  {!s.terbit && <span className="text-amber-500"> · belum terbit, masih bisa berubah</span>}
                </p>
              </li>
            );
          })}
          {data.length === 0 && (
            <li className="py-10 text-center text-[13px] text-ink-400">Belum ada jadwal diterbitkan</li>
          )}
        </ul>
      </section>
    </div>
  );
}

// ─── cuti ─────────────────────────────────────────────────────────────────────

const STATUS_CUTI: Record<string, { label: string; kelas: string }> = {
  SUBMITTED: { label: 'Menunggu', kelas: 'bg-orange-100 text-amber-500' },
  APPROVED: { label: 'Disetujui', kelas: 'bg-leaf-100 text-leaf-700' },
  REJECTED: { label: 'Ditolak', kelas: 'bg-red-100 text-brick-500' },
  DRAFT: { label: 'Draft', kelas: 'bg-slate-100 text-ink-600' },
  CANCELLED: { label: 'Dibatalkan', kelas: 'bg-slate-100 text-ink-600' },
};

export function CutiLayar({ saldo, riwayat, muat }: {
  saldo: SaldoCuti[]; riwayat: Cuti[]; muat: () => void;
}) {
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState(saldo[0]?.kode ?? 'TAHUNAN');
  const [mulai, setMulai] = useState(new Date().toISOString().slice(0, 10));
  const [selesai, setSelesai] = useState(new Date().toISOString().slice(0, 10));
  const [alasan, setAlasan] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const hari = Math.max(0,
    Math.round((new Date(selesai).getTime() - new Date(mulai).getTime()) / 86_400_000) + 1);
  const dipilih = saldo.find((s) => s.kode === jenis);
  const cukup = !dipilih || dipilih.sisa >= hari;

  const kirim = async () => {
    setSibuk(true);
    const r = await ajukanCuti({ leaveTypeCode: jenis, startsAt: mulai, endsAt: selesai, reason: alasan });
    setSibuk(false);
    if (r) { setPesan(`Pengajuan ${r.hari} hari terkirim, menunggu persetujuan.`); setBuka(false); muat(); }
    else setPesan('Gagal terkirim. Periksa sinyal, lalu coba lagi.');
    setTimeout(() => setPesan(''), 6000);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {saldo.map((s) => (
          <div key={s.kode} className="sheet px-3 py-3">
            <p className="text-[11.5px] text-ink-400 truncate">{s.nama}</p>
            <p className={`mt-0.5 text-[20px] font-bold tabular-nums ${s.sisa <= 2 ? 'text-amber-500' : 'text-navy-800'}`}>
              {s.sisa}
            </p>
            <p className="text-[11px] text-ink-400">dari {s.kuota} hari</p>
          </div>
        ))}
      </div>

      {pesan && <div className="sheet p-3 text-[12.5px] text-ink-600">{pesan}</div>}

      {!buka ? (
        <button onClick={() => setBuka(true)} className="tap tap-leaf w-full py-4 text-[15px]">
          Ajukan Cuti
        </button>
      ) : (
        <section className="sheet p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-navy-800">Ajukan cuti</h2>
            <button onClick={() => setBuka(false)} className="text-[13px] text-ink-400">Tutup</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {saldo.map((s) => (
              <button key={s.kode} onClick={() => setJenis(s.kode)}
                className={`tap py-2.5 text-[12.5px] ${jenis === s.kode ? 'tap-primary' : 'tap-ghost'}`}>
                {s.nama.replace('Cuti ', '')}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[12px] text-ink-500">Mulai</span>
              <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)}
                className="mt-1 w-full h-11 px-3 rounded-xl border border-line text-[14px] outline-none focus:border-navy-200" />
            </label>
            <label className="block">
              <span className="text-[12px] text-ink-500">Selesai</span>
              <input type="date" value={selesai} min={mulai} onChange={(e) => setSelesai(e.target.value)}
                className="mt-1 w-full h-11 px-3 rounded-xl border border-line text-[14px] outline-none focus:border-navy-200" />
            </label>
          </div>

          <label className="block">
            <span className="text-[12px] text-ink-500">Alasan</span>
            <input value={alasan} onChange={(e) => setAlasan(e.target.value)}
              placeholder="Acara keluarga, sakit, keperluan pribadi…"
              className="mt-1 w-full h-11 px-3 rounded-xl border border-line text-[14px] outline-none focus:border-navy-200" />
          </label>

          <div className={`rounded-xl px-3 py-2.5 text-[12.5px] ${cukup ? 'bg-canvas text-ink-600' : 'bg-red-50 text-brick-500'}`}>
            {hari} hari diajukan
            {dipilih && ` · sisa kuota ${dipilih.sisa} hari`}
            {!cukup && ' · kuota tidak cukup'}
          </div>

          <button onClick={() => void kirim()} disabled={sibuk || !cukup || hari === 0}
            className="tap tap-leaf w-full py-3.5 text-[15px] disabled:opacity-40">
            {sibuk ? 'Mengirim…' : 'Kirim Pengajuan'}
          </button>
        </section>
      )}

      <section className="sheet">
        <h2 className="px-4 pt-4 pb-1 text-[14px] font-semibold text-navy-800">Riwayat pengajuan</h2>
        <ul className="px-4 pb-3">
          {riwayat.map((c) => {
            const st = STATUS_CUTI[c.status] ?? STATUS_CUTI.DRAFT!;
            return (
              <li key={c.id} className="py-3 border-b border-line last:border-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-navy-800">{c.jenis}</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${st.kelas}`}>{st.label}</span>
                </div>
                <p className="mt-0.5 text-[12px] text-ink-500">
                  {tglPendek(c.mulai)} – {tglPendek(c.selesai)} · {c.hari} hari
                </p>
                {c.alasan && <p className="text-[11.5px] text-ink-400">{c.alasan}</p>}
              </li>
            );
          })}
          {riwayat.length === 0 && (
            <li className="py-10 text-center text-[13px] text-ink-400">Belum pernah mengajukan cuti</li>
          )}
        </ul>
      </section>
    </div>
  );
}

// ─── slip gaji ────────────────────────────────────────────────────────────────

export function Gaji({ data, profil }: { data: Slip[]; profil: Profil | null }) {
  const [buka, setBuka] = useState<string | null>(null);

  return (
    <div className="p-4 space-y-4">
      {profil?.kontrak && (
        <section className="sheet p-4">
          <p className="text-[12px] text-ink-400">Gaji pokok kontrak</p>
          <p className="mt-0.5 text-[22px] font-bold text-navy-800 tabular-nums">
            {rupiah(profil.kontrak.gajiPokok)}
          </p>
          <p className="mt-1 text-[11.5px] text-ink-400">
            {profil.kontrak.jenis}
            {profil.kontrak.sisaHari != null && ` · kontrak berakhir ${profil.kontrak.sisaHari} hari lagi`}
          </p>
        </section>
      )}

      <section className="sheet">
        <h2 className="px-4 pt-4 pb-1 text-[14px] font-semibold text-navy-800">Slip gaji</h2>
        <ul className="px-4 pb-3">
          {data.map((s) => (
            <li key={s.id} className="py-3 border-b border-line last:border-0">
              <button onClick={() => setBuka(buka === s.id ? null : s.id)} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium text-navy-800">
                    {s.dibayarPada
                      ? new Date(s.dibayarPada).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
                      : s.nomorRun}
                  </span>
                  <span className="text-[14px] font-bold tabular-nums text-navy-800">{rupiah(s.neto)}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] text-ink-400">
                  {s.nomorRun}
                  {s.dikoreksi && <span className="text-amber-500"> · ada koreksi</span>}
                </p>
              </button>

              {buka === s.id && (
                <div className="mt-2 rounded-xl bg-canvas p-3 space-y-1.5 text-[12.5px]">
                  <div className="flex justify-between"><span className="text-ink-500">Bruto</span><span className="tabular-nums">{rupiah(s.bruto)}</span></div>
                  <div className="flex justify-between"><span className="text-ink-500">Potongan</span><span className="tabular-nums text-brick-500">−{rupiah(s.potongan)}</span></div>
                  <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
                    <span className="text-navy-700">Diterima</span><span className="tabular-nums text-navy-800">{rupiah(s.neto)}</span>
                  </div>
                  <p className="pt-1 text-[11px] text-ink-400">
                    Rincian potongan mengikuti perhitungan payroll. Kalau ada yang janggal,
                    tanyakan ke HRD sebelum tanggal gajian berikutnya.
                  </p>
                </div>
              )}
            </li>
          ))}
          {data.length === 0 && (
            <li className="py-10 text-center text-[13px] text-ink-400">Belum ada slip gaji terbit</li>
          )}
        </ul>
      </section>
    </div>
  );
}

// ─── profil ───────────────────────────────────────────────────────────────────

export function ProfilLayar({ data }: { data: Profil | null }) {
  if (!data) return <p className="p-8 text-center text-[13px] text-ink-400">Data tidak tersedia</p>;

  const baris = [
    ['Nomor karyawan', data.employeeNo],
    ['Posisi', data.posisi ?? '—'],
    ['Departemen', data.departemen ?? '—'],
    ['Outlet', data.outlet ? `${data.outlet.kode} — ${data.outlet.nama}` : '—'],
    ['Bergabung', new Date(data.bergabung).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Jenis kontrak', data.kontrak?.jenis ?? '—'],
    ['Kontrak berakhir', data.kontrak?.berakhir
      ? new Date(data.kontrak.berakhir).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Tidak ada batas waktu'],
  ];

  return (
    <div className="p-4 space-y-4">
      <section className="sheet p-6 text-center">
        <div className="mx-auto grid place-items-center w-20 h-20 rounded-full bg-navy-700 text-white text-[26px] font-bold">
          {data.nama.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <p className="mt-3 text-[18px] font-bold text-navy-800">{data.nama}</p>
        <p className="text-[13px] text-ink-400">{data.posisi} · {data.outlet?.kode}</p>
      </section>

      <section className="sheet px-4 py-2">
        {baris.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5 border-b border-line last:border-0">
            <span className="text-[12.5px] text-ink-500">{k}</span>
            <span className="text-[12.5px] font-medium text-navy-800 text-right">{v}</span>
          </div>
        ))}
      </section>

      {data.kontrak?.sisaHari != null && data.kontrak.sisaHari <= 60 && (
        <div className="sheet p-4 border-amber-500/40">
          <p className="text-[13px] font-semibold text-navy-800">Kontrak akan berakhir</p>
          <p className="mt-1 text-[12.5px] text-ink-500">
            Tersisa {data.kontrak.sisaHari} hari. HRD biasanya membahas perpanjangan
            sebulan sebelum berakhir — kalau belum ada kabar, tanyakan.
          </p>
        </div>
      )}
    </div>
  );
}
