import { useEffect, useState } from 'react';
import { Card, Field, Pill, Stat, input } from '../components/ui';
import { BAHAN, MENU, STASIUN_LABEL, type MenuDapur } from '../lib/data';
import { ambilMenu, ubahKetersediaan } from '../lib/api';

const ALASAN = ['Bahan habis', 'Bahan belum datang', 'Kualitas tidak layak', 'Alat rusak', 'Sedang prep'];

/**
 * Daftar 86 — istilah dapur untuk menu yang dimatikan. Dapur pemilik sahnya;
 * kasir dan pramusaji hanya membaca. Mematikan menu di sini langsung
 * menyembunyikannya di POS, sehingga tamu tidak memesan sesuatu yang tak ada.
 */
export function Menu() {
  const [menu, setMenu] = useState<MenuDapur[]>(MENU);
  useEffect(() => { void ambilMenu().then(setMenu); }, []);
  const [tanya, setTanya] = useState<MenuDapur | null>(null);
  const [alasan, setAlasan] = useState(ALASAN[0]!);
  const [lain, setLain] = useState('');

  const habis = menu.filter((m) => !m.tersedia);
  const menipis = menu.filter((m) => m.tersedia && m.sisaPorsi > 0 && m.sisaPorsi <= 10);
  const bahanKritis = BAHAN.filter((b) => b.stok <= b.minimum);

  const matikan = (m: MenuDapur, sebab: string) => {
    setMenu(menu.map((x) => (x.kode === m.kode ? { ...x, tersedia: false, alasan: sebab, sisaPorsi: 0 } : x)));
    setTanya(null); setLain('');
    void ubahKetersediaan(m.kode, false, sebab);
  };

  const hidupkan = (m: MenuDapur) => {
    setMenu(menu.map((x) => (x.kode === m.kode ? { ...x, tersedia: true, alasan: undefined, sisaPorsi: 10 } : x)));
    void ubahKetersediaan(m.kode, true);
  };

  const kategori = [...new Set(menu.map((m) => m.kategori))];

  return (
    <div className="p-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Menu dimatikan" value={String(habis.length)} tone={habis.length ? 'bad' : 'good'} />
        <Stat label="Menu menipis" value={String(menipis.length)} tone={menipis.length ? 'warn' : 'good'}
          note="sisa 10 porsi atau kurang" />
        <Stat label="Bahan di bawah minimum" value={String(bahanKritis.length)}
          tone={bahanKritis.length ? 'warn' : 'good'} />
        <Stat label="Menu aktif" value={`${menu.filter((m) => m.tersedia).length} / ${menu.length}`} />
      </div>

      {tanya && (
        <Card title={`Matikan ${tanya.nama}`}
          action={<button onClick={() => setTanya(null)} className="btn btn-ghost">Batal</button>}>
          <p className="text-[13px] text-ink-500 mb-3">
            Kasir akan melihat alasan ini saat tamu bertanya. Tulis yang jujur dan singkat.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {[...ALASAN, 'Lainnya'].map((a) => (
              <button key={a} onClick={() => setAlasan(a)}
                className={`key py-3 rounded-xl text-[14px] font-medium ${
                  alasan === a ? 'bg-navy-700 text-white' : 'bg-white border border-line text-ink-600'}`}>
                {a}
              </button>
            ))}
          </div>
          {alasan === 'Lainnya' && (
            <div className="mt-3">
              <Field label="Alasan"><input className={input} value={lain} onChange={(e) => setLain(e.target.value)} /></Field>
            </div>
          )}
          <button onClick={() => matikan(tanya, alasan === 'Lainnya' ? lain : alasan)}
            disabled={alasan === 'Lainnya' && lain.trim().length < 3}
            className="mt-4 w-full py-3.5 rounded-xl bg-brick-500 text-white text-[15px] font-semibold disabled:opacity-40">
            Matikan Menu Sekarang
          </button>
        </Card>
      )}

      {kategori.map((k) => (
        <Card key={k} title={k}>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {menu.filter((m) => m.kategori === k).map((m) => (
              <div key={m.kode}
                className={`rounded-xl border p-3.5 ${m.tersedia ? 'border-line bg-white' : 'border-brick-500/40 bg-red-50/50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[14.5px] font-semibold text-navy-800 leading-snug">{m.nama}</span>
                  <Pill label={m.tersedia ? 'Ada' : '86'} tone={m.tersedia ? 'good' : 'bad'} />
                </div>
                <p className="mt-1 text-[11.5px] text-ink-400">
                  {STASIUN_LABEL[m.stasiun]} · {m.waktuMasakMenit} menit
                </p>
                {m.tersedia ? (
                  <p className={`mt-1.5 text-[12.5px] ${m.sisaPorsi <= 10 ? 'text-amber-500 font-medium' : 'text-ink-500'}`}>
                    Cukup untuk {m.sisaPorsi} porsi
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12.5px] text-brick-500">{m.alasan}</p>
                )}
                <button
                  onClick={() => (m.tersedia ? setTanya(m) : hidupkan(m))}
                  className={`mt-3 w-full py-2.5 rounded-lg text-[13.5px] font-medium ${
                    m.tersedia ? 'bg-white border border-line text-ink-600 hover:bg-navy-50' : 'bg-leaf-600 text-white'}`}>
                  {m.tersedia ? 'Matikan' : 'Hidupkan lagi'}
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
