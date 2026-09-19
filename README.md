# FerikTrading

Workspace trading yang berjalan sepenuhnya di browser: **analisis fundamental**, **sinyal order block SMC**, dan **jurnal trading**. CSV Exness diproses secara lokal, disimpan di IndexedDB, dan tidak pernah dikirim ke server.

Tidak ada backend dan tidak ada GitHub Actions untuk data. Semua harga dan berita diambil langsung dari browser saat aplikasi dibuka, lalu di-cache lokal.

## Menjalankan secara lokal

Persyaratan: Node.js 22.12 atau lebih baru.

```sh
npm install
npm run dev
```

Quality checks:

```sh
npm run check
npm test
npm run build
npm run test:e2e
```

Kalau port 4321 sedang dipakai project lain, jalankan e2e di port lain:

```sh
PREVIEW_PORT=4331 npx playwright test
```

## Alur penggunaan

1. Unduh riwayat order CSV dari Exness Personal Area.
2. Buka menu **Import CSV** dan buat profil account MT5.
3. Pilih timezone sumber, periksa preview, lalu simpan import.
4. Gunakan menu **Trades** untuk membuka dan melengkapi jurnal posisi.
5. Buat backup berkala melalui **Settings**. Backup dapat berupa JSON biasa atau JSON terenkripsi password.

## Sumber data market

Diisi di **Settings → Sumber data market**. API key disimpan lokal dan **tidak ikut ke file backup**.

| Instrumen | Sumber | Butuh key? |
| --- | --- | --- |
| BTCUSD | `data-api.binance.vision` | tidak |
| XAUUSD | Binance `PAXGUSDT` (proxy emas, jalan 24/7) | tidak |
| 7 forex major | Twelve Data | key gratis |
| Berita + sentimen | Alpha Vantage `NEWS_SENTIMENT` | key gratis |
| XAGUSD, WTIUSD | tidak ada sumber gratis | butuh data proxy |

Batasan yang perlu diketahui:

- **Perak dan minyak tidak punya sumber gratis yang bisa dipanggil dari browser.** Yahoo Finance punya datanya, tetapi tidak mengirim header CORS sama sekali, jadi mustahil dipanggil langsung. Tier gratis Twelve Data tidak mencakup komoditas.
- Solusinya: isi **Data proxy URL** dengan endpoint milik sendiri (mis. Cloudflare Worker, gratis 100k request/hari) yang meneruskan Yahoo dan menambahkan header CORS.
- Emas lewat PAXG adalah emas tokenised, jadi ada candle akhir pekan yang tidak dimiliki spot gold.
- Kuota gratis ketat (Twelve Data 800/hari & 8/menit, Alpha Vantage 25/hari), jadi respons di-cache di IndexedDB dan permintaan dijeda antar instrumen.

## Sinyal SMC

Order block dideteksi otomatis dari candle, bukan diinput manual:

1. Swing high/low fraktal dikonfirmasi dari candle di kiri dan kanannya.
2. Break dicatat saat sebuah candle **close** melewati swing terakhir — sumbu yang menembus tanpa close tidak dihitung. Break pertama yang melawan arah tren dilabeli CHoCH, selebihnya BOS.
3. Order block diambil dari candle berlawanan terakhir sebelum impulse tersebut.
4. Statusnya dievaluasi terhadap harga sekarang: `fresh`, `approaching`, `touched`, `mitigated`, `invalid`.

Status `approaching` dan `touched` memunculkan alert di lonceng topbar, dan menjadi notifikasi browser bila diizinkan di Settings. Karena ini situs statis tanpa service worker, notifikasi hanya bisa muncul saat tab terbuka.

Logikanya murni fungsi dari array candle, jadi bisa diuji tanpa jaringan — lihat `tests/unit/smc.test.ts`.

Data tersimpan hanya pada browser/perangkat yang sedang digunakan. Membersihkan site data akan menghapus jurnal lokal. Jangan commit CSV atau file backup ke repository.

## GitHub Pages

Workflow `.github/workflows/deploy.yml` menjalankan test, build, dan deployment ketika branch `main` di-push.

1. Buat repository GitHub bernama `ferik_trading_journal`. Nama ini dipakai sebagai base path, jadi mengubahnya berarti mengubah semua URL deploy.
2. Tambahkan remote dan push branch `main`.
3. Buka **Settings → Pages** pada repository.
4. Pilih **GitHub Actions** sebagai source.

Saat berjalan di GitHub Actions, konfigurasi Astro otomatis memakai URL `https://<owner>.github.io/ferik_trading_journal/`. Development lokal tetap menggunakan `/`.

## Batasan MVP

- Import difokuskan pada closed trade Exness MT5.
- Screenshot, attachment, cloud sync, login, dan koneksi broker langsung belum tersedia.
- Posisi dari account dengan currency berbeda tidak digabung sebagai nominal P&L.
- Grafik yang ditampilkan adalah cumulative closed-trade P&L, bukan true account equity.
