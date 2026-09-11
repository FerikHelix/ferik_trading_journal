# Ferik Trading Journal

Trading journal Exness MT5 yang berjalan sepenuhnya di browser. CSV diproses secara lokal, disimpan di IndexedDB, dan tidak dikirim ke server.

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
```

## Alur penggunaan

1. Unduh riwayat order CSV dari Exness Personal Area.
2. Buka menu **Import CSV** dan buat profil account MT5.
3. Pilih timezone sumber, periksa preview, lalu simpan import.
4. Gunakan menu **Trades** untuk membuka dan melengkapi jurnal posisi.
5. Buat backup berkala melalui **Pengaturan**. Backup dapat berupa JSON biasa atau JSON terenkripsi password.

Data tersimpan hanya pada browser/perangkat yang sedang digunakan. Membersihkan site data akan menghapus jurnal lokal. Jangan commit CSV atau file backup ke repository.

## GitHub Pages

Workflow `.github/workflows/deploy.yml` menjalankan test, build, dan deployment ketika branch `main` di-push.

1. Buat repository GitHub bernama `ferik_trading_journal`.
2. Tambahkan remote dan push branch `main`.
3. Buka **Settings → Pages** pada repository.
4. Pilih **GitHub Actions** sebagai source.

Saat berjalan di GitHub Actions, konfigurasi Astro otomatis memakai URL `https://<owner>.github.io/ferik_trading_journal/`. Development lokal tetap menggunakan `/`.

## Batasan MVP

- Import difokuskan pada closed trade Exness MT5.
- Screenshot, attachment, cloud sync, login, dan koneksi broker langsung belum tersedia.
- Posisi dari account dengan currency berbeda tidak digabung sebagai nominal P&L.
- Grafik yang ditampilkan adalah cumulative closed-trade P&L, bukan true account equity.
