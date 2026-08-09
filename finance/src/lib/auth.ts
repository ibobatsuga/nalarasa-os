/**
 * Sesi aplikasi keuangan.
 *
 * Aplikasi turunan sebelumnya hanya mengirim header tenant dan tidak pernah
 * membawa token — jalan hanya karena stub pengembangan tidak memeriksa apa pun.
 * Server sungguhan menolaknya 401, dan layar diam-diam jatuh ke data contoh:
 * gagal yang paling berbahaya, karena tampak berhasil.
 */

const KEY = { token: 'keuangan.token', nama: 'keuangan.user', kedaluwarsa: 'manage.exp' };

export interface Sesi { token: string; nama: string; kedaluwarsa: string }

export function sesi(): Sesi | null {
  const token = localStorage.getItem(KEY.token);
  const kedaluwarsa = localStorage.getItem(KEY.kedaluwarsa);
  if (!token || !kedaluwarsa) return null;
  // Token kedaluwarsa dibuang lebih awal, bukan menunggu 401 dari server —
  // akuntan tidak boleh menekan tombol dan baru tahu sesinya habis.
  if (new Date(kedaluwarsa) <= new Date()) { keluar(); return null; }
  return { token, nama: localStorage.getItem(KEY.nama) ?? '', kedaluwarsa };
}

export function keluar(): void {
  Object.values(KEY).forEach((k) => localStorage.removeItem(k));
}

export async function masuk(subjectId: string, password: string): Promise<Sesi> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant': 'horison-emerald' },
    body: JSON.stringify({ subjectId, password }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; detail?: { until?: string } };
    if (res.status === 429) throw new Error('Terlalu banyak percobaan. Tunggu satu menit.');
    if (body.error === 'ACCOUNT_LOCKED') throw new Error('Akun terkunci sementara karena salah sandi berulang.');
    if (res.status === 401) throw new Error('Nama pengguna atau sandi salah.');
    throw new Error('Server tidak dapat dihubungi.');
  }

  const body = await res.json() as { token: string; expiresAt: string; actor: { userId: string } };
  localStorage.setItem(KEY.token, body.token);
  localStorage.setItem(KEY.kedaluwarsa, body.expiresAt);
  localStorage.setItem(KEY.nama, subjectId);
  return { token: body.token, nama: subjectId, kedaluwarsa: body.expiresAt };
}
