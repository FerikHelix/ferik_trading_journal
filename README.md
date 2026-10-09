# FerikTrading

**FerikTrading** adalah trading journal offline-first yang berjalan sepenuhnya di browser Anda. Dirancang khusus untuk trader MetaTrader 5 (Exness) yang mengutamakan privasi, performa cepat, dan evaluasi trading yang terstruktur.

Semua data tersimpan secara lokal di IndexedDB browser Anda. Tidak ada backend, tidak ada pelacakan analytics, dan tidak ada data trading yang pernah dikirim ke server luar.

---

## Fitur Utama

- **Import CSV Exness (MT5):** Unggah riwayat order CSV dari Personal Area Exness. Deal dan order secara otomatis diagregasi menjadi posisi trading yang rapi beserta komisi dan swap.
- **Ringkasan Jurnal (Dashboard):** Tampilan cepat untuk metrik performa utama (Net P&L, Win Rate, Profit Factor), daftar trade yang belum dievaluasi, dan trade terbaru.
- **Riwayat Trading (Trades):** Pencatatan lengkap seluruh posisi tertutup dengan filter simbol, arah posisi, dan tanggal.
- **Jurnal Posisi (Journal):** Ruang refleksi untuk setiap trade — catat alasan entry, strategi, kesalahan eksekusi, serta tag emosi/setup.
- **Trading Analytics:** Analisis statistik mendalam, rasio win/loss, profit factor, serta visualisasi performa trading.
- **Weekly Review:** Evaluasi mingguan terstruktur untuk membangun konsistensi dan disiplin trading.
- **Backup Terenkripsi:** Ekspor seluruh data journal ke file lokal dengan enkripsi password AES-GCM atau JSON polos.

---

## Memulai & Menjalankan Lokal

### Prasyarat
- **Node.js** 22.12 atau lebih baru.
- **npm** (atau package manager pilihan Anda).

### Instalasi & Dev Server
```sh
npm install
npm run dev
```

Buka browser di `http://localhost:4321/` (atau port yang ditampilkan terminal).

### Quality Checks
```sh
npm run check       # Typecheck Astro & TypeScript
npm test            # Unit tests (Vitest)
npm run build       # Production bundle build
```

---

## Alur Penggunaan

1. **Unduh Riwayat Exness:** Ekspor riwayat order CSV dari Exness Personal Area atau terminal MT5.
2. **Import CSV:** Buka menu **Import** dan buat profil account MT5. Periksa preview data lalu simpan import.
3. **Lengkapi Jurnal:** Di menu **Dashboard** atau **Trades**, klik trade yang selesai dan isi catatan evaluasi pada menu **Jurnal**.
4. **Evaluasi Rutin:** Buka **Analytics** untuk melihat statistik trading dan **Weekly Review** di akhir pekan.
5. **Backup Berkala:** Buka menu **Settings** dan lakukan backup terenkripsi (`.ftj.enc.json`) untuk mengamankan data Anda.

---

## Privasi & Keamanan Data

- **Offline-First:** Seluruh database menggunakan Dexie IndexedDB dengan nama `ferik-trading-journal`.
- **Zero Telemetry:** Tidak ada pengiriman data ke pihak ketiga.
- **Pembersihan Cache:** Menghapus "Site Data" atau cache browser dapat menghapus database lokal. Selalu lakukan backup rutin dari menu **Settings**.

---

## Deployment (GitHub Pages)

Aplikasi ini di-deploy secara otomatis ke GitHub Pages menggunakan GitHub Actions (`.github/workflows/deploy.yml`):

1. Repository default dinamai `ferik_trading_journal` (sesuai base path pada `astro.config.mjs`).
2. Setiap push ke branch `main` akan menjalankan unit test, typecheck, dan build sebelum dipublikasikan ke GitHub Pages.
