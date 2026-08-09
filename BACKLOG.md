# Nalarasa OS — Backlog

Utang teknis dan pekerjaan tertunda. Setiap baris punya alasan kenapa ditunda,
supaya keputusannya bisa ditinjau ulang, bukan sekadar dilupakan.

Status: `TERTUNDA` · `BERJALAN` · `SELESAI`
Terakhir diperbarui: 7 Agustus 2026

**Baca [PRODUCT.md](PRODUCT.md) lebih dulu.** Prioritas di bawah disusun untuk
pasar UMKM/cafe/resto, bukan untuk hotel atau perusahaan berdepartemen.

---

## A. Aplikasi terpisah yang masih perlu dibuat

Dashboard utama tidak bisa diakses karyawan non-manajerial. Setiap peran
operasional butuh aplikasinya sendiri: layar kecil, alur pendek, satu tugas.

| # | Aplikasi | Peran pemakai | Kenapa berdiri sendiri | Prioritas | Status |
|---|---|---|---|---|---|
| A1 | **Kasir (POS)** | Kasir | Layar penuh, sentuh, offline-first | — | **SELESAI** — `pos/` |
| A2 | **Print agent** | perangkat kasir | Browser tidak bisa bicara USB/ESC-POS | Tinggi | TERTUNDA |
| A3 | **Dapur (KDS + menu + stok)** | Juru masak, kepala dapur | Dapur panas dan basah; tanpa keyboard, tanpa login berulang | — | **SELESAI** — `kitchen/` |
| A4 | **Waiter** | Pramusaji — termasuk yang dipasok Nalarasa | Order diambil di meja. Ini justru lini bisnis Nalarasa | Tinggi | TERTUNDA |
| A5 | **Karyawan (ESS)** | Semua karyawan | Pengguna terbanyak. Absensi, shift, cuti, slip gaji | — | **SELESAI** — `ess/` |
| A6 | **Keuangan (Finance)** | Admin keuangan, pemilik, akuntan luar | Alur pembukuan harian: struk → transaksi → buku → laporan → pajak. Terlalu dalam untuk jadi menu dashboard | Tinggi | **BERJALAN** — `finance/` |
| A7 | **Customer Display** | pelanggan, layar kedua | Pelanggan lihat rincian saat kasir mengetik. Murah, besar efeknya | Sedang | TERTUNDA |
| A8 | **Nalarasa Field Ops** | Supervisor Nalarasa | Milik Nalarasa, bukan klien. Verifikasi staf tertempat, checklist standar bintang 4 | Sedang | TERTUNDA |
| A9 | **Konsol Platform** | Cipta Insan sendiri | Provisioning tenant, langganan, tagihan, dukungan | Sedang | TERTUNDA |
| A10 | **QR Menu / Self-order** | pelanggan | Menekan antrean jam sibuk | Rendah | TERTUNDA |
| A11 | **Teknisi / Work Order** | Teknisi | Kebutuhan hotel, bukan cafe. Naik hanya kalau menyasar segmen hotel | Rendah | TERTUNDA |
| A12 | **Manajemen Outlet** | Supervisor, kepala outlet | Reservasi, denah meja, acara, menu engineering | — | **SELESAI** — `manage/` |

### Yang sengaja TIDAK dijadikan aplikasi terpisah

Menambah aplikasi berarti menambah ikon di HP karyawan, satu login lagi, satu
antrean offline lagi. Untuk usaha 8 orang itu beban, bukan fitur.

| Dulu didaftar | Keputusan | Alasan |
|---|---|---|
| Gudang & Terima Barang | **Gabung ke ESS (A5)** | Di cafe, yang menerima sayur jam 6 pagi adalah siapa pun yang piket. Bukan peran tetap. Cukup satu menu di aplikasi karyawan |
| Aplikasi Pemilik (mobile) | **Batal — pemilik memakai dashboard** | Dashboard Nalarasa OS memang dibuat untuk pemilik. Menambah aplikasi kedua untuk orang yang sama itu mubazir |
| Persetujuan mobile | **Bagian dari dashboard** | Yang menyetujui di cafe adalah pemilik, dan pemilik memakai dashboard |
| Training standar layanan | **Gabung ke ESS (A5)** | SOP dan materi Nalarasa muncul di aplikasi yang sudah dibuka karyawan tiap hari |
| Wizard onboarding | **Bagian dari dashboard** | Sekali pakai per tenant. Tidak layak jadi aplikasi |

### Catatan per aplikasi

**A2 — Print agent.** Program kecil di komputer kasir. Buka port lokal,
teruskan byte ESC/POS ke printer, pulsakan laci uang. Kontrak sudah ditetapkan
dan dipakai POS: `POST /print {raw}` dan `GET /health`. Perkiraan 100–150 baris
Node atau Go, plus installer Windows. Butuh merek printer target dulu.

**A3 — Dapur.** Tiga tab: antrean tiket, menu & daftar 86, prep & stok.
Ruang lingkupnya melebar dari sekadar layar antrean karena dapurlah pemilik sah
jawaban "menu ini masih ada atau tidak" — daftar 86 ada di sini dan mendorong ke
POS, bukan sebaliknya.

**A4 — Waiter.** HP di saku pramusaji. Pilih meja, ambil pesanan, kirim ke
dapur dan kasir sekaligus. Catatan per item. Split bill. Tanpa ini, standar
layanan bintang 4 tidak terkejar — dan ini justru lini bisnis Nalarasa.

**A5 — Karyawan (ESS).** Paling banyak penggunanya. Absen dengan geofence
(skema `Attendance` sudah menyimpan koordinat), lihat jadwal shift, tukar
shift, ajukan cuti, unduh slip gaji. Ini yang membuat HRIS hidup; tanpa ini
absensi tetap manual.

**A6 — Keuangan.** Pembukuan harian punya alur sendiri yang panjang: foto struk
belanja pasar → transaksi → buku kas → jurnal → laporan → pajak. Dipakai satu
admin (atau pemilik, atau akuntan luar) berjam-jam, bukan diintip sebentar.
Terlalu dalam untuk dijejalkan jadi menu di dashboard. Mengambil bentuk dari
SIPGN Helper, disesuaikan untuk UMKM: PPh final 0,5% bukan SPT badan, nota pasar
bukan e-Faktur, setoran tunai harian dari POS. Tersambung ke POS (penjualan dan
setoran masuk otomatis) dan ke dashboard (jurnal, persetujuan, KPI).

**A8 — Nalarasa Field Ops.** Bukan untuk klien — untuk supervisor Nalarasa yang
berkeliling ke outlet klien. Verifikasi kehadiran staf yang ditempatkan,
checklist standar layanan bintang 4, foto kondisi, catatan keluhan klien.
Inilah yang membuat klaim "standar bintang 4" bisa dibuktikan, bukan sekadar
dijanjikan. Butuh kontrak lintas tenant (E3) supaya supervisor Nalarasa hanya
melihat outlet yang memang kliennya.

**A7 — Customer Display.** Layar kedua dari komputer kasir. Menampilkan
keranjang berjalan dan total. Murah dibuat, besar efeknya pada kepercayaan.

**A11 — Teknisi / Work Order (Engineering).** Departemen Engineering hotel
tidak duduk di meja. Aplikasi HP: terima work order, foto kondisi sebelum dan
sesudah, checklist preventive maintenance, catat sparepart terpakai, catat
downtime alat. Mengisi K32 (kepatuhan PM), K33 (MTBF), K34 (MTTR), K35
(downtime tak terencana). Bergantung pada C11 — modul maintenance-nya sendiri
belum ada di server.

**A10 — Konsol Platform.** Bukan untuk klien. Untuk Cipta Insan mengelola
tenant, paket, diskon mitra Nalarasa, penangguhan, dan dukungan.
Endpoint `/platform/*` sudah ada; UI-nya belum.

---

## A-bis. Departemen yang CUKUP memakai dashboard

Tidak semua departemen butuh aplikasi sendiri. Yang bekerja di meja dengan
laptop justru paling terlayani oleh dashboard — asal menunya disaring per peran
(lihat D4) dan layarnya bisa diisi, bukan hanya dibaca (D2, D3).

| Departemen | Peran | Perlu aplikasi sendiri? | Yang sebenarnya dibutuhkan |
|---|---|---|---|
| **Akunting** | R29 AR, R30 Penagihan, R31 AP, R32 Akuntan, R33 Controller, R34/R35 Treasury, R36 CFO | **Tidak** | Workspace per peran di dashboard + form isian. AP hanya melihat Pembelian & Akuntansi; tidak melihat Payroll |
| **HRD** | R39 Rekruter, R40 HR Officer, R41 Penyiap Payroll, R42 Penyetuju Payroll | **Tidak** | Modul HR di dashboard. Sisi karyawannya dilayani ESS (A5) |
| **Engineering** | R27 Teknisi, R28 Manajer Maintenance | Tidak untuk pasar sasaran | Cafe tidak punya departemen teknik. Perawatan alat cukup checklist di ESS. A11 hanya untuk segmen hotel |
| **Manajemen** | R01, R02, R03, R10, R17, R33, R36 | Tidak, tapi | Dashboard + Persetujuan mobile (A7) untuk keputusan di luar meja |

Catatan penting soal "non-manajerial". Staf akunting dan HRD memang bukan
manajer, tapi mereka pekerja meja — dashboard adalah tempat yang benar untuk
mereka. Masalahnya bukan siapa yang boleh membuka dashboard, melainkan **apa
yang mereka lihat setelah masuk**. Backend sudah menolak aksi di luar
kewenangan; menunya yang belum disaring. Itu D4, dan prioritasnya naik.

Yang benar-benar tidak cocok dengan dashboard adalah pekerja lapangan dan
shift: kasir, pramusaji, juru masak, gudang, teknisi. Mereka yang butuh
aplikasi sendiri.

---

## B. Fitur POS yang tertunda

| # | Item | Alasan ditunda | Status |
|---|---|---|---|
| B1 | Print agent lokal (lihat A2) | Perlu merek printer target | TERTUNDA |
| B2 | Split bill dan pindah meja | Menunggu aplikasi waiter (A4) | TERTUNDA |
| B3 | Diskon per transaksi di kasir | Perlu rute persetujuan AR06 di layar kasir | TERTUNDA |
| B4 | Cetak ulang struk dari pusat | Perlu POS order detail di dashboard | TERTUNDA |
| B5 | Multi-shift dalam satu hari | Skema sudah mendukung; UI belum | TERTUNDA |
| B6 | Barcode di master produk | Kolom `barcode` belum ada di `Product` | TERTUNDA |

---

## B-quater. Aplikasi Karyawan (ESS) yang tertunda

| # | Item | Catatan | Status |
|---|---|---|---|
| BE1 | Antrean absen offline | Kerangkanya ada (`kirimAntrean`), belum diuji dengan sinyal benar-benar putus | BERJALAN |
| BE2 | Tukar shift antar karyawan | Perlu persetujuan dua pihak plus supervisor | TERTUNDA |
| BE3 | Foto struk belanja dari HP | Mengisi antrean OCR di aplikasi Keuangan (BK2) | TERTUNDA |
| BE4 | Terima barang dari HP | Gudang digabung ke ESS, belum dibuat | TERTUNDA |
| BE5 | SOP & materi pelatihan | Standar layanan Nalarasa muncul di aplikasi yang sudah dibuka tiap hari | TERTUNDA |
| BE6 | Notifikasi | Cuti disetujui, jadwal terbit, kontrak akan habis | TERTUNDA |
| BE7 | Login karyawan | Kini memakai sesi bersama; perlu login sendiri per karyawan | TERTUNDA |

---

## B-ter. Aplikasi Dapur & Manajemen Outlet yang tertunda

| # | Item | Catatan | Status |
|---|---|---|---|
| BD1 | Antrean realtime | **SELESAI sebagian** — dapur menarik tiket tiap 10 detik dari `GET /kitchen/tickets`. Websocket belum; polling sudah cukup untuk satu outlet | BERJALAN |
| BD2 | Daftar 86 mendorong ke POS | **SELESAI** — dapur menulis ke `POST /kitchen/menu/availability`, kasir menariknya tiap 20 detik dan mengunci tombolnya | SELESAI |
| BD5 | Server tiruan dev | `tools/dev-stub.mjs` menjawab kontrak yang sama tanpa Postgres. Harus ikut berubah kalau kontrak berubah | SELESAI |
| BD6 | Dialog cetak memblokir kasir | **SELESAI** — `window.print()` tidak lagi otomatis saat bayar; hanya saat kasir menekan Cetak | SELESAI |
| BD3 | Antrean offline dapur | Sama seperti POS: dapur tidak boleh berhenti saat internet putus | TERTUNDA |
| BD4 | Prep menambah stok setengah jadi | Hasil prep belum masuk ke stok, sehingga HPP belum akurat | TERTUNDA |
| BM1 | Reservasi mengunci meja | Sudah terlihat di denah, tapi belum tersimpan di server | TERTUNDA |
| BM2 | Acara mengunci area | Deteksi bentrok sudah jalan; penguncian denah belum | TERTUNDA |
| BM3 | Menu engineering dari data asli | Angka terjual harus dari POS, HPP dari resep. Kini masih contoh | TERTUNDA |
| BM4 | Pengingat reservasi | WhatsApp H-1 untuk menekan angka tidak-datang | TERTUNDA |

---

## B-bis. Aplikasi Keuangan yang tertunda

| # | Item | Catatan | Status |
|---|---|---|---|
| BK1 | Sambungkan ke API | Sepuluh layar masih memakai data contoh. Bentuk barisnya sudah bentuk API | TERTUNDA |
| BK2 | Pembacaan struk (OCR) | Antrean dan layar koreksi sudah jadi; mesin pembacanya belum. SIPGN Helper memakai Gemini | TERTUNDA |
| BK3 | Ekspor Excel dan PDF | Tombol ada, berkasnya belum | TERTUNDA |
| BK4 | Unggah rekening koran | Pencocokan otomatis baris bank dengan setoran POS | TERTUNDA |
| BK5 | Buat transaksi dari layar pajak | Tombol setoran pajak belum menulis jurnal | TERTUNDA |
| BK6 | Saldo awal tersimpan | Form ada, penyimpanannya belum | TERTUNDA |

---

## C. Backend dan data

| # | Item | Catatan | Status |
|---|---|---|---|
| C1 | **Postgres belum pernah dijalankan** | `docker-compose.yml` siap; `db:push` dan `db:seed` belum dieksekusi | TERTUNDA |
| C2 | **Ekspor Odoo belum dijalankan** | Alat siap (`npm run odoo:export`); menunggu URL, nama DB, API key | TERTUNDA |
| C3 | **Profil pemakaian Odoo** | `npm run usage-profile` menentukan modul mana benar-benar dipakai | TERTUNDA |
| C4 | Impor master dari hasil ekspor | Bergantung C2 | TERTUNDA |
| C5 | Row-Level Security Postgres | Isolasi tenant kini di lapisan aplikasi saja; RLS sebagai lapis kedua | TERTUNDA |
| C6 | `tenantId @default("")` → CHECK constraint | Default ada agar tipe create tetap opsional; perlu jaring pengaman di DB | TERTUNDA |
| C7 | Migrasi `$use` → Prisma client extensions | `$use` deprecated di Prisma 5; dipakai karena menjaga tipe generated | TERTUNDA |
| C8 | Stock ledger perpetual | Sampai ada, K03 memakai proxy — sudah dinyatakan di `lineage.components.assumption` | TERTUNDA |
| C9 | Pajak: e-Faktur, e-Bupot, PPh 21 | Sprint 5 | TERTUNDA |
| C10 | KPI K06–K66 sisanya | 13 dari 66 aktif | TERTUNDA |
| C11 | **Modul maintenance belum ada** | Tidak ada skema Asset (MD26), PM Plan (MD27), atau Work Order. K32–K35 belum terdaftar di registry. Blokir untuk A11 | TERTUNDA |
| C12 | Rekrutmen dan penilaian (HRD) | Menu ada, skema belum: lowongan, pelamar, tahapan seleksi, siklus penilaian | TERTUNDA |

---

## D. Dashboard

| # | Item | Catatan | Status |
|---|---|---|---|
| D1 | Halaman login | Sekarang token disimpan manual di localStorage | TERTUNDA |
| D2 | Form isian dan halaman detail | 27 layar masih daftar baca-saja | TERTUNDA |
| D3 | Sambungkan layar ke API | Bentuk baris sudah bentuk API; tinggal tukar sumber | TERTUNDA |
| D6 | Layar mitigasi SoD | `sodPolicy = SMALL_BUSINESS` menuntut mitigasi tertulis; UI-nya belum ada, baru API | TERTUNDA |
| D4 | **Workspace per peran** | Bukan sekadar sembunyikan menu: tiap peran punya halaman awal sendiri. AP Accountant membuka daftar tagihan menunggu, bukan dashboard eksekutif. Prioritas naik — ini yang membuat dashboard layak dipakai staf akunting dan HRD | TERTUNDA |
| D5 | Mode gelap | Belum diminta | TERTUNDA |

---

## E. Komersial

| # | Item | Catatan | Status |
|---|---|---|---|
| E1 | Tarif per outlet dan tagihan langganan | Model harga sudah diputuskan: per outlet | TERTUNDA |
| E2 | Diskon mitra Nalarasa | Perlu penanda partner di `Tenant` | TERTUNDA |
| E3 | Kontrak lintas tenant | Klien hanya lihat pekerja Nalarasa yang terikat kontrak dengannya | TERTUNDA |
| E4 | Onboarding mandiri | `/platform/tenants` sudah ada; alur pendaftaran belum. Target: selesai dalam hitungan menit, tanpa konsultan | TERTUNDA |
| E5 | **Penyetuju kedua dari jarak jauh** | Cafe 8 orang tidak punya dua penyetuju independen untuk band T3–T4. Back office Nalarasa bisa jadi mata kedua — mengubah SoD dari beban jadi barang dagangan | TERTUNDA |
| E6 | Preset peran usaha kecil | 51 peran terlalu banyak untuk 8 orang. Perlu 5–7 paket peran siap pakai dengan mitigasi bawaan yang sudah tertulis | TERTUNDA |

---

## F. Tata kelola

| # | Item | Catatan | Status |
|---|---|---|---|
| F1 | **Tanda tangan kalibrasi T0–T4** | `ANCHOR.approvedBy` masih `null`. Butuh CFO (R36), Risk (R03), Sponsor (R01) | TERTUNDA |
| F2 | Golden transaction test end-to-end | Tes sekarang murni logika kontrol, tanpa database | TERTUNDA |
| F3 | Negative access test | Membuktikan SoD menolak, bukan hanya mendeteksi | TERTUNDA |
| F4 | Runbook backup dan restore | `docker-compose` sudah dump harian; prosedur pulih belum diuji | TERTUNDA |
