import { useCallback, useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { Band, Card, Row, StatCard } from './components/Card';
import { Donut, DualLineChart, type LinePoint, type Slice } from './components/charts';
import {
  IconBadge, IconBox, IconCheck, IconDoc, IconFlask, IconRegister,
  IconShield, IconTruck, IconUserPlus, IconWallet,
} from './components/Icons';
import { ListView } from './components/ListView';
import { MODULES, hasModule } from './modules/registry';
import { api, formatKpi, rupiah, session, type ApprovalRequest, type KpiResult, type SodConflict } from './api';
import { Masuk } from './screens/Masuk';

const monthWindow = () => {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString(),
  };
};

/** Shown when the API is unreachable, so a demo never opens on a blank screen. */
const DEMO = {
  trend: [
    { label: 'Feb', a: 118_000_000, b: 61.2 }, { label: 'Mar', a: 132_500_000, b: 62.0 },
    { label: 'Apr', a: 127_800_000, b: 60.4 }, { label: 'Mei', a: 148_200_000, b: 63.1 },
    { label: 'Jun', a: 161_400_000, b: 64.0 }, { label: 'Jul', a: 155_900_000, b: 63.4 },
    { label: 'Agu', a: 174_600_000, b: 65.2 },
  ] as LinePoint[],
  mix: [
    { label: 'Makanan utama', value: 42 }, { label: 'Minuman', value: 26 },
    { label: 'Snack & dessert', value: 16 }, { label: 'Katering', value: 10 },
    { label: 'Lainnya', value: 6 },
  ] as Slice[],
  activity: [
    { icon: <IconRegister />, title: 'Sesi kasir RESTO-01 ditutup', meta: 'Selisih Rp 12.000 · disetujui T0 · 1 jam lalu' },
    { icon: <IconTruck />, title: 'Penerimaan barang GR-202608-000144', meta: 'Sayur Segar Jaya · 3-way match lolos · 3 jam lalu' },
    { icon: <IconBadge />, title: 'Jadwal shift minggu depan diterbitkan', meta: '18 karyawan · 2 outlet · 5 jam lalu' },
    { icon: <IconFlask />, title: 'Resep Nasi Goreng Spesial diperbarui', meta: 'HPP turun ke Rp 17.400 · kemarin' },
    { icon: <IconUserPlus />, title: 'Karyawan baru masuk', meta: 'Tono — Kasir RESTO-01 · kontrak PKWT 12 bulan · kemarin' },
    { icon: <IconCheck />, title: 'Pengajuan cuti disetujui', meta: 'Sari — 3 hari · sisa kuota 9 hari · kemarin' },
  ],
  outlets: [
    { name: 'RESTO-01 — Main', meta: '412 transaksi', value: 92_400_000 },
    { name: 'RESTO-02 — Second', meta: '287 transaksi', value: 58_100_000 },
    { name: 'Katering korporat', meta: '18 order', value: 21_300_000 },
    { name: 'Kiosk Bandara', meta: '133 transaksi', value: 9_800_000 },
  ],
};

export default function App() {
  const [masuk, setMasuk] = useState(() => session.token !== '');
  const [view, setView] = useState('dashboard');
  const [kpis, setKpis] = useState<KpiResult[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [conflicts, setConflicts] = useState<SodConflict[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const w = monthWindow();
      const [k, a, c] = await Promise.all([
        session.companyId ? api.executive(session.companyId, w.from, w.to) : Promise.resolve([]),
        api.pendingApprovals(),
        api.conflicts().catch(() => [] as SodConflict[]),
      ]);
      setKpis(k); setApprovals(a); setConflicts(c); setOffline(false);
    } catch (e) {
      setOffline(true);
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const kpi = (code: string) => kpis.find((k) => k.code === code);
  const decide = async (r: ApprovalRequest, decision: string) => {
    try {
      await api.decide({
        requestId: r.id, decision, versionHash: r.versionHash,
        reasonCode: decision === 'APPROVE' ? 'WITHIN_POLICY' : 'POLICY_BREACH',
      });
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  if (!masuk) {
    return <Masuk onMasuk={() => { setMasuk(true); window.location.reload(); }} />;
  }

  return (
    <Shell
      active={view}
      onNavigate={setView}
      title={TITLES[view] ?? 'Dashboard'}
      subtitle={SUBTITLES[view]}
      tenant={session.tenant}
      user={session.user}
    >
      {/* Spanduk bergantung pada ADA-TIDAKNYA data, bukan pada koneksi. Server
          yang menjawab dengan nol KPI tetap menghasilkan grafik contoh, dan
          menyembunyikan peringatan hanya karena login berhasil justru membuat
          angka contoh terlihat seperti angka outlet sendiri. */}
      {(offline || kpis.length === 0) && (
        <div className="card px-4 py-2.5 flex items-center gap-2 text-[12.5px] text-ink-500 border-amber-200 bg-orange-50/60">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          {offline
            ? `Mode demo — API tidak terhubung${error ? `: ${error}` : ''}. Angka di bawah contoh.`
            : 'Belum ada KPI tercatat untuk periode ini. Grafik di bawah masih angka contoh.'}
        </div>
      )}

      {view === 'dashboard' && (
        <>
          {/* Delta hanya ditampilkan untuk angka contoh. Menempelkan "+12,4% vs
              bulan lalu" pada KPI yang benar-benar dihitung adalah kebohongan
              kecil yang paling mudah dipercaya: angkanya nyata, trennya karangan.
              Perbandingan periode belum dihitung server, jadi belum ditampilkan. */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Pendapatan bersih" icon={<IconWallet />}
              value={kpi('K01') ? rupiah(kpi('K01')!.numerator ?? 0, true) : rupiah(174_600_000, true)}
              {...(kpi('K01') ? { note: 'periode berjalan' } : { delta: 12.4 })} />
            <StatCard label="Margin kotor" icon={<IconBox />}
              value={kpi('K02') ? formatKpi(kpi('K02')!) : '65,2%'}
              {...(kpi('K02') ? { note: 'periode berjalan' } : { delta: 1.8 })} />
            <StatCard label="Kesehatan kontrol (K05)" icon={<IconShield />}
              value={kpi('K05') ? formatKpi(kpi('K05')!) : '96,0%'}
              {...(kpi('K05') ? { note: 'periode berjalan' } : { delta: 2.1 })} />
            <StatCard label="Konflik SoD terbuka" icon={<IconShield />}
              value={String(conflicts.length)} note={conflicts.length === 0 ? 'K63 = 0 · bersih' : 'perlu mitigasi'} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            {/* DEMO.trend dan DEMO.mix masih deret contoh: server belum punya
                endpoint deret waktu. Kartu KPI di atas sudah nyata, jadi tanpa
                label ini pembaca wajar menyangka grafiknya nyata juga. */}
            <Card title="Pendapatan & margin — contoh"
              action={<select className="h-8 px-2 rounded-lg border border-line bg-white text-[12.5px] text-ink-600">
                <option>7 bulan terakhir</option><option>30 hari terakhir</option>
              </select>}>
              <div className="flex items-center gap-5 mb-2 text-[12px] text-ink-500">
                <Legend color="#17376b" label="Pendapatan" />
                <Legend color="#a3c644" label="Margin kotor (%)" />
              </div>
              <DualLineChart data={DEMO.trend} aName="Pendapatan" bName="Margin" />
            </Card>

            <Card title="Komposisi penjualan — contoh" action={<button className="btn btn-ghost">Lihat semua</button>}>
              <Donut data={DEMO.mix} centerLabel="Agu" />
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
            <Card title="Aktivitas terbaru">
              <ul className="divide-y divide-line">
                {DEMO.activity.map((a) => <Row key={a.title} icon={a.icon} title={a.title} meta={a.meta} />)}
              </ul>
            </Card>

            <Card title="Penjualan per outlet">
              <ul className="divide-y divide-line">
                {DEMO.outlets.map((o) => (
                  <Row key={o.name} icon={<IconRegister />} title={o.name} meta={o.meta} right={rupiah(o.value, true)} />
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {view === 'approvals' && (
        <Card title={`Menunggu keputusan (${approvals.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-400 border-b border-line">
                  <th className="py-2.5 font-semibold">Famili</th>
                  <th className="font-semibold">Band</th>
                  <th className="font-semibold">Objek</th>
                  <th className="font-semibold text-right">Nilai</th>
                  <th className="font-semibold">Kuorum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {approvals.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0 text-[13px]">
                    <td className="py-3 font-mono text-[12px] text-ink-500">{r.familyCode}</td>
                    <td><Band band={r.band} /></td>
                    <td className="text-navy-700">{r.docType}</td>
                    <td className="text-right tabular-nums">{r.amount ? rupiah(Number(r.amount), true) : '—'}</td>
                    <td className="text-ink-400 text-[12px]">{r.decisions.length}/{r.requiredCount}</td>
                    <td className="text-right whitespace-nowrap">
                      <button onClick={() => decide(r, 'APPROVE')} className="btn btn-primary">Setujui</button>
                      <button onClick={() => decide(r, 'REJECT')} className="btn btn-ghost ml-1">Tolak</button>
                    </td>
                  </tr>
                ))}
                {approvals.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-ink-400">Tidak ada yang menunggu keputusanmu</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view === 'sod' && (
        <Card title={`Konflik SoD terbuka (${conflicts.length})`}>
          {conflicts.length === 0 ? (
            <p className="py-10 text-center text-leaf-600 text-[13px]">K63 = 0 · tidak ada konflik terbuka</p>
          ) : (
            <ul className="divide-y divide-line">
              {conflicts.map((c) => (
                <Row key={c.id} icon={<IconShield />} title={`${c.ruleId} — ${c.scope}`}
                  meta={JSON.stringify(c.detail)} right={new Date(c.detectedAt).toLocaleDateString('id-ID')} />
              ))}
            </ul>
          )}
        </Card>
      )}

      {hasModule(view) && <ListView spec={MODULES[view]!} />}

      {!['dashboard', 'approvals', 'sod'].includes(view) && !hasModule(view) && (
        <Card>
          <div className="py-16 text-center">
            <span className="chip mx-auto w-11 h-11"><IconDoc className="w-5 h-5" /></span>
            <p className="mt-3 text-[15px] font-semibold text-navy-700">{TITLES[view]}</p>
            <p className="mt-1 text-[13px] text-ink-400">{ROADMAP[view] ?? 'Masuk sprint berikutnya.'}</p>
          </div>
        </Card>
      )}
    </Shell>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="inline-flex items-center gap-2">
    <span className="w-4 h-[3px] rounded-full" style={{ background: color }} />{label}
  </span>
);

const TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  'pos.session': 'Sesi Kasir', 'pos.orders': 'Order POS',
  'pos.payments': 'Pembayaran & Gateway', 'pos.reports': 'Laporan Kasir',
  'sales.orders': 'Order Penjualan', 'sales.customers': 'Pelanggan', 'sales.pricing': 'Harga & Diskon',
  'inv.products': 'Produk & Menu', 'inv.recipes': 'Resep & HPP', 'inv.stock': 'Stok',
  'inv.receipts': 'Penerimaan', 'inv.count': 'Opname & Waste',
  'pur.requisitions': 'Permintaan Pembelian', 'pur.orders': 'Purchase Order',
  'pur.bills': 'Tagihan Vendor', 'pur.vendors': 'Vendor',
  'acc.invoices': 'Faktur & Piutang', 'acc.payments': 'Pembayaran', 'acc.journals': 'Jurnal',
  'acc.bank': 'Rekonsiliasi Bank', 'acc.tax': 'Pajak', 'acc.close': 'Tutup Buku',
  'hr.employees': 'Data Karyawan', 'hr.contracts': 'Kontrak Kerja', 'hr.attendance': 'Absensi',
  'hr.schedule': 'Jadwal Shift', 'hr.leave': 'Cuti & Izin', 'hr.payroll': 'Payroll',
  'hr.recruitment': 'Rekrutmen', 'hr.appraisal': 'Penilaian',
  'rep.kpi': 'KPI & Lineage', 'rep.finance': 'Laporan Keuangan', 'rep.sales': 'Analisa Penjualan',
  'set.users': 'Pengguna & Peran', approvals: 'Persetujuan', sod: 'Pemisahan Tugas',
  'set.calibration': 'Kalibrasi T0–T4', 'set.outlets': 'Outlet & Perusahaan',
};

const SUBTITLES: Record<string, string> = {
  dashboard: 'Ringkasan bulan berjalan',
  approvals: 'Band T0–T4 · kuorum dan pemisahan tugas berlaku',
  sod: '14 aturan SoD · statik dan runtime',
};

const ROADMAP: Record<string, string> = {
  'pos.session': 'Sprint 2 — buka/tutup sesi, hitung kas, selisih, persetujuan T0–T3.',
  'pos.orders': 'Sprint 2 — layar kasir sentuh, modifier, meja, takeaway.',
  'pos.payments': 'Sprint 2 — tunai, QRIS, kartu, rekonsiliasi gateway.',
  'inv.recipes': 'Sprint 3 — resep per menu, HPP per porsi, backflush otomatis.',
  'inv.stock': 'Sprint 3 — stock ledger, rata-rata bergerak, transfer antar outlet.',
  'inv.count': 'Sprint 3 — opname, waste, susut, persetujuan penyesuaian.',
  'pur.requisitions': 'Sprint 1 — permintaan, anggaran, urgensi, AR09.',
  'pur.orders': 'Sprint 1 — PO, komitmen, AR10, kelas vendor.',
  'pur.bills': 'Sprint 2 — 3-way match, toleransi harga 2%, AR11.',
  'acc.invoices': 'Sprint 4 — faktur, umur piutang, penagihan.',
  'acc.payments': 'Sprint 4 — batch pembayaran, rilis ganda, SOD01/SOD08.',
  'acc.tax': 'Sprint 5 — PPN, e-Faktur, PPh 21/23, e-Bupot.',
  'acc.close': 'Sprint 4 — tutup buku, kunci periode, reopen T4.',
  'hr.employees': 'Sprint 5 — data karyawan, dokumen, struktur organisasi.',
  'hr.contracts': 'Sprint 5 — kontrak PKWT/PKWTT, masa percobaan, pengingat habis.',
  'hr.attendance': 'Sprint 5 — absensi lokasi, keterlambatan, lembur.',
  'hr.schedule': 'Sprint 5 — jadwal shift outlet, tukar shift, kebutuhan tenaga.',
  'hr.leave': 'Sprint 5 — kuota cuti, izin, saldo, persetujuan berjenjang.',
  'hr.payroll': 'Sprint 5 — gaji, tunjangan, BPJS, PPh 21, slip. SOD09 berlaku.',
  'hr.recruitment': 'Sprint 6 — lowongan, pelamar, tahapan seleksi.',
  'hr.appraisal': 'Sprint 6 — penilaian kinerja, KPI karyawan.',
  'rep.kpi': 'Berjalan — K01–K05, K47 aktif; sisanya bertahap.',
  'set.calibration': 'Berjalan — ambang T0–T4 per tenant, berversi.',
};
