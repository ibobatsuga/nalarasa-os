import { useState } from 'react';
import { pinDigest, store, type Cashier } from '../lib/store';

/**
 * PIN sign-in. The digest list is cached at bootstrap, so a cashier can start a
 * shift with the internet down. The PIN gates the till UI only — the device's
 * API token is what authenticates to the server.
 */
/** PIN kasir enam angka — sama panjangnya dengan PIN kartu ATM, jadi terbiasa. */
const PANJANG_PIN = 6;

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const cashiers = store.cashiers();
  const [picked, setPicked] = useState<Cashier | null>(cashiers.length === 1 ? cashiers[0]! : null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const press = (d: string) => {
    setError('');
    setPin((v) => (d === '⌫' ? v.slice(0, -1) : d === 'C' ? '' : (v + d).slice(0, PANJANG_PIN)));
  };

  const submit = async () => {
    if (!picked || pin.length !== PANJANG_PIN || busy) return;
    setBusy(true);
    const digest = await pinDigest(picked, pin);
    setBusy(false);

    if (digest !== picked.pinHash) {
      setError('PIN salah');
      setPin('');
      return;
    }
    store.setCashier(picked.name, picked.employeeNo);
    onSignedIn();
  };

  // No cashier list yet (fresh till, never synced): fall back to a name.
  if (cashiers.length === 0) {
    return <NameFallback onSignedIn={onSignedIn} />;
  }

  return (
    <div className="h-full grid place-items-center p-6">
      <div className="tile w-full max-w-[560px] p-8">
        <h1 className="text-[22px] font-bold text-navy-800">Masuk Kasir</h1>
        <p className="mt-1 text-[13px] text-ink-400">Pilih nama, lalu masukkan PIN.</p>

        <div className="mt-5 grid grid-cols-2 gap-2 max-h-[188px] overflow-y-auto">
          {cashiers.map((c) => (
            <button key={c.employeeNo}
              onClick={() => { setPicked(c); setPin(''); setError(''); }}
              className={`key py-3 px-3 text-left ${picked?.employeeNo === c.employeeNo ? 'key-primary' : 'key-ghost'}`}>
              <span className="block text-[14px] truncate">{c.name}</span>
              <span className={`block text-[11.5px] ${picked?.employeeNo === c.employeeNo ? 'text-white/70' : 'text-ink-400'}`}>
                {c.position ?? c.employeeNo}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-center gap-2.5">
          {Array.from({ length: PANJANG_PIN }, (_, i) => (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${
              i < pin.length ? 'bg-navy-700 border-navy-700' : 'border-line'}`} />
          ))}
        </div>
        <p className={`mt-2 h-5 text-center text-[13px] ${error ? 'text-brick-500' : 'text-ink-400'}`}>
          {error || (picked ? `PIN 6 angka untuk ${picked.name}` : 'Pilih kasir dulu')}
        </p>

        <div className="mt-3 grid grid-cols-3 gap-2 max-w-[320px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((d) => (
            <button key={d} onClick={() => press(d)} disabled={!picked}
              className="key key-num disabled:opacity-40">{d}</button>
          ))}
        </div>

        <button onClick={() => void submit()} disabled={!picked || pin.length !== PANJANG_PIN || busy}
          className="key key-leaf w-full mt-5 py-4 text-[16px] disabled:opacity-40">
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </div>
    </div>
  );
}

function NameFallback({ onSignedIn }: { onSignedIn: () => void }) {
  const [name, setName] = useState(store.cashier());
  return (
    <div className="h-full grid place-items-center p-6">
      <div className="tile w-full max-w-[460px] p-8">
        <h1 className="text-[22px] font-bold text-navy-800">Masuk Kasir</h1>
        <p className="mt-1 text-[13px] text-ink-400">
          Daftar kasir belum tersinkron. Masukkan nama dulu; PIN aktif setelah kasir terhubung ke pusat.
        </p>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kasir"
          className="mt-5 w-full h-14 px-4 rounded-xl border border-line text-[16px] outline-none focus:border-navy-200"
        />
        <button
          onClick={() => { store.setCashier(name.trim()); onSignedIn(); }}
          disabled={!name.trim()}
          className="key key-leaf w-full mt-5 py-4 text-[16px] disabled:opacity-40">
          Masuk
        </button>
      </div>
    </div>
  );
}
