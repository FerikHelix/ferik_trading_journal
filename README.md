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

E2E tidak dijalankan di CI — GitHub Actions hanya menjalankan unit test, typecheck, lalu deploy.
Jalankan e2e secara lokal. Kalau port 4321 dipakai project lain:

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

**Tidak ada API key sama sekali.** Semua harga diambil langsung dari browser, tanpa backend dan
tanpa GitHub Actions.

| Instrumen | Sumber utama | Cadangan |
| --- | --- | --- |
| BTCUSD | Binance (tanpa key) | Gate.io, Dukascopy |
| XAUUSD | Dukascopy | Gate.io / Binance `PAXG` (emas tokenised) |
| XAGUSD | Dukascopy | CoinGecko `KAG` (4 jam-an, meleset ~0.5%) |
| WTIUSD | Dukascopy | tidak ada |
| 7 forex major | Dukascopy | `EURUSDT` Binance untuk EURUSD saja |

Hal yang perlu diketahui:

- **Dukascopy satu-satunya sumber gratis yang punya perak, minyak, dan forex major.** Ia tidak
  mengirim header CORS, jadi dibaca lewat JSONP — artinya menjalankan JavaScript pihak ketiga.
  Skrip itu dijalankan di dalam `<iframe sandbox="allow-scripts">` beropini origin opaque, jadi ia
  tidak bisa menyentuh IndexedDB berisi jurnal trading. Lihat `public/dukascopy-frame.html`.
- **GBPUSD tidak mengembalikan data** dari Dukascopy walau instrumennya terdaftar, jadi ia
  dikeluarkan dari watchlist default. Masih bisa dicentang manual di Settings.
- Kalau Dukascopy sedang tidak bisa dihubungi, BTC dan emas tetap jalan lewat Binance/Gate.io dan
  perak lewat CoinGecko. Ada circuit breaker supaya timeout-nya tidak dibayar ulang di tiap halaman;
  ia baru aktif setelah dua kegagalan berturut-turut.
- **Tidak ada feed berita.** Semua RSS keuangan dan API berita tidak mengirim CORS, jadi bias di
  halaman Fundamental dihitung murni dari price action: tren (MA20 vs MA50) 40%, struktur pasar
  (BOS/CHoCH) 35%, momentum 25%.
- Opsional: isi **Data proxy URL** di Settings dengan endpoint milik sendiri (mis. Cloudflare
  Worker, gratis 100k request/hari) yang meneruskan Yahoo Finance dan menambahkan CORS. Itu bukan
  API key, dan kalau diisi ia dipakai lebih dulu.

## Sinyal SMC

Order block dideteksi otomatis dari candle, bukan diinput manual:

1. Swing high/low fraktal dikonfirmasi dari candle di kiri dan kanannya.
2. Break dicatat saat sebuah candle **close** melewati swing terakhir — sumbu yang menembus tanpa close tidak dihitung. Break pertama yang melawan arah tren dilabeli CHoCH, selebihnya BOS.
3. Order block diambil dari candle berlawanan terakhir sebelum impulse tersebut.
4. Statusnya dievaluasi terhadap harga sekarang: `fresh`, `approaching`, `touched`, `mitigated`, `invalid`.

Status `approaching` dan `touched` memunculkan alert di lonceng topbar, dan menjadi notifikasi browser bila diizinkan di Settings. Karena ini situs statis tanpa service worker, notifikasi hanya bisa muncul saat tab terbuka.

Halaman Signals tidak melistkan semua order block. Instrumen yang sedang punya zona aktif tampil
langsung sebagai chart candlestick dengan zonanya tergambar (hijau bullish, merah bearish);
selebihnya jadi satu baris ringkas berisi rentang zona terdekat dan statusnya, dan chart-nya baru
dibuat saat baris itu diklik. Zona yang sudah mitigated atau invalid tidak digambar sama sekali.

Halaman Overview menampilkan bias H4 per instrumen dan sinyal yang sedang aktif di bagian atas,
dengan ringkasan jurnal di bawahnya.

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
