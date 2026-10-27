# Antigravity: "User location is not supported for the API use"

Catatan Kitsune Router: diagnosis ini bukan janji akses gratis, izin akun, atau verifikasi live terbaru. Ikuti wilayah dan ketentuan resmi Google; jangan memakai pergantian IP/akun untuk menghindari pembatasan. Lihat [operasi aman](OPERATIONS.md), [status rilis](CHANGELOG_v1.0.2.md) dan [migrasi](MIGRATION.md).

## Gejala

Request ke model Gemini via provider Antigravity gagal dengan:

```json
{ "error": { "code": 400, "message": "User location is not supported for the API use.", "status": "FAILED_PRECONDITION" } }
```

Ciri khas: **semua model Gemini mati, model Claude di akun Antigravity yang sama tetap jalan normal.**

## Akar masalah (bukan bug Kitsune Router)

Error ini dibuat oleh backend **Google Cloud Code Assist** (`daily-cloudcode-pa.googleapis.com`),
bukan oleh Kitsune Router/9Router — tidak ada baris kode di repo ini yang menghasilkan string tersebut.
Google mengevaluasi "user location" dari **egress IP server tempat Kitsune Router berjalan**
(ditambah sinyal akun), bukan dari isi request. Tier gratis Antigravity (`daily-*`)
memberlakukan **regional allowlist sendiri yang lebih ketat** dari Gemini API biasa.

Bukti:

- Error identik terjadi di klien resmi (Antigravity IDE/CLI) — lihat forum Google AI Developers
  (topik "User location is not supported", Mei–Jul 2026) dan `antigravity-cli` issue #219/#291/#722.
- Negara yang jelas supported (Jerman, Slovakia, Vietnam) ikut kena — polanya klasifikasi IP:
  IP datacenter/VPS, rentang CGNAT yang mis-geolokasi, egress IPv6 ke Google, atau mode TUN VPN aktif.
- Di 9Router ada isu persis: **#2742** (Azure Malaysia; CLI resmi jalan, via router gagal).
- Error ini hanya menyerang model Gemini; jalur Claude (API Anthropic) tidak punya gate ini.

## Cara isolasi (lakukan ini dulu sebelum menyimpulkan)

1. Jalankan Antigravity CLI/IDE **resmi dari mesin yang sama** dengan akun yang sama.
   - Resmi ikut gagal → murni IP/akun di sisi Google. Lanjut ke Workaround.
   - Resmi berhasil → kemungkinan bentuk request (laporkan ke maintainer dengan log
     `Trajectory ID` / `TraceID` dari error).

## Pilihan penanganan (hanya sesuai izin dan kebijakan upstream)

1. **Tinjau jaringan koneksi Antigravity** bersama dokumentasi/dukungan Google. Jika organisasi Anda memang berhak memakai layanan dari jaringan yang disetujui, konfigurasi proxy per-koneksi dapat digunakan untuk jaringan tersebut; ini bukan cara memperoleh hak regional baru.
   Kitsune Router mendukung proxy per-connection: isi `connectionProxyEnabled` +
   `connectionProxyUrl` di `providerSpecificData` koneksi tersebut. Traffic chat,
   refresh token, dan provisioning `loadCodeAssist` semuanya lewat proxy ini.
2. **Pilih rute lain yang memang diizinkan** untuk akun/region Anda. Keberhasilan Claude pada satu akun bukan jaminan akses umum atau hak untuk melewati gate Gemini.
3. Matikan **mode TUN** pada VPN, dan/atau **disable IPv6** egress ke range Google
   (keduanya ada laporan sukses di forum).
4. Coba jaringan lain (tethering HP) untuk memastikan diagnosis IP.

## Yang Kitsune Router lakukan untuk error ini

- **Akun tidak di-lock.** Error 400 tanpa rule khusus diklasifikasikan fail-fast:
  `shouldFallback: false, cooldownMs: 0` (`open-sse/services/accountFallback.js`).
  Pool akun tidak dibakar untuk error se-level IP.
- **`project` stabil per koneksi.** Jika provisioning `loadCodeAssist` gagal (wajar saat
  IP kena gate), executor memakai SATU id fallback per koneksi, bukan random tiap
  request (`resolveAntigravityProjectId` di `open-sse/executors/antigravity.js`).
  Selama provisioning sukses, id project asli yang dipakai (di-resolve + persist di
  `src/sse/handlers/chat.js` sebelum dispatch).
- **Hint actionable** ditempel di pesan error (`withLocationGateHint` di
  `open-sse/utils/error.js`) supaya klien (Hermes/dll) menampilkan langkah perbaikan,
  bukan sekadar "malformed".

## Yang TIDAK bisa diperbaiki dari sisi Kitsune Router

- Melewati allowlist regional Google (keputusan server-side per IP/akun).
- Menambah "param location" ke request — parameter seperti itu tidak ada di
  `generateContent`; `x-goog-user-project` adalah quota project, bukan lokasi.
  Header itu bahkan sudah tidak dikirim pada chat request sejak fix 403
  (Google menolak third-party caller dengan 403 saat header itu ada) —
  project hanya dikirim di field `project` pada body envelope.
