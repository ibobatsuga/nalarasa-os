# Nalarasa OS — Definisi Produk

Dokumen ini mengunci **untuk siapa** produk ini dibuat. Setiap keputusan desain
diuji ke sini. Kalau sebuah fitur tidak masuk akal untuk persona di bawah,
fitur itu salah, bukan personanya.

---

## 1. Model bisnis

Nalarasa menjual **SDM terlatih standar bintang 4**. Nalarasa OS dijual
bersamanya, dan bisa dibeli terpisah dengan harga penuh. Klien Nalarasa dapat
diskon.

Nilai gabungannya bukan "staf plus software". Nilainya: **standar layanan yang
dijalankan sistem**. Pramusaji yang ditempatkan minggu lalu tetap bekerja
dengan alur yang sama, karena alurnya ada di aplikasi, bukan di kepala orang.

Itu yang tidak bisa ditiru pesaing yang hanya jual software, atau hanya jual
tenaga kerja.

Harga: **per outlet**, bukan per pengguna. Warung dengan 12 karyawan tidak
dihukum karena punya banyak orang.

---

## 2. Persona sasaran

**Bukan** hotel bintang 4. Bukan perusahaan dengan departemen.

| Atribut | Nilai |
|---|---|
| Jenis usaha | Warung, cafe, restoran, UMKM kuliner |
| Outlet | 1–3 |
| Karyawan | 5–30 |
| Omzet | di bawah Rp 500 juta/bulan (dasar kalibrasi T0–T4) |
| Pembukuan | Pemilik sendiri, atau satu admin, atau akuntan luar |
| IT | Tidak ada |
| Perangkat | 1 komputer kasir, HP milik pribadi karyawan |
| Internet | Sering putus |

Horison Emerald Timoho adalah **tenant pertama dan pilot**, bukan definisi
pasar. Cipta Insan dan Bit Pro adalah entitas grup, bukan pelanggan.

### Konsekuensi yang mengikat

1. **Tidak ada departemen.** Tidak ada Akunting, HRD, atau Engineering sebagai
   unit. Ada pemilik, supervisor, dan staf shift. Modul boleh ada; departemen
   sebagai asumsi tidak boleh.
2. **Satu orang memegang banyak peran.** Ini normal, bukan pelanggaran.
   Lihat bagian 3.
3. **Onboarding hitungan menit.** Pemilik cafe tidak akan menjalani proyek
   implementasi. Kalau butuh konsultan, produknya gagal.
4. **HP dulu, laptop belakangan.** Mayoritas pengguna tidak pernah membuka
   dashboard.
5. **Offline itu keadaan normal**, bukan pengecualian.

---

## 3. Kontrol untuk usaha kecil

Ini keputusan desain terpenting di seluruh produk.

Blueprint Sesi 4 mendefinisikan 14 aturan SoD untuk perusahaan besar. Diterapkan
apa adanya, **produk ini menolak pelanggannya sendiri**:

| Kombinasi nyata | Konflik | Akibat sebelum perbaikan |
|---|---|---|
| Pemilik cafe merangkap pembukuan | SOD02, SOD04, SOD07 | Onboarding gagal |
| Supervisor outlet merangkap terima barang | SOD03 | Onboarding gagal |
| Admin tunggal | SOD02 | Onboarding gagal |

Memisahkan 51 peran ke 8 orang adalah aritmetika, bukan kebijakan. Maka:

**Yang dilonggarkan — tumpang-tindih peran (SoD statik).**
`Tenant.sodPolicy = SMALL_BUSINESS` menerima tumpang-tindih, tapi **wajib**
disertai mitigasi tertulis yang menyebut kontrol penggantinya. Konflik dicatat
berstatus `ACCEPTED` dengan nama penyetuju dan alasannya. K63 menghitung yang
belum dimitigasi — jadi angkanya jujur, bukan disembunyikan.

**Yang tidak pernah dilonggarkan — pemisahan langkah (SoD dinamis).**
Orang yang sama tidak boleh berada di dua ujung satu dokumen. Yang menyiapkan
pembayaran tidak boleh merilisnya. Yang menghitung kas tidak boleh menyetujui
selisihnya sendiri. `assertChain` tetap berlaku penuh.

Garisnya: **boleh merangkap jabatan, tidak boleh merangkap tanda tangan.**

Perusahaan besar memakai `sodPolicy = STRICT` dan mendapat perilaku lama.

### Peluang yang belum digarap

Band T3–T4 butuh dua penyetuju independen. Cafe 8 orang sering hanya punya
satu. Nalarasa bisa menjual **penyetuju kedua dari jarak jauh** — back office
Nalarasa sebagai mata kedua untuk pembayaran besar dan pembukaan periode.

Itu mengubah SoD dari beban kepatuhan menjadi barang dagangan. Belum dibangun;
tercatat di BACKLOG E5.

---

## 4. Permukaan aplikasi

Aturan pemilahan: **pekerja meja memakai dashboard, pekerja lapangan dan shift
memakai aplikasi sendiri.**

| Permukaan | Pengguna di pasar sasaran |
|---|---|
| Dashboard | Pemilik, supervisor, admin, akuntan luar |
| Kasir (POS) | Kasir |
| Waiter | Pramusaji — termasuk yang dipasok Nalarasa |
| Kitchen Display | Juru masak |
| Karyawan (ESS) | Semua karyawan — pengguna terbanyak |
| Gudang | Siapa pun yang menerima barang hari itu |

Aplikasi teknisi/work order (BACKLOG A11) adalah kebutuhan hotel, bukan cafe.
Prioritasnya turun ke rendah untuk pasar ini; naik lagi kalau menyasar hotel.

---

## 5. Uji kelayakan fitur

Sebelum menambah apa pun, jawab tiga pertanyaan:

1. Apakah ini masuk akal untuk cafe 8 orang dengan satu komputer?
2. Apakah pemiliknya bisa memakainya tanpa dilatih?
3. Apakah tetap berfungsi saat internet mati?

Tiga "ya" — bangun. Ada satu "tidak" — pikirkan lagi.
