import { Pill, type ListSpec, type Row, type Tone } from '../components/ListView';
import { rupiah } from '../api';

/** Table cells show the full amount; only metric tiles use the compact form. */
const money = (k: string) => (r: Row) => rupiah(Number(r[k] ?? 0));
const pill = (k: string, tones: Record<string, Tone>) => (r: Row) =>
  <Pill label={String(r[k] ?? '—')} tone={tones[String(r[k])] ?? 'neutral'} />;

const DOC: Record<string, Tone> = {
  Draft: 'neutral', Diajukan: 'info', Disetujui: 'good', Dieksekusi: 'good',
  Dibatalkan: 'bad', Dibalik: 'bad', Ditolak: 'bad', Tertunda: 'warn',
};
const BAND: Record<string, Tone> = { T0: 'neutral', T1: 'info', T2: 'good', T3: 'warn', T4: 'bad' };

/**
 * Module screens. Each menu key maps to a list definition; the generic ListView
 * renders it. Rows are demo data until the matching API endpoint lands — the
 * shape is already the API shape, so wiring is a swap, not a rewrite.
 */
export const MODULES: Record<string, ListSpec> = {

  // ── Point of Sale ──────────────────────────────────────────────────────────
  'pos.session': {
    createLabel: 'Buka Sesi',
    filters: ['Dibuka', 'Ditutup', 'Menunggu Persetujuan'],
    metrics: [
      { label: 'Sesi aktif', value: '2' },
      { label: 'Kas diharapkan', value: rupiah(4_850_000, true) },
      { label: 'Selisih hari ini', value: '−' + rupiah(12_000, true), tone: 'warn' },
      { label: 'Sesi belum disetujui', value: '1', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Sesi', mono: true },
      { key: 'site', label: 'Outlet', strong: true },
      { key: 'cashier', label: 'Kasir' },
      { key: 'opened', label: 'Dibuka' },
      { key: 'expected', label: 'Kas sistem', align: 'right', render: money('expected') },
      { key: 'counted', label: 'Kas dihitung', align: 'right', render: money('counted') },
      { key: 'variance', label: 'Selisih', align: 'right', render: (r) => {
        const v = Number(r.variance ?? 0);
        return <span className={v === 0 ? 'text-ink-400' : v < 0 ? 'text-brick-500' : 'text-leaf-600'}>
          {v > 0 ? '+' : ''}{rupiah(v)}
        </span>;
      } },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', { Dibuka: 'info', Ditutup: 'good', 'Menunggu Persetujuan': 'warn' }) },
    ],
    rows: [
      { docNo: 'POS-202608-000212', site: 'RESTO-01', cashier: 'Tono', opened: 'Hari ini 07:00', expected: 2_940_000, counted: 2_928_000, variance: -12_000, band: 'T0', status: 'Menunggu Persetujuan' },
      { docNo: 'POS-202608-000211', site: 'RESTO-02', cashier: 'Rina', opened: 'Hari ini 08:00', expected: 1_910_000, counted: 1_910_000, variance: 0, band: 'T0', status: 'Dibuka' },
      { docNo: 'POS-202608-000208', site: 'RESTO-01', cashier: 'Tono', opened: 'Kemarin 07:00', expected: 3_420_000, counted: 3_420_000, variance: 0, band: 'T0', status: 'Ditutup' },
      { docNo: 'POS-202608-000207', site: 'RESTO-02', cashier: 'Dewi', opened: 'Kemarin 08:00', expected: 2_105_000, counted: 1_925_000, variance: -180_000, band: 'T2', status: 'Ditutup' },
    ],
  },

  'pos.orders': {
    createLabel: 'Order Baru',
    filters: ['Dine-in', 'Takeaway', 'Delivery'],
    metrics: [
      { label: 'Order hari ini', value: '187' },
      { label: 'Rata-rata per struk', value: rupiah(78_400) },
      { label: 'Penjualan hari ini', value: rupiah(14_660_000, true), tone: 'good' },
      { label: 'Void / retur', value: '3', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Struk', mono: true },
      { key: 'time', label: 'Jam' },
      { key: 'site', label: 'Outlet' },
      { key: 'channel', label: 'Kanal', render: pill('channel', { 'Dine-in': 'info', Takeaway: 'neutral', Delivery: 'good' }) },
      { key: 'items', label: 'Item', align: 'right' },
      { key: 'tender', label: 'Pembayaran' },
      { key: 'total', label: 'Total', align: 'right', render: money('total') },
    ],
    rows: [
      { docNo: 'POS-000212-0087', time: '19:42', site: 'RESTO-01', channel: 'Dine-in', items: 6, tender: 'QRIS', total: 284_000 },
      { docNo: 'POS-000212-0086', time: '19:38', site: 'RESTO-01', channel: 'Takeaway', items: 2, tender: 'Tunai', total: 78_000 },
      { docNo: 'POS-000211-0054', time: '19:31', site: 'RESTO-02', channel: 'Delivery', items: 4, tender: 'GoFood', total: 165_000 },
      { docNo: 'POS-000212-0085', time: '19:20', site: 'RESTO-01', channel: 'Dine-in', items: 9, tender: 'Kartu Debit', total: 431_000 },
      { docNo: 'POS-000211-0053', time: '19:12', site: 'RESTO-02', channel: 'Dine-in', items: 3, tender: 'QRIS', total: 122_000 },
    ],
  },

  'pos.payments': {
    filters: ['Cocok', 'Selisih', 'Belum settle'],
    metrics: [
      { label: 'Diterima gateway', value: rupiah(38_400_000, true) },
      { label: 'Biaya gateway', value: rupiah(268_800, true) },
      { label: 'Belum settle', value: rupiah(4_120_000, true), tone: 'warn' },
      { label: 'Selisih', value: '2 baris', tone: 'bad' },
    ],
    columns: [
      { key: 'ref', label: 'Referensi', mono: true },
      { key: 'gateway', label: 'Gateway', strong: true },
      { key: 'date', label: 'Tanggal' },
      { key: 'gross', label: 'Bruto', align: 'right', render: money('gross') },
      { key: 'fee', label: 'Biaya', align: 'right', render: money('fee') },
      { key: 'net', label: 'Neto', align: 'right', render: money('net') },
      { key: 'status', label: 'Rekonsiliasi', render: pill('status', { Cocok: 'good', Selisih: 'bad', 'Belum settle': 'warn' }) },
    ],
    rows: [
      { ref: 'QRIS-20260806-114', gateway: 'QRIS BI', date: '6 Agu', gross: 12_480_000, fee: 87_360, net: 12_392_640, status: 'Cocok' },
      { ref: 'GOPAY-20260806-77', gateway: 'GoPay', date: '6 Agu', gross: 6_210_000, fee: 62_100, net: 6_147_900, status: 'Cocok' },
      { ref: 'GOFOOD-20260805-31', gateway: 'GoFood', date: '5 Agu', gross: 4_120_000, fee: 824_000, net: 3_296_000, status: 'Belum settle' },
      { ref: 'BCA-EDC-20260805-09', gateway: 'BCA EDC', date: '5 Agu', gross: 9_340_000, fee: 140_100, net: 9_199_900, status: 'Selisih' },
    ],
  },

  'pos.reports': {
    filters: ['Harian', 'Mingguan'],
    columns: [
      { key: 'date', label: 'Tanggal', strong: true },
      { key: 'site', label: 'Outlet' },
      { key: 'orders', label: 'Struk', align: 'right' },
      { key: 'avg', label: 'Rata-rata', align: 'right', render: money('avg') },
      { key: 'gross', label: 'Penjualan', align: 'right', render: money('gross') },
      { key: 'discount', label: 'Diskon', align: 'right', render: money('discount') },
      { key: 'void', label: 'Void', align: 'right' },
    ],
    rows: [
      { date: '6 Agu 2026', site: 'RESTO-01', orders: 118, avg: 82_100, gross: 9_688_000, discount: 412_000, void: 2 },
      { date: '6 Agu 2026', site: 'RESTO-02', orders: 69, avg: 72_060, gross: 4_972_000, discount: 188_000, void: 1 },
      { date: '5 Agu 2026', site: 'RESTO-01', orders: 131, avg: 79_800, gross: 10_453_800, discount: 520_000, void: 0 },
      { date: '5 Agu 2026', site: 'RESTO-02', orders: 74, avg: 70_400, gross: 5_209_600, discount: 143_000, void: 3 },
    ],
  },

  // ── Penjualan ──────────────────────────────────────────────────────────────
  'sales.orders': {
    createLabel: 'Order Penjualan',
    filters: ['Draft', 'Diajukan', 'Disetujui', 'Dieksekusi'],
    metrics: [
      { label: 'Order bulan ini', value: '48' },
      { label: 'Nilai order', value: rupiah(212_400_000, true) },
      { label: 'Menunggu persetujuan', value: '3', tone: 'warn' },
      { label: 'OTIF (K04)', value: '94,2%', tone: 'good' },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'customer', label: 'Pelanggan', strong: true },
      { key: 'promised', label: 'Janji kirim' },
      { key: 'margin', label: 'Margin', align: 'right' },
      { key: 'total', label: 'Total', align: 'right', render: money('total') },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'SO-202608-000141', customer: 'PT Sinar Kreatif (katering)', promised: '9 Agu', margin: '38,2%', total: 24_800_000, band: 'T2', status: 'Diajukan' },
      { docNo: 'SO-202608-000140', customer: 'Hotel Emerald — Banquet', promised: '8 Agu', margin: '41,0%', total: 18_200_000, band: 'T1', status: 'Disetujui' },
      { docNo: 'SO-202608-000139', customer: 'Komunitas Lari Jogja', promised: '7 Agu', margin: '29,4%', total: 6_400_000, band: 'T3', status: 'Diajukan' },
      { docNo: 'SO-202608-000138', customer: 'PT Sinar Kreatif (katering)', promised: '5 Agu', margin: '39,8%', total: 12_950_000, band: 'T1', status: 'Dieksekusi' },
    ],
  },

  'sales.customers': {
    createLabel: 'Pelanggan',
    filters: ['Aktif', 'Draft', 'Diblokir'],
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'type', label: 'Tipe' },
      { key: 'term', label: 'Termin' },
      { key: 'limit', label: 'Limit kredit', align: 'right', render: money('limit') },
      { key: 'ar', label: 'Piutang', align: 'right', render: money('ar') },
      { key: 'status', label: 'Status', render: pill('status', { Aktif: 'good', Draft: 'neutral', Diblokir: 'bad' }) },
    ],
    rows: [
      { code: 'CUS-0011', name: 'PT Sinar Kreatif', type: 'Korporat', term: 'Net 30', limit: 50_000_000, ar: 24_800_000, status: 'Aktif' },
      { code: 'CUS-0009', name: 'Hotel Emerald — Banquet', type: 'Grup', term: 'Net 14', limit: 40_000_000, ar: 18_200_000, status: 'Aktif' },
      { code: 'CUS-0021', name: 'Komunitas Lari Jogja', type: 'Komunitas', term: 'Tunai', limit: 0, ar: 0, status: 'Draft' },
      { code: 'CUS-0004', name: 'CV Rasa Nusantara', type: 'Reseller', term: 'Net 30', limit: 25_000_000, ar: 27_400_000, status: 'Diblokir' },
    ],
  },

  'sales.pricing': {
    createLabel: 'Aturan Harga',
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Aturan', strong: true },
      { key: 'scope', label: 'Berlaku untuk' },
      { key: 'disc', label: 'Diskon', align: 'right' },
      { key: 'band', label: 'Band wajib', render: pill('band', BAND) },
      { key: 'valid', label: 'Masa berlaku' },
    ],
    rows: [
      { code: 'PR-001', name: 'Happy Hour 15.00–17.00', scope: 'Minuman', disc: '15%', band: 'T2', valid: 's/d 31 Des 2026' },
      { code: 'PR-002', name: 'Paket Katering ≥ 50 pax', scope: 'Katering', disc: '10%', band: 'T1', valid: 's/d 31 Des 2026' },
      { code: 'PR-003', name: 'Karyawan internal', scope: 'Semua menu', disc: '25%', band: 'T2', valid: 'Permanen' },
      { code: 'PR-004', name: 'Clearance mendekati kedaluwarsa', scope: 'Bahan baku', disc: '40%', band: 'T4', valid: 'Kasuistis' },
    ],
  },

  // ── Inventaris ─────────────────────────────────────────────────────────────
  'inv.products': {
    createLabel: 'Produk',
    filters: ['Menu', 'Bahan Baku', 'Setengah Jadi'],
    metrics: [
      { label: 'Total produk', value: '284' },
      { label: 'Menu aktif', value: '96' },
      { label: 'Bahan baku', value: '171' },
      { label: 'Belum ada resep', value: '7', tone: 'warn' },
    ],
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'kind', label: 'Jenis', render: pill('kind', { Menu: 'info', 'Bahan Baku': 'neutral', 'Setengah Jadi': 'good' }) },
      { key: 'uom', label: 'Satuan' },
      { key: 'cost', label: 'HPP', align: 'right', render: money('cost') },
      { key: 'price', label: 'Harga jual', align: 'right', render: money('price') },
      { key: 'margin', label: 'Margin', align: 'right' },
    ],
    rows: [
      { code: 'MENU-NASI', name: 'Nasi Goreng Spesial', kind: 'Menu', uom: 'Porsi', cost: 17_400, price: 45_000, margin: '61,3%' },
      { code: 'MENU-AYAM', name: 'Ayam Bakar Madu', kind: 'Menu', uom: 'Porsi', cost: 26_100, price: 65_000, margin: '59,8%' },
      { code: 'WIP-BUMBU', name: 'Bumbu Dasar Merah', kind: 'Setengah Jadi', uom: 'Kg', cost: 38_000, price: 0, margin: '—' },
      { code: 'BAHAN-BERAS', name: 'Beras Premium 5kg', kind: 'Bahan Baku', uom: 'Sak', cost: 72_000, price: 0, margin: '—' },
      { code: 'BAHAN-AYAM', name: 'Ayam Broiler Segar', kind: 'Bahan Baku', uom: 'Kg', cost: 34_500, price: 0, margin: '—' },
    ],
  },

  'inv.recipes': {
    createLabel: 'Resep',
    metrics: [
      { label: 'Resep terdaftar', value: '89' },
      { label: 'HPP rata-rata', value: '34,8% dari harga' },
      { label: 'Resep di atas target HPP', value: '6', tone: 'warn' },
      { label: 'Belum diverifikasi koki', value: '4', tone: 'warn' },
    ],
    columns: [
      { key: 'menu', label: 'Menu', strong: true },
      { key: 'yield', label: 'Hasil' },
      { key: 'items', label: 'Bahan', align: 'right' },
      { key: 'cost', label: 'HPP/porsi', align: 'right', render: money('cost') },
      { key: 'target', label: 'Target HPP', align: 'right' },
      { key: 'actual', label: 'HPP aktual', align: 'right' },
      { key: 'status', label: 'Status', render: pill('status', { Terverifikasi: 'good', Draft: 'neutral', 'Perlu revisi': 'warn' }) },
    ],
    rows: [
      { menu: 'Nasi Goreng Spesial', yield: '1 porsi', items: 11, cost: 17_400, target: '35%', actual: '38,7%', status: 'Perlu revisi' },
      { menu: 'Ayam Bakar Madu', yield: '1 porsi', items: 9, cost: 26_100, target: '40%', actual: '40,2%', status: 'Terverifikasi' },
      { menu: 'Bumbu Dasar Merah', yield: '5 kg', items: 7, cost: 190_000, target: '—', actual: '—', status: 'Terverifikasi' },
      { menu: 'Es Teh Manis', yield: '1 gelas', items: 3, cost: 2_100, target: '20%', actual: '14,0%', status: 'Terverifikasi' },
    ],
  },

  'inv.stock': {
    filters: ['Aman', 'Menipis', 'Habis'],
    metrics: [
      { label: 'Nilai persediaan', value: rupiah(84_200_000, true) },
      { label: 'SKU menipis', value: '9', tone: 'warn' },
      { label: 'SKU habis', value: '2', tone: 'bad' },
      { label: 'Mendekati kedaluwarsa', value: '5', tone: 'warn' },
    ],
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Bahan', strong: true },
      { key: 'site', label: 'Lokasi' },
      { key: 'qty', label: 'Stok', align: 'right' },
      { key: 'min', label: 'Minimum', align: 'right' },
      { key: 'value', label: 'Nilai', align: 'right', render: money('value') },
      { key: 'expiry', label: 'Kedaluwarsa terdekat' },
      { key: 'status', label: 'Status', render: pill('status', { Aman: 'good', Menipis: 'warn', Habis: 'bad' }) },
    ],
    rows: [
      { code: 'BAHAN-BERAS', name: 'Beras Premium 5kg', site: 'Gudang Pusat', qty: '42 sak', min: '20 sak', value: 3_024_000, expiry: '12 Des 2026', status: 'Aman' },
      { code: 'BAHAN-AYAM', name: 'Ayam Broiler Segar', site: 'RESTO-01', qty: '8 kg', min: '15 kg', value: 276_000, expiry: '8 Agu 2026', status: 'Menipis' },
      { code: 'BAHAN-CABE', name: 'Cabai Merah Keriting', site: 'RESTO-01', qty: '0 kg', min: '5 kg', value: 0, expiry: '—', status: 'Habis' },
      { code: 'WIP-BUMBU', name: 'Bumbu Dasar Merah', site: 'RESTO-01', qty: '3,2 kg', min: '2 kg', value: 121_600, expiry: '9 Agu 2026', status: 'Aman' },
    ],
  },

  'inv.receipts': {
    createLabel: 'Penerimaan',
    filters: ['Draft', 'Diajukan', 'Disetujui', 'Dieksekusi'],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'po', label: 'PO', mono: true },
      { key: 'vendor', label: 'Vendor', strong: true },
      { key: 'site', label: 'Lokasi' },
      { key: 'received', label: 'Diterima' },
      { key: 'match', label: '3-way match', render: pill('match', { Cocok: 'good', 'Selisih qty': 'warn', 'Selisih harga': 'warn', 'Tanpa PO': 'bad' }) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'GR-202608-000144', po: 'PO-202608-000091', vendor: 'Sayur Segar Jaya', site: 'RESTO-01', received: 'Hari ini 06:12', match: 'Cocok', status: 'Dieksekusi' },
      { docNo: 'GR-202608-000143', po: 'PO-202608-000090', vendor: 'CV Ayam Makmur', site: 'RESTO-01', received: 'Hari ini 05:48', match: 'Selisih qty', status: 'Diajukan' },
      { docNo: 'GR-202608-000142', po: 'PO-202608-000088', vendor: 'Toko Beras Sentosa', site: 'Gudang Pusat', received: 'Kemarin 14:20', match: 'Cocok', status: 'Dieksekusi' },
      { docNo: 'GR-202608-000141', po: '—', vendor: 'Pasar Beringharjo', site: 'RESTO-02', received: 'Kemarin 06:05', match: 'Tanpa PO', status: 'Diajukan' },
    ],
  },

  'inv.count': {
    createLabel: 'Opname',
    filters: ['Draft', 'Diajukan', 'Disetujui'],
    metrics: [
      { label: 'Akurasi opname (K19)', value: '98,6%', tone: 'good' },
      { label: 'Waste bulan ini', value: rupiah(3_120_000, true), tone: 'warn' },
      { label: 'Susut vs penjualan', value: '1,8%' },
      { label: 'Penyesuaian menunggu', value: '2', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'site', label: 'Lokasi' },
      { key: 'date', label: 'Tanggal' },
      { key: 'kind', label: 'Jenis', render: pill('kind', { Opname: 'info', Waste: 'warn', Susut: 'warn' }) },
      { key: 'items', label: 'Item', align: 'right' },
      { key: 'value', label: 'Nilai selisih', align: 'right', render: money('value') },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'ADJ-202608-000031', site: 'RESTO-01', date: '5 Agu', kind: 'Waste', items: 6, value: 840_000, band: 'T1', status: 'Diajukan' },
      { docNo: 'ADJ-202608-000030', site: 'RESTO-02', date: '4 Agu', kind: 'Opname', items: 42, value: 210_000, band: 'T0', status: 'Disetujui' },
      { docNo: 'ADJ-202608-000029', site: 'RESTO-01', date: '1 Agu', kind: 'Susut', items: 3, value: 1_640_000, band: 'T2', status: 'Diajukan' },
    ],
  },

  // ── Pembelian ──────────────────────────────────────────────────────────────
  'pur.requisitions': {
    createLabel: 'Permintaan',
    filters: ['Draft', 'Diajukan', 'Disetujui'],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'requester', label: 'Pemohon', strong: true },
      { key: 'site', label: 'Untuk' },
      { key: 'urgency', label: 'Urgensi', render: pill('urgency', { Normal: 'neutral', Darurat: 'bad' }) },
      { key: 'total', label: 'Perkiraan', align: 'right', render: money('total') },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'PR-202608-000067', requester: 'Chef Bagas', site: 'RESTO-01', urgency: 'Darurat', total: 2_400_000, band: 'T2', status: 'Diajukan' },
      { docNo: 'PR-202608-000066', requester: 'Lia — Gudang', site: 'Gudang Pusat', urgency: 'Normal', total: 8_600_000, band: 'T2', status: 'Disetujui' },
      { docNo: 'PR-202608-000065', requester: 'Rina — RESTO-02', site: 'RESTO-02', urgency: 'Normal', total: 940_000, band: 'T0', status: 'Disetujui' },
    ],
  },

  'pur.orders': {
    createLabel: 'Purchase Order',
    filters: ['Draft', 'Diajukan', 'Disetujui', 'Dieksekusi'],
    metrics: [
      { label: 'PO bulan ini', value: '34' },
      { label: 'Nilai komitmen', value: rupiah(96_400_000, true) },
      { label: 'Vendor baru', value: '2', tone: 'warn' },
      { label: 'Menunggu persetujuan', value: '4', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'vendor', label: 'Vendor', strong: true },
      { key: 'class', label: 'Kelas', render: pill('class', { Standar: 'neutral', Baru: 'warn', 'Sumber tunggal': 'warn', Dibatasi: 'bad' }) },
      { key: 'promised', label: 'Janji kirim' },
      { key: 'total', label: 'Nilai', align: 'right', render: money('total') },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'PO-202608-000092', vendor: 'Kopi Arabika Temanggung', class: 'Baru', promised: '10 Agu', total: 14_800_000, band: 'T2', status: 'Diajukan' },
      { docNo: 'PO-202608-000091', vendor: 'Sayur Segar Jaya', class: 'Standar', promised: '6 Agu', total: 3_240_000, band: 'T1', status: 'Dieksekusi' },
      { docNo: 'PO-202608-000090', vendor: 'CV Ayam Makmur', class: 'Standar', promised: '6 Agu', total: 6_900_000, band: 'T1', status: 'Dieksekusi' },
      { docNo: 'PO-202608-000089', vendor: 'Gas Elpiji Mandiri', class: 'Sumber tunggal', promised: '8 Agu', total: 2_100_000, band: 'T3', status: 'Diajukan' },
    ],
  },

  'pur.bills': {
    createLabel: 'Tagihan',
    filters: ['Cocok', 'Selisih qty', 'Selisih harga', 'Tanpa penerimaan'],
    metrics: [
      { label: '3-way match lolos (K17)', value: '91,4%', tone: 'good' },
      { label: 'Tagihan tertahan', value: '3', tone: 'warn' },
      { label: 'Jatuh tempo 7 hari', value: rupiah(18_600_000, true) },
      { label: 'Duplikat terdeteksi', value: '1', tone: 'bad' },
    ],
    columns: [
      { key: 'docNo', label: 'No. Vendor', mono: true },
      { key: 'vendor', label: 'Vendor', strong: true },
      { key: 'billDate', label: 'Tanggal' },
      { key: 'due', label: 'Jatuh tempo' },
      { key: 'total', label: 'Nilai', align: 'right', render: money('total') },
      { key: 'match', label: 'Match', render: pill('match', { Cocok: 'good', 'Selisih qty': 'warn', 'Selisih harga': 'warn', 'Tanpa penerimaan': 'bad', Duplikat: 'bad' }) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'INV/SSJ/2608/0442', vendor: 'Sayur Segar Jaya', billDate: '6 Agu', due: '5 Sep', total: 3_240_000, match: 'Cocok', status: 'Disetujui' },
      { docNo: 'AM-2026-0811', vendor: 'CV Ayam Makmur', billDate: '6 Agu', due: '20 Agu', total: 7_180_000, match: 'Selisih harga', status: 'Diajukan' },
      { docNo: 'BRS/0806/12', vendor: 'Toko Beras Sentosa', billDate: '5 Agu', due: '4 Sep', total: 5_040_000, match: 'Cocok', status: 'Dieksekusi' },
      { docNo: 'AM-2026-0811', vendor: 'CV Ayam Makmur', billDate: '6 Agu', due: '20 Agu', total: 7_180_000, match: 'Duplikat', status: 'Ditolak' },
    ],
  },

  'pur.vendors': {
    createLabel: 'Vendor',
    filters: ['Aktif', 'Draft', 'Diblokir'],
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'category', label: 'Kategori' },
      { key: 'term', label: 'Termin' },
      { key: 'otif', label: 'OTIF', align: 'right' },
      { key: 'bank', label: 'Rekening', mono: true },
      { key: 'status', label: 'Status', render: pill('status', { Aktif: 'good', Draft: 'neutral', Diblokir: 'bad' }) },
    ],
    rows: [
      { code: 'VEN-0031', name: 'Sayur Segar Jaya', category: 'Sayur & buah', term: 'Net 30', otif: '96%', bank: '••••4821', status: 'Aktif' },
      { code: 'VEN-0018', name: 'CV Ayam Makmur', category: 'Protein', term: 'Net 14', otif: '88%', bank: '••••7734', status: 'Aktif' },
      { code: 'VEN-0044', name: 'Kopi Arabika Temanggung', category: 'Minuman', term: 'Tunai', otif: '—', bank: '—', status: 'Draft' },
      { code: 'VEN-0007', name: 'Sumber Minyak Jaya', category: 'Sembako', term: 'Net 30', otif: '61%', bank: '••••1190', status: 'Diblokir' },
    ],
  },

  // ── Akuntansi ──────────────────────────────────────────────────────────────
  'acc.invoices': {
    createLabel: 'Faktur',
    filters: ['Belum jatuh tempo', 'Jatuh tempo', 'Lunas'],
    metrics: [
      { label: 'Total piutang', value: rupiah(70_400_000, true) },
      { label: 'Jatuh tempo', value: rupiah(27_400_000, true), tone: 'bad' },
      { label: 'DSO (K37)', value: '31,4 hari' },
      { label: 'Rasio menunggak', value: '38,9%', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'customer', label: 'Pelanggan', strong: true },
      { key: 'issued', label: 'Terbit' },
      { key: 'due', label: 'Jatuh tempo' },
      { key: 'total', label: 'Nilai', align: 'right', render: money('total') },
      { key: 'paid', label: 'Terbayar', align: 'right', render: money('paid') },
      { key: 'age', label: 'Umur' },
      { key: 'status', label: 'Status', render: pill('status', { Lunas: 'good', 'Belum jatuh tempo': 'info', 'Jatuh tempo': 'bad' }) },
    ],
    rows: [
      { docNo: 'INV-202608-000212', customer: 'PT Sinar Kreatif', issued: '1 Agu', due: '31 Agu', total: 24_800_000, paid: 0, age: '5 hari', status: 'Belum jatuh tempo' },
      { docNo: 'INV-202607-000198', customer: 'CV Rasa Nusantara', issued: '2 Jul', due: '1 Agu', total: 27_400_000, paid: 0, age: '35 hari', status: 'Jatuh tempo' },
      { docNo: 'INV-202608-000210', customer: 'Hotel Emerald — Banquet', issued: '3 Agu', due: '17 Agu', total: 18_200_000, paid: 0, age: '3 hari', status: 'Belum jatuh tempo' },
      { docNo: 'INV-202607-000185', customer: 'PT Sinar Kreatif', issued: '20 Jun', due: '20 Jul', total: 12_950_000, paid: 12_950_000, age: '—', status: 'Lunas' },
    ],
  },

  'acc.payments': {
    createLabel: 'Batch Pembayaran',
    filters: ['Draft', 'Diajukan', 'Disetujui', 'Dieksekusi'],
    metrics: [
      { label: 'Menunggu rilis', value: rupiah(15_400_000, true), tone: 'warn' },
      { label: 'Dirilis bulan ini', value: rupiah(64_200_000, true) },
      { label: 'DPO (K40)', value: '27,8 hari' },
      { label: 'Belum direkonsiliasi', value: '1', tone: 'warn' },
    ],
    columns: [
      { key: 'docNo', label: 'Batch', mono: true },
      { key: 'items', label: 'Tagihan', align: 'right' },
      { key: 'total', label: 'Nilai', align: 'right', render: money('total') },
      { key: 'preparer', label: 'Disiapkan' },
      { key: 'approver', label: 'Disetujui' },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'PAY-202608-000024', items: 6, total: 15_400_000, preparer: 'Adi', approver: '— menunggu', band: 'T3', status: 'Diajukan' },
      { docNo: 'PAY-202608-000023', items: 4, total: 28_900_000, preparer: 'Adi', approver: 'Wulan + Bagus', band: 'T4', status: 'Dieksekusi' },
      { docNo: 'PAY-202608-000022', items: 9, total: 35_300_000, preparer: 'Adi', approver: 'Wulan', band: 'T3', status: 'Dieksekusi' },
    ],
  },

  'acc.journals': {
    createLabel: 'Jurnal Manual',
    filters: ['Draft', 'Diajukan', 'Dieksekusi', 'Dibalik'],
    metrics: [
      { label: 'Rasio jurnal manual (K43)', value: '6,2%', tone: 'good' },
      { label: 'Menunggu persetujuan', value: '2', tone: 'warn' },
      { label: 'Jurnal subledger', value: '1.482' },
      { label: 'Pembalikan bulan ini', value: '3' },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'date', label: 'Tanggal posting' },
      { key: 'memo', label: 'Keterangan', strong: true },
      { key: 'source', label: 'Sumber', render: pill('source', { Manual: 'warn', Subledger: 'neutral' }) },
      { key: 'amount', label: 'Nilai', align: 'right', render: money('amount') },
      { key: 'band', label: 'Band', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', DOC) },
    ],
    rows: [
      { docNo: 'JV-202608-000318', date: '5 Agu', memo: 'Akrual listrik Juli', source: 'Manual', amount: 4_200_000, band: 'T2', status: 'Diajukan' },
      { docNo: 'JV-202608-000317', date: '5 Agu', memo: 'Koreksi PPN masukan', source: 'Manual', amount: 1_840_000, band: 'T3', status: 'Diajukan' },
      { docNo: 'JV-202608-000316', date: '4 Agu', memo: 'Penjualan POS RESTO-01', source: 'Subledger', amount: 9_688_000, band: 'T0', status: 'Dieksekusi' },
      { docNo: 'JV-202608-000290', date: '1 Agu', memo: 'Pembalikan akrual Juni', source: 'Subledger', amount: 3_100_000, band: 'T0', status: 'Dibalik' },
    ],
  },

  'acc.bank': {
    filters: ['Cocok', 'Belum cocok'],
    metrics: [
      { label: 'Baris rekening koran', value: '148' },
      { label: 'Cocok otomatis', value: '141', tone: 'good' },
      { label: 'Belum cocok', value: '7', tone: 'warn' },
      { label: 'Selisih', value: rupiah(1_240_000, true), tone: 'warn' },
    ],
    columns: [
      { key: 'ref', label: 'Referensi bank', mono: true },
      { key: 'date', label: 'Tanggal valuta' },
      { key: 'desc', label: 'Keterangan', strong: true },
      { key: 'amount', label: 'Nilai', align: 'right', render: money('amount') },
      { key: 'matched', label: 'Dicocokkan ke' },
      { key: 'status', label: 'Status', render: pill('status', { Cocok: 'good', 'Belum cocok': 'warn' }) },
    ],
    rows: [
      { ref: 'BCA-20260806-0091', date: '6 Agu', desc: 'TRSF E-BANKING CR', amount: 24_800_000, matched: 'INV-202608-000212', status: 'Cocok' },
      { ref: 'BCA-20260805-0088', date: '5 Agu', desc: 'PMT BATCH PAY-000023', amount: -28_900_000, matched: 'PAY-202608-000023', status: 'Cocok' },
      { ref: 'BCA-20260805-0087', date: '5 Agu', desc: 'BIAYA ADM', amount: -35_000, matched: '—', status: 'Belum cocok' },
      { ref: 'BCA-20260804-0080', date: '4 Agu', desc: 'SETORAN TUNAI OUTLET', amount: 4_120_000, matched: '—', status: 'Belum cocok' },
    ],
  },

  'acc.tax': {
    filters: ['PPN', 'PPh 21', 'PPh 23'],
    metrics: [
      { label: 'PPN keluaran', value: rupiah(19_206_000, true) },
      { label: 'PPN masukan', value: rupiah(8_940_000, true) },
      { label: 'Kurang bayar', value: rupiah(10_266_000, true), tone: 'warn' },
      { label: 'Faktur belum diunggah', value: '4', tone: 'bad' },
    ],
    columns: [
      { key: 'period', label: 'Masa', strong: true },
      { key: 'type', label: 'Jenis', render: pill('type', { PPN: 'info', 'PPh 21': 'neutral', 'PPh 23': 'neutral' }) },
      { key: 'base', label: 'DPP', align: 'right', render: money('base') },
      { key: 'tax', label: 'Pajak', align: 'right', render: money('tax') },
      { key: 'due', label: 'Batas lapor' },
      { key: 'status', label: 'Status', render: pill('status', { Dilaporkan: 'good', Disiapkan: 'info', Terlambat: 'bad' }) },
    ],
    rows: [
      { period: 'Juli 2026', type: 'PPN', base: 174_600_000, tax: 19_206_000, due: '30 Agu 2026', status: 'Disiapkan' },
      { period: 'Juli 2026', type: 'PPh 21', base: 92_400_000, tax: 3_180_000, due: '20 Agu 2026', status: 'Disiapkan' },
      { period: 'Juni 2026', type: 'PPN', base: 155_900_000, tax: 17_149_000, due: '31 Jul 2026', status: 'Dilaporkan' },
      { period: 'Juni 2026', type: 'PPh 23', base: 12_000_000, tax: 240_000, due: '20 Jul 2026', status: 'Terlambat' },
    ],
  },

  'acc.close': {
    metrics: [
      { label: 'Durasi tutup buku (K41)', value: '4,2 hari', tone: 'good' },
      { label: 'Rekonsiliasi tepat waktu', value: '92%', tone: 'good' },
      { label: 'Periode terkunci', value: '7' },
      { label: 'Reopen tahun ini', value: '1', tone: 'warn' },
    ],
    columns: [
      { key: 'period', label: 'Periode', strong: true },
      { key: 'closedAt', label: 'Dikunci' },
      { key: 'by', label: 'Oleh' },
      { key: 'journals', label: 'Jurnal', align: 'right' },
      { key: 'unposted', label: 'Belum posting', align: 'right' },
      { key: 'status', label: 'Status', render: pill('status', { Terkunci: 'good', Terbuka: 'info', 'Soft close': 'warn', 'Dibuka kembali': 'bad' }) },
    ],
    rows: [
      { period: 'Agustus 2026', closedAt: '—', by: '—', journals: 318, unposted: 2, status: 'Terbuka' },
      { period: 'Juli 2026', closedAt: '5 Agu 2026', by: 'Maya — Controller', journals: 1_482, unposted: 0, status: 'Terkunci' },
      { period: 'Juni 2026', closedAt: '4 Jul 2026', by: 'Maya — Controller', journals: 1_390, unposted: 0, status: 'Terkunci' },
      { period: 'Mei 2026', closedAt: '3 Jun 2026', by: 'Maya — Controller', journals: 1_301, unposted: 0, status: 'Dibuka kembali' },
    ],
  },

  // ── Karyawan (HRIS) ────────────────────────────────────────────────────────
  'hr.employees': {
    createLabel: 'Karyawan',
    filters: ['Aktif', 'Percobaan', 'Cuti', 'Keluar'],
    metrics: [
      { label: 'Karyawan aktif', value: '36' },
      { label: 'Masa percobaan', value: '4', tone: 'warn' },
      { label: 'Turnover 12 bulan', value: '18,4%', tone: 'warn' },
      { label: 'Kontrak habis 30 hari', value: '3', tone: 'bad' },
    ],
    columns: [
      { key: 'no', label: 'NIK', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'position', label: 'Posisi' },
      { key: 'site', label: 'Penempatan' },
      { key: 'hired', label: 'Bergabung' },
      { key: 'contract', label: 'Kontrak', render: pill('contract', { PKWTT: 'good', PKWT: 'info', Harian: 'neutral', Magang: 'neutral' }) },
      { key: 'status', label: 'Status', render: pill('status', { Aktif: 'good', Percobaan: 'warn', Cuti: 'info', Keluar: 'bad' }) },
    ],
    rows: [
      { no: 'EMP-0012', name: 'Tono Prasetyo', position: 'Kasir', site: 'RESTO-01', hired: '12 Jan 2025', contract: 'PKWTT', status: 'Aktif' },
      { no: 'EMP-0034', name: 'Rina Kusuma', position: 'Kasir', site: 'RESTO-02', hired: '3 Mar 2026', contract: 'PKWT', status: 'Aktif' },
      { no: 'EMP-0041', name: 'Bagas Nugroho', position: 'Chef de Partie', site: 'RESTO-01', hired: '1 Jul 2026', contract: 'PKWT', status: 'Percobaan' },
      { no: 'EMP-0027', name: 'Sari Wulandari', position: 'Waitress', site: 'RESTO-01', hired: '18 Sep 2025', contract: 'PKWT', status: 'Cuti' },
      { no: 'EMP-0009', name: 'Dewi Anggraini', position: 'Supervisor Outlet', site: 'RESTO-02', hired: '5 Feb 2024', contract: 'PKWTT', status: 'Aktif' },
    ],
  },

  'hr.contracts': {
    createLabel: 'Kontrak',
    filters: ['Aktif', 'Akan habis', 'Berakhir'],
    columns: [
      { key: 'employee', label: 'Karyawan', strong: true },
      { key: 'type', label: 'Jenis', render: pill('type', { PKWTT: 'good', PKWT: 'info', Harian: 'neutral', Magang: 'neutral' }) },
      { key: 'starts', label: 'Mulai' },
      { key: 'ends', label: 'Berakhir' },
      { key: 'salary', label: 'Gaji pokok', align: 'right', render: money('salary') },
      { key: 'allowance', label: 'Tunjangan', align: 'right', render: money('allowance') },
      { key: 'status', label: 'Status', render: pill('status', { Aktif: 'good', 'Akan habis': 'warn', Berakhir: 'bad' }) },
    ],
    rows: [
      { employee: 'Rina Kusuma', type: 'PKWT', starts: '3 Mar 2026', ends: '2 Sep 2026', salary: 3_200_000, allowance: 750_000, status: 'Akan habis' },
      { employee: 'Bagas Nugroho', type: 'PKWT', starts: '1 Jul 2026', ends: '30 Jun 2027', salary: 5_400_000, allowance: 1_100_000, status: 'Aktif' },
      { employee: 'Tono Prasetyo', type: 'PKWTT', starts: '12 Jan 2025', ends: '—', salary: 3_800_000, allowance: 900_000, status: 'Aktif' },
      { employee: 'Sari Wulandari', type: 'PKWT', starts: '18 Sep 2025', ends: '17 Sep 2026', salary: 2_900_000, allowance: 650_000, status: 'Aktif' },
    ],
  },

  'hr.attendance': {
    filters: ['Tepat waktu', 'Terlambat', 'Tidak absen'],
    metrics: [
      { label: 'Hadir hari ini', value: '31 / 36' },
      { label: 'Terlambat', value: '4', tone: 'warn' },
      { label: 'Lembur minggu ini', value: '38 jam' },
      { label: 'Absen di luar geofence', value: '1', tone: 'bad' },
    ],
    columns: [
      { key: 'employee', label: 'Karyawan', strong: true },
      { key: 'site', label: 'Outlet' },
      { key: 'shift', label: 'Shift' },
      { key: 'in', label: 'Masuk' },
      { key: 'out', label: 'Keluar' },
      { key: 'late', label: 'Terlambat', align: 'right' },
      { key: 'ot', label: 'Lembur', align: 'right' },
      { key: 'status', label: 'Status', render: pill('status', { 'Tepat waktu': 'good', Terlambat: 'warn', 'Di luar lokasi': 'bad', 'Tidak absen': 'bad' }) },
    ],
    rows: [
      { employee: 'Tono Prasetyo', site: 'RESTO-01', shift: 'Pagi 07:00–15:00', in: '06:52', out: '15:14', late: '—', ot: '14 mnt', status: 'Tepat waktu' },
      { employee: 'Rina Kusuma', site: 'RESTO-02', shift: 'Pagi 08:00–16:00', in: '08:18', out: '16:02', late: '18 mnt', ot: '—', status: 'Terlambat' },
      { employee: 'Bagas Nugroho', site: 'RESTO-01', shift: 'Sore 14:00–22:00', in: '13:55', out: '—', late: '—', ot: '—', status: 'Tepat waktu' },
      { employee: 'Dewi Anggraini', site: 'RESTO-02', shift: 'Pagi 08:00–16:00', in: '08:04', out: '16:40', late: '4 mnt', ot: '40 mnt', status: 'Di luar lokasi' },
    ],
  },

  'hr.schedule': {
    createLabel: 'Terbitkan Jadwal',
    filters: ['RESTO-01', 'RESTO-02'],
    metrics: [
      { label: 'Shift minggu ini', value: '126' },
      { label: 'Belum terisi', value: '4', tone: 'bad' },
      { label: 'Permintaan tukar', value: '2', tone: 'warn' },
      { label: 'Rasio tenaga vs target', value: '96%', tone: 'good' },
    ],
    columns: [
      { key: 'date', label: 'Tanggal', strong: true },
      { key: 'site', label: 'Outlet' },
      { key: 'shift', label: 'Shift' },
      { key: 'role', label: 'Peran' },
      { key: 'employee', label: 'Karyawan' },
      { key: 'status', label: 'Status', render: pill('status', { Terbit: 'good', Draft: 'neutral', 'Belum terisi': 'bad', 'Tukar diajukan': 'warn' }) },
    ],
    rows: [
      { date: 'Sen, 10 Agu', site: 'RESTO-01', shift: 'Pagi 07:00–15:00', role: 'Kasir', employee: 'Tono Prasetyo', status: 'Terbit' },
      { date: 'Sen, 10 Agu', site: 'RESTO-01', shift: 'Sore 14:00–22:00', role: 'Waiter', employee: '— belum terisi', status: 'Belum terisi' },
      { date: 'Sel, 11 Agu', site: 'RESTO-02', shift: 'Pagi 08:00–16:00', role: 'Kasir', employee: 'Rina Kusuma', status: 'Tukar diajukan' },
      { date: 'Sel, 11 Agu', site: 'RESTO-01', shift: 'Pagi 07:00–15:00', role: 'Kitchen', employee: 'Bagas Nugroho', status: 'Terbit' },
    ],
  },

  'hr.leave': {
    createLabel: 'Ajukan Cuti',
    filters: ['Diajukan', 'Disetujui', 'Ditolak'],
    metrics: [
      { label: 'Menunggu persetujuan', value: '3', tone: 'warn' },
      { label: 'Sedang cuti', value: '2' },
      { label: 'Rata-rata sisa kuota', value: '7,4 hari' },
      { label: 'Tingkat absensi (K49)', value: '3,1%' },
    ],
    columns: [
      { key: 'employee', label: 'Karyawan', strong: true },
      { key: 'type', label: 'Jenis' },
      { key: 'starts', label: 'Mulai' },
      { key: 'ends', label: 'Selesai' },
      { key: 'days', label: 'Hari', align: 'right' },
      { key: 'balance', label: 'Sisa kuota', align: 'right' },
      { key: 'status', label: 'Status', render: pill('status', { Diajukan: 'warn', Disetujui: 'good', Ditolak: 'bad' }) },
    ],
    rows: [
      { employee: 'Sari Wulandari', type: 'Cuti tahunan', starts: '5 Agu', ends: '7 Agu', days: 3, balance: '9 hari', status: 'Disetujui' },
      { employee: 'Rina Kusuma', type: 'Sakit', starts: '8 Agu', ends: '8 Agu', days: 1, balance: '11 hari', status: 'Diajukan' },
      { employee: 'Tono Prasetyo', type: 'Izin', starts: '12 Agu', ends: '12 Agu', days: 1, balance: '6 hari', status: 'Diajukan' },
      { employee: 'Dewi Anggraini', type: 'Cuti tahunan', starts: '18 Agu', ends: '22 Agu', days: 5, balance: '2 hari', status: 'Diajukan' },
    ],
  },

  'hr.payroll': {
    createLabel: 'Jalankan Payroll',
    filters: ['Draft', 'Diajukan', 'Dibayar'],
    metrics: [
      { label: 'Gaji kotor Juli', value: rupiah(92_400_000, true) },
      { label: 'Gaji bersih', value: rupiah(84_120_000, true) },
      { label: 'Akurasi payroll (K47)', value: '99,1%', tone: 'good' },
      { label: 'BPJS + PPh 21', value: rupiah(8_280_000, true) },
    ],
    columns: [
      { key: 'docNo', label: 'Nomor', mono: true },
      { key: 'period', label: 'Periode', strong: true },
      { key: 'headcount', label: 'Karyawan', align: 'right' },
      { key: 'gross', label: 'Gaji kotor', align: 'right', render: money('gross') },
      { key: 'net', label: 'Gaji bersih', align: 'right', render: money('net') },
      { key: 'runBy', label: 'Dijalankan' },
      { key: 'approver', label: 'Disetujui' },
      { key: 'status', label: 'Status', render: pill('status', { Draft: 'neutral', Diajukan: 'warn', Dibayar: 'good' }) },
    ],
    rows: [
      { docNo: 'PRL-202608-000008', period: 'Agustus 2026', headcount: 36, gross: 94_100_000, net: 85_640_000, runBy: 'Intan', approver: '— menunggu', status: 'Diajukan' },
      { docNo: 'PRL-202607-000007', period: 'Juli 2026', headcount: 35, gross: 92_400_000, net: 84_120_000, runBy: 'Intan', approver: 'Yusuf + Bagus', status: 'Dibayar' },
      { docNo: 'PRL-202606-000006', period: 'Juni 2026', headcount: 34, gross: 89_800_000, net: 81_760_000, runBy: 'Intan', approver: 'Yusuf + Bagus', status: 'Dibayar' },
    ],
  },

  'hr.recruitment': {
    createLabel: 'Lowongan',
    filters: ['Dibuka', 'Seleksi', 'Ditutup'],
    columns: [
      { key: 'position', label: 'Posisi', strong: true },
      { key: 'site', label: 'Penempatan' },
      { key: 'need', label: 'Kebutuhan', align: 'right' },
      { key: 'applicants', label: 'Pelamar', align: 'right' },
      { key: 'stage', label: 'Tahap' },
      { key: 'ttf', label: 'Waktu isi (K45)', align: 'right' },
      { key: 'status', label: 'Status', render: pill('status', { Dibuka: 'info', Seleksi: 'warn', Ditutup: 'good' }) },
    ],
    rows: [
      { position: 'Waiter', site: 'RESTO-01', need: 2, applicants: 24, stage: 'Wawancara', ttf: '18 hari', status: 'Seleksi' },
      { position: 'Kasir', site: 'RESTO-02', need: 1, applicants: 11, stage: 'Seleksi berkas', ttf: '—', status: 'Dibuka' },
      { position: 'Cook Helper', site: 'RESTO-01', need: 1, applicants: 8, stage: 'Selesai', ttf: '24 hari', status: 'Ditutup' },
    ],
  },

  'hr.appraisal': {
    createLabel: 'Siklus Penilaian',
    columns: [
      { key: 'employee', label: 'Karyawan', strong: true },
      { key: 'position', label: 'Posisi' },
      { key: 'period', label: 'Periode' },
      { key: 'score', label: 'Nilai', align: 'right' },
      { key: 'reviewer', label: 'Penilai' },
      { key: 'status', label: 'Status', render: pill('status', { Selesai: 'good', Berjalan: 'warn', Draft: 'neutral' }) },
    ],
    rows: [
      { employee: 'Tono Prasetyo', position: 'Kasir', period: 'H1 2026', score: '4,2 / 5', reviewer: 'Dewi Anggraini', status: 'Selesai' },
      { employee: 'Sari Wulandari', position: 'Waitress', period: 'H1 2026', score: '3,8 / 5', reviewer: 'Dewi Anggraini', status: 'Selesai' },
      { employee: 'Bagas Nugroho', position: 'Chef de Partie', period: 'Percobaan', score: '—', reviewer: 'Chef Utama', status: 'Berjalan' },
    ],
  },

  // ── Laporan ────────────────────────────────────────────────────────────────
  'rep.finance': {
    filters: ['Bulanan', 'Kumulatif'],
    columns: [
      { key: 'account', label: 'Akun', strong: true },
      { key: 'code', label: 'Kode', mono: true },
      { key: 'jul', label: 'Juli', align: 'right', render: money('jul') },
      { key: 'aug', label: 'Agustus', align: 'right', render: money('aug') },
      { key: 'delta', label: 'Perubahan', align: 'right' },
    ],
    rows: [
      { account: 'Pendapatan', code: '4-1000', jul: 155_900_000, aug: 174_600_000, delta: '+12,0%' },
      { account: 'Harga pokok penjualan', code: '5-1000', jul: -57_000_000, aug: -60_800_000, delta: '+6,7%' },
      { account: 'Beban gaji', code: '5-2000', jul: -92_400_000, aug: -94_100_000, delta: '+1,8%' },
      { account: 'Beban operasional', code: '5-3000', jul: -18_200_000, aug: -19_400_000, delta: '+6,6%' },
      { account: 'Laba bersih', code: '—', jul: -11_700_000, aug: 300_000, delta: 'membaik' },
    ],
  },

  'rep.sales': {
    filters: ['Per menu', 'Per outlet', 'Per kanal'],
    columns: [
      { key: 'item', label: 'Menu', strong: true },
      { key: 'qty', label: 'Terjual', align: 'right' },
      { key: 'revenue', label: 'Pendapatan', align: 'right', render: money('revenue') },
      { key: 'cost', label: 'HPP', align: 'right', render: money('cost') },
      { key: 'margin', label: 'Margin', align: 'right' },
      { key: 'rank', label: 'Peringkat' },
    ],
    rows: [
      { item: 'Nasi Goreng Spesial', qty: 1_284, revenue: 57_780_000, cost: 22_341_600, margin: '61,3%', rank: '#1' },
      { item: 'Ayam Bakar Madu', qty: 812, revenue: 52_780_000, cost: 21_193_200, margin: '59,8%', rank: '#2' },
      { item: 'Es Teh Manis', qty: 2_140, revenue: 16_050_000, cost: 4_494_000, margin: '72,0%', rank: '#3' },
      { item: 'Sate Ayam', qty: 466, revenue: 20_970_000, cost: 9_436_500, margin: '55,0%', rank: '#4' },
    ],
  },

  // ── Pengaturan ─────────────────────────────────────────────────────────────
  'set.users': {
    createLabel: 'Pengguna',
    filters: ['Aktif', 'Nonaktif'],
    metrics: [
      { label: 'Pengguna aktif', value: '20 / 25' },
      { label: 'Peran istimewa', value: '2', tone: 'warn' },
      { label: 'Belum ganti password', value: '5', tone: 'warn' },
      { label: 'Resertifikasi jatuh tempo', value: '0', tone: 'good' },
    ],
    columns: [
      { key: 'subject', label: 'Login', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'department', label: 'Departemen' },
      { key: 'roles', label: 'Peran' },
      { key: 'band', label: 'Band maks', render: pill('band', BAND) },
      { key: 'status', label: 'Status', render: pill('status', { Aktif: 'good', Nonaktif: 'bad' }) },
    ],
    rows: [
      { subject: 'u.cfo', name: 'Bagus — CFO', department: 'Keuangan', roles: 'R36', band: 'T4', status: 'Aktif' },
      { subject: 'u.controller', name: 'Maya — Controller', department: 'Keuangan', roles: 'R33', band: 'T3', status: 'Aktif' },
      { subject: 'u.cashier', name: 'Tono — Kasir', department: 'Outlet', roles: 'R12', band: 'T0', status: 'Aktif' },
      { subject: 'u.treasprep', name: 'Adi — Penyiap Kas', department: 'Treasury', roles: 'R34', band: 'T0', status: 'Aktif' },
      { subject: 'u.iam', name: 'Galih — Admin IAM', department: 'IT', roles: 'R47', band: 'T2', status: 'Aktif' },
    ],
  },

  'set.outlets': {
    createLabel: 'Outlet',
    columns: [
      { key: 'code', label: 'Kode', mono: true },
      { key: 'name', label: 'Nama', strong: true },
      { key: 'hours', label: 'Jam operasional' },
      { key: 'factor', label: 'Faktor kalibrasi', align: 'right' },
      { key: 'posLimit', label: 'Batas selisih kas T0', align: 'right', render: money('posLimit') },
      { key: 'pos', label: 'POS', render: pill('pos', { Ya: 'good', Tidak: 'neutral' }) },
    ],
    rows: [
      { code: 'RESTO-01', name: 'Main Restaurant', hours: '06:00–23:00', factor: '×1,0', posLimit: 25_000, pos: 'Ya' },
      { code: 'RESTO-02', name: 'Second Outlet', hours: '07:00–22:00', factor: '×0,6', posLimit: 15_000, pos: 'Ya' },
      { code: 'HO', name: 'Kantor Pusat', hours: '08:00–18:00', factor: '×1,0', posLimit: 0, pos: 'Tidak' },
    ],
  },
};

export const hasModule = (key: string): boolean => key in MODULES;
