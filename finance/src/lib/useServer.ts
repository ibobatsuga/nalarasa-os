import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Memuat data dari server, dengan data contoh sebagai nilai awal.
 *
 * Layar tidak pernah kosong dan tidak pernah menunggu — ia menampilkan sesuatu
 * seketika, lalu diganti data nyata begitu tiba. `nyata` dipakai layar untuk
 * mengatakan yang sebenarnya, supaya tidak ada yang mengambil keputusan dari
 * angka contoh sambil mengira itu penjualan kemarin.
 */
export function useServer<T>(
  ambil: () => Promise<T>,
  awal: T,
  intervalMs = 0,
): { data: T; nyata: boolean; memuat: boolean; muatUlang: () => void } {
  const [data, setData] = useState<T>(awal);
  const [nyata, setNyata] = useState(false);
  const [memuat, setMemuat] = useState(true);

  // Simpan di ref: `ambil` biasanya arrow baru tiap render, dan kalau masuk ke
  // daftar dependensi, efeknya berjalan tanpa henti.
  const ambilRef = useRef(ambil);
  ambilRef.current = ambil;

  const muatUlang = useCallback(() => {
    let dibatalkan = false;
    setMemuat(true);
    void ambilRef.current()
      .then((hasil) => {
        if (dibatalkan) return;
        setData(hasil);
        setNyata(true);
      })
      .catch(() => { if (!dibatalkan) setNyata(false); })
      .finally(() => { if (!dibatalkan) setMemuat(false); });
    return () => { dibatalkan = true; };
  }, []);

  useEffect(() => {
    const batal = muatUlang();
    if (!intervalMs) return batal;
    const t = setInterval(muatUlang, intervalMs);
    return () => { batal(); clearInterval(t); };
  }, [muatUlang, intervalMs]);

  return { data, nyata, memuat, muatUlang };
}
