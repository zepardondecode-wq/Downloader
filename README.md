# Z-downloder

Downloader dark-goth untuk link publik TikTok, Instagram / Reels, dan Pinterest. Dibuat supaya bisa langsung dideploy ke Netlify tanpa build frontend.

## Fitur

- Auto-detect platform saat Scan.
- Judul/deskripsi, tipe media, durasi, dan ukuran file (Content-Length bila tersedia; kalau tidak, rentang estimasi).
- TikTok: video dan slideshow/image picker melalui API Cobalt-compatible.
- Instagram: reels/video/foto dan multi-media picker melalui API Cobalt-compatible.
- Pinterest: parser HTML custom berdasarkan logika scraper Python yang Anda unggah: resolve `pin.it`, baca `og:video` / JSON video MP4, dan fallback `og:image` ke resolusi `originals` bila pola URL tersedia.
- Animasi loading saat Scan dan Download.
- Brand `Z-downloder` berubah warna sesuai platform dengan efek 3D.
- Responsive, tanpa framework frontend.

## Deploy ke Netlify

1. Upload folder ini ke repository Git atau drag-and-drop ke Netlify.
2. Netlify akan memakai `netlify.toml` dan folder `netlify/functions` secara otomatis.
3. Environment variable opsional: `COBALT_API_URL`.
   - Default: `https://co.wuk.sh`
   - Untuk produksi, Anda sebaiknya memakai instance Cobalt milik sendiri atau provider kompatibel yang Anda kontrol.

## Catatan provider gratis

Proyek Cobalt resmi menyebut tidak ada pre-hosted public API resmi saat ini. Repo Cobalt komunitas yang dipakai sebagai referensi mendokumentasikan `co.wuk.sh` sebagai instance yang dapat digunakan gratis, tetapi availability dan rate limit dapat berubah. Karena itu base URL dipisahkan lewat `COBALT_API_URL` agar mudah diganti.

## Catatan Pinterest

Implementasi web memakai pola yang sama dengan file `pinsdowloder.py` yang Anda kirim: redirect pin pendek, fetch HTML, cek `og:video:secure_url` / `og:video`, cari kandidat `.mp4` di JSON halaman, lalu fallback `og:image` dan mencoba menaikkan path thumbnail ke `originals`.

## Hak penggunaan

Aplikasi ini tidak dimaksudkan untuk mengakses konten privat, menghindari login, atau melewati pembatasan akses. Gunakan hanya untuk konten publik yang memang boleh Anda simpan dan jangan menghapus atribusi/hak cipta yang berlaku.
