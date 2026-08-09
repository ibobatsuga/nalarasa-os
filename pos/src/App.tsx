import { useEffect, useState } from 'react';
import { Login } from './screens/Login';
import { OpenShift } from './screens/OpenShift';
import { Register } from './screens/Register';
import { Orders } from './screens/Orders';
import { CloseShift } from './screens/CloseShift';
import { FALLBACK_MENU } from './data/menu';
import { bootstrap, startSync } from './lib/sync';
import { store, type CatalogItem } from './lib/store';

type Screen = 'login' | 'open' | 'register' | 'orders' | 'close';

const firstScreen = (): Screen => {
  if (!store.cashier()) return 'login';
  const s = store.session();
  return !s || s.closedAt ? 'open' : 'register';
};

export default function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen);
  const [tenantId, setTenantId] = useState(() => localStorage.getItem('pos.tenantId') ?? '');
  const [catalog, setCatalog] = useState<CatalogItem[]>(() => {
    const cached = store.catalog();
    return cached.length ? cached : FALLBACK_MENU;
  });

  useEffect(() => startSync(), []);

  // Refresh menu, cashier list and tenant id whenever possible; the till keeps
  // selling from cache when the network is down.
  //
  // Diulang tiap 20 detik selama berjualan: kalau dapur mematikan sebuah menu,
  // kasir harus berhenti menjualnya dalam hitungan detik — bukan menunggu
  // kasir kebetulan berpindah layar.
  useEffect(() => {
    const tarik = () => void bootstrap(store.siteCode()).then((b) => {
      setCatalog(b.catalog.length ? b.catalog : FALLBACK_MENU);
      if (b.tenantId) { setTenantId(b.tenantId); localStorage.setItem('pos.tenantId', b.tenantId); }
    });
    tarik();
    if (screen !== 'register') return;
    const t = setInterval(tarik, 20_000);
    return () => clearInterval(t);
  }, [screen]);

  if (screen === 'login') {
    return <Login onSignedIn={() => setScreen(firstScreen())} />;
  }
  if (screen === 'open') return <OpenShift onOpened={() => setScreen('register')} />;
  if (screen === 'orders') return <Orders onBack={() => setScreen('register')} />;
  if (screen === 'close') {
    return <CloseShift onBack={() => setScreen('register')} onClosed={() => { store.signOut(); setScreen('login'); }} />;
  }
  return (
    <Register
      catalog={catalog}
      onOrders={() => setScreen('orders')}
      onCloseShift={() => setScreen('close')}
    />
  );
}
