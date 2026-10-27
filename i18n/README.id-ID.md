# Kitsune Router

**Your models. Your routes.**

Gateway AI local-first yang netral terhadap penyedia, dipelihara dan disponsori [ByKitsune](https://bykitsune.com). Anda memilih model, akun, dan urutan fallback. Tidak perlu akun ByKitsune atau membeli API terkelola. Permintaan tetap dikirim ke upstream yang dipilih; local-first bukan inferensi offline.

[English](../README.md) · [Repositori](https://github.com/ByKitsune/kitsune-router) · [Perubahan](../CHANGELOG.md) · [Migrasi](../docs/MIGRATION.md)

## Status rilis dan instalasi

**Container 1.0.2 terbit privat; akses anonim menunggu; npm terblokir.** Sumber tetap `65c8b97d`: 9.041 lulus, 100 dilewati, nol gagal. Recovery `40485038668` menerbitkan GHCR `1.0.2`/`latest`; readback terautentikasi digest/provenance/SPDX dan smoke independen image terbit lulus. Paket masih **private** pada pembacaan terakhir: pemilik memilih Public tetapi belum mengonfirmasi, grant anonim HTTP 401. npm tetap E403/readback publik HTTP 404, penggantian token pengguna belum dikonfirmasi. Perintah npm hanya setelah publikasi npm terverifikasi; sekarang gunakan sumber atau akses container privat yang diizinkan. Tidak ada GitHub Release atau deployment produksi. [Bukti 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md) · [Docker](../DOCKER.md).

Tag tidak dipindahkan: `v1.0.1` di `74583402` lulus SSH/CI, tetapi gate GHCR gagal sebelum login/push, tanpa image kanonis. Perintah npm publish gagal, penyebab belum diketahui; readback publik HTTP 404 pada 2026-10-27, tanpa GitHub Release. `v1.0.0` di `390a6567` tidak menerbitkan npm/GHCR setelah tes migrasi gagal. [Percobaan 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [Kandidat 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md). Jam tes dan diagnostik npm tidak mengubah urutan atau penolakan ownership produksi. Jumlah tes lama bukan bukti 1.0.2; asal 0.x dipertahankan.

Memerlukan **Node.js >=22.19.0**. Hanya setelah dipublikasikan:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# Atau: npx @bykitsune/router@1.0.2
```

Dari repositori kanonis yang dikonfirmasi atau checkout yang ada, jalankan di root tanpa subdirektori `app/`:

Hanya untuk instalasi **baru**, buat secret sekali dalam `.env` privat (shell POSIX/OpenSSL). `next dev` tidak menjalankan generator launcher; tanpa `JWT_SECRET` acak minimal 32 karakter, login gagal. Saat migrasi pertahankan `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` efektif dan `DATA_DIR` absolut. Tinjau file dan ganti nilai contoh hanya untuk instalasi baru; jangan publikasikan atau commit `.env`.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Atur `INITIAL_PASSWORD` yang kuat sebelum membuka akses. Buka `http://localhost:20128/dashboard`, hubungkan penyedia yang diizinkan, lalu buat/salin key gateway. Base URL klien: `http://localhost:20128/v1`. Pilih model yang benar-benar terdaftar; `/api/health` bukan bukti akses upstream.

## Integrasi

Executable adalah **`kitsune-router`**, sedangkan key penyedia **`kitsunerouter`**. Codex memakai `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Buat combo contoh `my-route` terlebih dahulu. Variabel menyimpan key yang sudah diterbitkan, bukan membuat key. Claude Code memakai `ANTHROPIC_BASE_URL=http://localhost:20128` dan menambahkan `/v1/messages`. Tinjau preset tanpa menimpa pengaturan lain. [Contoh lengkap](../docs/INTEGRATIONS.md).

## Migrasi dan keamanan

Hentikan gateway lama serta helper-nya, lalu cadangkan **seluruh** direktori privat. Startup dapat memigrasikan `~/.zenrouter` atau `~/.9router` ke `~/.kitsune-router` (padanan `%APPDATA%` di Windows), dengan snapshot SQLite konsisten dan verifikasi file. Sumber tetap ada; tujuan yang sudah ada tidak ditimpa. `DATA_DIR` eksplisit selalu diprioritaskan dan tidak dipindahkan.

Simpan `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/`, dan `mitm/`. Jangan mengganti salt kriptografi atau root sertifikat tepercaya hanya untuk mengganti nama. Tidak semua kredensial dijamin terenkripsi saat disimpan. Variabel baru: `KITSUNE_ROUTER_*`; header: `x-kitsune-router-*`; provider: `kitsunerouter`. `/v1/*` dan port 20128 tidak berubah; alias perintah/provider lama tidak diwajibkan.

Docker tetap memakai volume/mount pada `DATA_DIR` efektif: default `/app/data` atau path absolut kustom yang didukung; hanya linux/amd64. Pada Linux terbatas, hentikan/backup lalu pakai `DATA_DIR` eksplisit ke sumber tanpa relokasi atau minta tinjauan berhak akses; jangan abaikan izin. Verifikasi image; mirror opsional. [Instalasi](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Operasi](../docs/OPERATIONS.md).

Penghematan kompresi bergantung beban kerja. Tidak ada persentase tetap, kuota tak terbatas, atau jaminan selalu tersedia. Estimasi bukan tagihan; harga tidak diketahui bukan gratis. Izin, wilayah, dan ketentuan penyedia tetap berlaku. Tidak ada endpoint Kitsune terkelola bawaan; sinkronisasi lama sudah dihapus. Gate sumber/artefak lokal tidak membuktikan publikasi registry. [Bukti 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

## Kredit dan lisensi

Terima kasih kepada penulis/kontributor ZenRouter/9Router termasuk Joy, serta [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman), dan [Ponytail](https://github.com/DietrichGebert/ponytail). Pemberitahuan hak cipta dan asal artefak historis dipertahankan. MIT: [LICENSE](../LICENSE).
