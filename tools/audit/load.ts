/**
 * Uji beban terhadap server sungguhan.
 *
 * Tujuannya bukan angka besar, melainkan menjawab satu pertanyaan: berapa
 * ambang laju yang tidak menghalangi outlet sibuk, tapi tetap menahan
 * penyalahgunaan? Ambang yang ditebak tanpa pengukuran selalu salah ke salah
 * satu arah — terlalu longgar sehingga tidak melindungi, atau terlalu ketat
 * sehingga kasir ditolak di jam ramai.
 *
 *   PORT=3200 node --env-file=.env --import tsx src/server.ts &
 *   node --env-file=.env --import tsx tools/audit/load.ts
 */

const BASE = process.env.BASE ?? 'http://localhost:3200';
const TENANT = 'horison-emerald';

interface Hasil {
  nama: string;
  total: number;
  ok: number;
  ditahan: number;   // 429
  galat: number;
  p50: number;
  p95: number;
  maks: number;
  detik: number;
}

async function masuk(subjectId: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tenant': TENANT },
    body: JSON.stringify({ subjectId, password: 'ubah-password-ini-2026' }),
  });
  if (!res.ok) throw new Error(`login ${subjectId} gagal: ${res.status}`);
  return (await res.json() as { token: string }).token;
}

/** Menjalankan `total` permintaan dengan `serentak` yang berjalan bersamaan. */
async function beban(
  nama: string, total: number, serentak: number, kirim: () => Promise<Response>,
): Promise<Hasil> {
  const waktu: number[] = [];
  let ok = 0, ditahan = 0, galat = 0;
  let berikutnya = 0;
  const mulai = process.hrtime.bigint();

  const pekerja = Array.from({ length: serentak }, async () => {
    while (berikutnya < total) {
      berikutnya += 1;
      const a = process.hrtime.bigint();
      try {
        const res = await kirim();
        if (res.status === 429) ditahan += 1;
        else if (res.ok) ok += 1;
        else galat += 1;
        await res.arrayBuffer(); // habiskan badan; koneksi tidak menggantung
      } catch {
        galat += 1;
      }
      waktu.push(Number(process.hrtime.bigint() - a) / 1e6);
    }
  });
  await Promise.all(pekerja);

  const detik = Number(process.hrtime.bigint() - mulai) / 1e9;
  waktu.sort((x, y) => x - y);
  const persentil = (p: number) => waktu[Math.min(waktu.length - 1, Math.floor(waktu.length * p))] ?? 0;

  return {
    nama, total, ok, ditahan, galat,
    p50: persentil(0.5), p95: persentil(0.95), maks: waktu[waktu.length - 1] ?? 0, detik,
  };
}

function cetak(h: Hasil): void {
  const rps = (h.total / h.detik).toFixed(0);
  process.stdout.write(
    `  ${h.nama.padEnd(34)} ${String(h.ok).padStart(4)} ok  ` +
    `${String(h.ditahan).padStart(3)} ditahan  ${String(h.galat).padStart(3)} galat  ` +
    `p50 ${h.p50.toFixed(0).padStart(4)}ms  p95 ${h.p95.toFixed(0).padStart(5)}ms  ${rps.padStart(4)} rps\n`,
  );
}

async function main(): Promise<void> {
  const token = await masuk('u.controller');
  const kasir = await masuk('u.cashier');
  const h = (t: string) => ({ 'content-type': 'application/json', 'x-tenant': TENANT, authorization: `Bearer ${t}` });

  process.stdout.write('── baca ringan (rute meta, tanpa basis data)\n');
  cetak(await beban('GET /health ×300 ⇉20', 300, 20,
    () => fetch(`${BASE}/health`)));

  process.stdout.write('── baca berat (agregasi buku besar)\n');
  cetak(await beban('GET /finance/summary ×100 ⇉10', 100, 10,
    () => fetch(`${BASE}/finance/summary`, { headers: h(token) })));
  cetak(await beban('GET /finance/transactions ×100 ⇉10', 100, 10,
    () => fetch(`${BASE}/finance/transactions`, { headers: h(token) })));

  process.stdout.write('── permukaan yang dipakai till tiap 20 detik\n');
  cetak(await beban('GET /pos/till/bootstrap ×100 ⇉10', 100, 10,
    () => fetch(`${BASE}/pos/till/bootstrap?siteCode=RESTO-01`, { headers: h(kasir) })));

  process.stdout.write('── login (sengaja menabrak batas 10/menit)\n');
  cetak(await beban('POST /auth/login ×40 ⇉10', 40, 10,
    () => fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant': TENANT },
      body: JSON.stringify({ subjectId: 'u.hantu', password: 'salah' }),
    })));

  process.stdout.write(
    '\n  Catatan: p95 di atas mengukur PGlite satu-proses di laptop. Postgres\n' +
    '  sungguhan jauh lebih cepat; angka ini adalah batas bawah, bukan target.\n',
  );
}

void main();
