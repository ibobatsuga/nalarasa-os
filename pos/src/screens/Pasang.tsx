import { useState } from 'react';

/**
 * Pemasangan perangkat kasir.
 *
 * Dilakukan SEKALI, oleh supervisor, saat mesin kasir pertama kali dipasang di
 * outlet. Sesudahnya kasir cukup masuk dengan PIN — dan itu memang bukan
 * kredensial API: PIN hanya menggerbangi tampilan, token perangkat inilah yang
 * mengautentikasi ke server.
 *
 * Sebelum layar ini ada, `sync.ts` membaca `pos.token` yang tidak pernah ditulis
 * siapa pun. Till menyinkronkan tanpa token, server menolak 401, dan antrean
 * penjualan menumpuk di perangkat tanpa satu pun pesan yang menjelaskan sebabnya.
 */
export function Pasang({ onTerpasang }: { onTerpasang: () => void }) {
  const [subjectId, setSubjectId] = useState('u.svcmgr');
  const [sandi, setSandi] = useState('');
  const [tenant, setTenant] = useState(localStorage.getItem('pos.tenant') ?? 'horison-emerald');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);

  const pasang = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sibuk || !subjectId.trim() || !sandi) return;
    setSibuk(true);
    setGalat('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-tenant': tenant.trim() },
        body: JSON.stringify({ subjectId: subjectId.trim(), password: sandi }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 429) throw new Error('Terlalu banyak percobaan. Tunggu satu menit.');
        if (body.error === 'ACCOUNT_LOCKED') throw new Error('Akun terkunci sementara.');
        if (res.status === 401) throw new Error('Nama pengguna atau sandi salah.');
        if (res.status === 404) throw new Error(`Tenant "${tenant}" tidak dikenal.`);
        throw new Error('Server tidak dapat dihubungi.');
      }

      const body = await res.json() as { token: string; expiresAt: string };
      localStorage.setItem('pos.token', body.token);
      localStorage.setItem('pos.tokenExp', body.expiresAt);
      localStorage.setItem('pos.tenant', tenant.trim());
      onTerpasang();
    } catch (err) {
      setGalat((err as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="h-full grid place-items-center p-6">
      <form onSubmit={(e) => void pasang(e)} className="tile w-full max-w-[520px] p-8">
        <h1 className="text-[22px] font-bold text-navy-800">Pasang Mesin Kasir</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          Sekali saja, oleh supervisor. Setelah ini kasir cukup masuk dengan PIN.
        </p>

        <label className="mt-6 block text-[12.5px] font-medium text-ink-600">Kode usaha</label>
        <input value={tenant} onChange={(e) => setTenant(e.target.value)}
          className="mt-1 w-full h-12 px-3 rounded-xl border border-line text-[15px] outline-none focus:border-navy-200" />

        <label className="mt-4 block text-[12.5px] font-medium text-ink-600">Nama pengguna supervisor</label>
        <input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} autoFocus
          className="mt-1 w-full h-12 px-3 rounded-xl border border-line text-[15px] outline-none focus:border-navy-200" />

        <label className="mt-4 block text-[12.5px] font-medium text-ink-600">Sandi</label>
        <input type="password" value={sandi} onChange={(e) => setSandi(e.target.value)}
          className="mt-1 w-full h-12 px-3 rounded-xl border border-line text-[15px] outline-none focus:border-navy-200" />

        <p className="mt-2 h-5 text-[13px] text-brick-500">{galat}</p>

        <button type="submit" disabled={sibuk || !sandi}
          className="key key-leaf w-full mt-3 py-4 text-[16px] disabled:opacity-40">
          {sibuk ? 'Memasang…' : 'Pasang perangkat'}
        </button>
      </form>
    </div>
  );
}
