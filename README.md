# whatsapp-agent-starter

Blueprint dan panduan untuk coding agent yang akan membangun asisten WhatsApp sesuai pilihan operator.

Agent membangun satu proses Node.js yang tersambung ke WhatsApp melalui Baileys. Bot meminta jawaban ke gateway AI yang kompatibel dengan OpenAI API dan menyimpan konteks tiap chat di SQLite.

> Repo ini bukan bot siap jalan. Tidak ada aplikasi `src/` atau `package.json` di sini. Agent membangun aplikasi di folder terpisah, mengikuti spesifikasi dan panduan dalam repo ini.

## Mulai di sini

1. Unduh repo ini atau clone dari GitHub. Buka foldernya di coding agent yang punya akses ke file dan terminal lokal.
2. Berikan agent prompt berikut. Persetujuan Anda tetap diperlukan sebelum agent membuat aplikasi atau menjalankan tindakan di luar folder output.

```text
Baca AGENTS.md, docs/architecture.md, dan docs/build-guide.md sampai selesai.
Repo whatsapp-agent-starter ini adalah spesifikasi, bukan aplikasi siap jalan.

Bangun aplikasi sesuai kontrak di folder output sibling yang terpisah dan kosong.
Jangan ubah repo spesifikasi. Gunakan jalur sumber yang benar-benar Anda lihat.
Sebelum menulis file, tanyakan OS target, jalur output absolut, zona waktu,
apakah akun WhatsApp bot sama dengan akun owner atau akun terpisah,
ketersediaan gateway AI dan model, serta apakah verifikasi live perlu ditunda.
Jelaskan rencana dan minta persetujuan lokasi output sebelum mulai.

Jangan meminta nomor telepon, token, kredensial, QR, isi chat, atau file rahasia
melalui percakapan ini. Operator memasukkannya sendiri melalui wizard lokal.
Jangan membaca atau mencetak .env, sesi WhatsApp, atau database instalasi nyata.
Jangan menimpa file atau memakai folder output yang tidak kosong.
Minta izin sebelum instalasi sistem, perubahan layanan, deployment,
perluasan akses, atau tindakan destruktif. Jangan commit otomatis.

Bangun hanya lima modul yang ditentukan. Salin wizard dan tesnya,
buat tes offline aplikasi, lalu jalankan pemeriksaan sintaks dan tes.
Pertahankan lisensi dan notice dari sumber yang digunakan.
Setelah tes offline lulus, pandu operator menjalankan setup dan pairing
melalui terminal lokal privat. Jangan menangkap input rahasia lewat tool.
Laporkan bukti nyata: pisahkan tes offline, gateway live, WhatsApp live,
dan deployment. Langkah yang belum dijalankan harus ditandai belum diverifikasi.
```

3. Tinjau rencana agent dan pilih folder output yang kosong. Jangan izinkan agent menaruh aplikasi di repo spesifikasi.
4. Masukkan rahasia hanya lewat wizard di terminal lokal. Jangan tempel `.env`, token, QR, atau data chat ke percakapan agent.
5. Minta bukti tes. Tes offline tidak membuktikan koneksi gateway, pairing WhatsApp, atau deployment.

Coding agent membuat aplikasi. Bot WhatsApp adalah aplikasi hasil build yang membalas pesan. Keduanya bukan hal yang sama.

## Daftar isi

- [Cara kerja](#cara-kerja)
- [Teknologi](#teknologi)
- [Sebelum mulai](#sebelum-mulai)
- [Yang ada di repo ini](#yang-ada-di-repo-ini)
- [Yang dibangun](#yang-dibangun)
- [Konfigurasi lokal](#konfigurasi-lokal)
- [Mode akses](#mode-akses)
- [Privasi dan risiko penggunaan](#privasi-dan-risiko-penggunaan)
- [Verifikasi](#verifikasi)
- [Perawatan dan kontribusi](#perawatan-dan-kontribusi)
- [Lisensi dan kredit](#lisensi-dan-kredit)

## Cara kerja

```text
Pesan WhatsApp
    |
Baileys menerima pesan
    |
Pemeriksaan identitas, mode chat, dan batas input
    |
Konteks chat dari SQLite + pesan dan kutipan terpilih
    |
Gateway AI OpenAI-compatible meminta jawaban model
    |
Sanitasi format, kirim balasan ke WhatsApp
    |
Simpan pasangan pesan setelah pengiriman berhasil
```

Satu proses Node.js menangani koneksi, antrean per chat, permintaan AI, dan penyimpanan. Tidak perlu web server, ORM, atau database server terpisah untuk rancangan ini. Detail kegagalan, reconnect, dan shutdown ada di [kontrak build](./AGENTS.md) dan [arsitektur](./docs/architecture.md).

Bot berjalan di perangkat Anda, tetapi model AI belum tentu lokal. Gateway dapat meneruskan pesan ke provider cloud sesuai konfigurasi. WhatsApp tetap memerlukan jaringan.

## Teknologi

| Komponen | Peran |
|---|---|
| [Node.js](https://nodejs.org/) | Runtime JavaScript, ES modules, `fetch`, `--env-file`, `node:test`, dan `node:sqlite` |
| [Baileys](https://github.com/WhiskeySockets/Baileys) | Koneksi WhatsApp melalui protokol WhatsApp Web, bukan API resmi Meta |
| Gateway OpenAI-compatible | Endpoint `/v1/models` dan `/v1/chat/completions` untuk model pilihan operator |
| [SQLite](https://www.sqlite.org/) | Riwayat percakapan lokal per chat, diakses melalui `node:sqlite` |
| [Pino](https://github.com/pinojs/pino) | Logger yang digunakan integrasi Baileys; log aplikasi wajib membatasi data sensitif |
| [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) | QR pairing di terminal lokal privat |
| systemd, opsional | Menjalankan aplikasi sebagai layanan pada Linux |

Minimum Node.js `>=22.13.0`; pilih major LTS yang masih didukung. Panduan mematok `@whiskeysockets/baileys@7.0.0-rc14`, sebuah release candidate. Versi dependency dipasang exact dan dicatat di lockfile; jangan menggantinya dengan `latest` tanpa pengujian.

Wizard memakai nama konfigurasi `NINEROUTER_*` dan default gateway `http://127.0.0.1:20128`. Gateway tidak disertakan atau dipasang oleh repo ini. `wa-combo` adalah ID model/combo default yang harus tersedia di gateway Anda, bukan model bawaan. Kompatibilitas gateway dan model lain perlu diuji.

## Sebelum mulai

Siapkan coding agent dengan akses ke file dan terminal lokal, Node.js, akun WhatsApp yang boleh Anda tautkan, serta folder output kosong. Gateway AI bisa disiapkan belakangan, tetapi jawaban AI live belum dapat diuji sampai gateway dan model tersedia.

Aplikasi memerlukan jaringan dan penyimpanan persisten untuk sesi serta database. Linux dapat menjalankan systemd; Windows dan macOS dapat dipakai untuk pengembangan. Contoh perintah ada di [panduan build](./docs/build-guide.md).

Targetnya perangkat kecil, termasuk ARM SBC. Kompatibilitas perangkat dan dependency belum dijamin; uji pada perangkat tujuan. Biaya bergantung pada gateway, model, koneksi, dan hosting pilihan Anda.

## Yang ada di repo ini

| File | Kegunaan |
|---|---|
| [AGENTS.md](./AGENTS.md) | Kontrak normatif untuk agent: modul, perilaku, batas, dan definition of done |
| [docs/architecture.md](./docs/architecture.md) | Penjelasan alur, identitas akun, memori, privasi, dan penanganan kegagalan |
| [docs/build-guide.md](./docs/build-guide.md) | Urutan build, perintah lintas OS, tes, pairing, deployment, backup, dan troubleshooting |
| [template/setup.mjs](./template/setup.mjs) | Wizard konfigurasi yang disalin ke aplikasi hasil build |
| [template/setup.test.mjs](./template/setup.test.mjs) | Tes offline wizard, memakai konfigurasi sintetis dan folder sementara |
| [.gitignore](./.gitignore) | Aturan pengecualian file lokal sensitif dan artefak runtime |
| [LICENSE](./LICENSE) | Lisensi untuk materi repo ini |

Dua folder memiliki peran berbeda:

```text
folder-induk/
    whatsapp-agent-starter/  spesifikasi dan template, tetap sebagai sumber
    aplikasi-output/        nama dan jalur disetujui operator, awalnya kosong
```

Agent membuat manifest, lima modul aplikasi, tes, dan salinan wizard di folder output. Anda menentukan nama asisten melalui `AGENT_NAME`. Repo ini tidak menyertakan biodata atau fakta pribadi awal.

## Yang dibangun

Bot membalas pesan teks dan dapat memakai caption gambar atau video sebagai teks. Bot tidak memproses isi media. Kutipan pesan dapat ikut menjadi konteks, dengan riwayat chat yang disimpan terpisah. Aplikasi menerapkan mode akses, rate limit untuk non-owner, pemeriksaan jailbreak berbasis pola, dan sanitasi format WhatsApp.

Hanya dua perintah:

| Perintah | Perilaku |
|---|---|
| `/ping` | Memeriksa apakah bot aktif, tanpa meminta jawaban AI |
| `/reset` | Menghapus riwayat aktif chat tersebut dan mengirim konfirmasi |

Tidak termasuk browsing, web search, pembuatan gambar, TTS/STT, pengingat, spreadsheet, Discord, plugin, pesan proaktif, atau knowledge base. Penambahan fitur memerlukan permintaan eksplisit dan bukti tes tersendiri.

## Konfigurasi lokal

Di terminal **aplikasi hasil build**, operator menjalankan `npm run setup`. Wizard menanyakan sembilan field berikut. Jangan membuat, mengedit, atau membagikan `.env` melalui coding agent.

| Kunci | Wajib atau default | Kegunaan |
|---|---|---|
| `NINEROUTER_URL` | `http://127.0.0.1:20128` | URL dasar gateway, tanpa `/v1` atau endpoint completion |
| `NINEROUTER_API_KEY` | `none` | Token gateway; `none` hanya untuk gateway tanpa autentikasi |
| `NINEROUTER_MODEL` | `wa-combo` | ID model yang benar-benar tersedia di gateway |
| `OWNER_NUMBER` | Wajib | Nomor owner, 8-15 digit internasional tanpa `+` atau nol awal; wizard tidak menebak kode negara |
| `OWNER_LID` | Opsional | ID linked-device numerik, bukan nomor telepon; dipakai bila identitas LID diperlukan |
| `TZ` | Zona waktu host | Zona waktu IANA untuk waktu pada prompt |
| `AGENT_NAME` | Wajib | Nama asisten pilihan operator |
| `CHAT_MODE` | `owner_only` | Mode akses pesan |
| `AUTH_FOLDER` | `auth_info_baileys` | Folder sesi WhatsApp; path khusus perlu aturan ignore sendiri |

`npm run setup:check` memeriksa konfigurasi secara offline dengan nilai masked. `npm run setup:gateway` memeriksa koneksi dan keberadaan model. Keduanya perintah aplikasi hasil build, bukan repo sumber. Startup harus menolak `AGENT_NAME` atau `OWNER_NUMBER` yang hilang.

## Mode akses

| Mode | Pesan yang dilayani |
|---|---|
| `owner_only` | DM owner, tanpa grup; self-chat hanya jika akun bot sama dengan owner |
| `self_only` | Chat diri akun bot saja |
| `dm_only` | Semua DM, termasuk self-chat; tanpa grup |
| `all` | Semua DM dan grup, tanpa pemeriksaan owner tambahan |

Mulai dari `owner_only`. Jika akun bot berbeda dari akun owner, DM owner bukan self-chat; pilih `owner_only`, bukan `self_only`, untuk melayaninya. Pesan keluar akun bot dilewati kecuali self-chat. Broadcast dan newsletter tidak dilayani.

Owner bebas dari rate limit dan heuristik jailbreak, tetapi tetap harus lolos mode akses dan sanitasi output. Heuristik jailbreak bukan jaminan keamanan atau pengganti pembatasan akses.

## Privasi dan risiko penggunaan

Pesan, kutipan terpilih, dan konteks chat dikirim ke gateway serta provider model yang dikonfigurasi. Tinjau kebijakan retensi dan penggunaan data provider. Jangan menganggap gateway lokal membuat percakapan tetap lokal bila model menggunakan cloud.

Pada grup, riwayat dibagi per chat, bukan per peserta. Aktifkan mode grup hanya dengan persetujuan peserta dan pemahaman atas aliran data tersebut.

Riwayat default menyimpan hingga 20 pesan per chat, dengan TTL 7 hari dan pembersihan berkala. Ini konteks percakapan, bukan memori fakta jangka panjang. TTL bukan janji penghapusan pada detik tertentu. `/reset` menghapus row aktif, bukan salinan pada WAL, backup, atau provider.

`.env`, sesi WhatsApp, database, dan backup adalah data sensitif. Jangan unggah ke GitHub atau chat agent. Batasi akses lokal, gunakan penyimpanan backup terenkripsi, dan verifikasi aturan ignore untuk path aktual sebelum publikasi. Gunakan HTTPS untuk gateway remote; HTTP dapat mengekspos token dan percakapan di jaringan.

Baileys adalah integrasi tidak resmi. Perubahan protokol atau kebijakan WhatsApp dapat memutus koneksi atau menyebabkan pembatasan akun. Repo ini tidak berafiliasi dengan atau didukung oleh WhatsApp/Meta. Gunakan hanya akun yang Anda berwenang operasikan; jangan gunakan untuk spam.

## Verifikasi

Tes template dapat dijalankan di repo ini tanpa konfigurasi operator, gateway, atau WhatsApp:

```powershell
node --check template\setup.mjs
node --check template\setup.test.mjs
node --test template\setup.test.mjs
```

Pada Linux/macOS, gunakan `/` sebagai pemisah path untuk perintah yang sama. Tes ini menguji wizard saja, bukan aplikasi yang belum dibuat.

Minta agent menyerahkan bukti dalam kelompok terpisah:

| Kelompok | Bukti yang diperlukan |
|---|---|
| Build dan tes offline | Semua modul lulus `node --check`; `npm test` lulus tanpa koneksi nyata |
| Konfigurasi | `npm run setup:check` exit 0 dengan nilai masked, setelah operator mengisi wizard |
| AI live | Model ditemukan lewat `/v1/models` dan completion berhasil |
| WhatsApp live | Pairing lokal, balasan, `/ping`, `/reset`, aturan owner/non-owner, dan sesi tetap tersimpan setelah restart |
| Penyimpanan | Pasangan pesan tersimpan setelah send sukses, riwayat terisolasi per chat |
| Deployment Linux | Instalasi disetujui, service berjalan dan restart tanpa scan ulang |
| Publikasi | Rahasia tidak terlacak Git; path sensitif benar-benar diabaikan |

Langkah yang belum dijalankan harus tertulis **belum diverifikasi**, bukan dianggap lulus. QR hanya ditampilkan di terminal lokal tepercaya, bukan log service atau chat agent. Panduan lengkap dan gate tiap fase ada di [panduan build dan operasi](./docs/build-guide.md).

## Perawatan dan kontribusi

Jaga repo spesifikasi tetap terpisah dari instalasi bot agar sesi dan database tidak ikut terpublikasi. [Panduan operasi](./docs/build-guide.md#fase-8--operasi) menjelaskan backup, restore, pembaruan dependency, dan penghapusan aplikasi. Uji pembaruan sebelum memasangnya pada perangkat utama.

Kontribusi yang mengubah perilaku perlu memperbarui kontrak dan panduan terkait. Jika mengubah wizard, jalankan tesnya. Untuk issue atau pull request, gunakan data sintetis. Jangan sertakan nomor telepon, token, QR, isi chat, sesi, atau database.

## Lisensi dan kredit

Materi repo ini menggunakan [MIT License](./LICENSE). Anda dapat memakai, menyalin, mengubah, dan mendistribusikannya, termasuk secara komersial, dengan mempertahankan pemberitahuan hak cipta dan teks lisensi pada salinan atau bagian substansialnya. Materi diberikan tanpa garansi. Pemberitahuan hak cipta yang sudah ada tetap dipertahankan meskipun nama repo berubah.

Terima kasih kepada proyek berikut yang menjadi fondasi rancangan aplikasi:

| Proyek | Kontribusi | Lisensi atau status upstream |
|---|---|---|
| [Node.js](https://nodejs.org/) | Runtime dan API native | [MIT, beserta notice komponen pihak ketiga](https://github.com/nodejs/node/blob/v22.13.0/LICENSE) |
| [Baileys](https://github.com/WhiskeySockets/Baileys) | Koneksi WhatsApp | [MIT pada v7.0.0-rc14](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/LICENSE) |
| [Pino](https://github.com/pinojs/pino) | Logging integrasi | [MIT](https://github.com/pinojs/pino/blob/main/LICENSE) |
| [qrcode-terminal](https://github.com/gtanner/qrcode-terminal) | QR pairing terminal | [Apache-2.0](https://github.com/gtanner/qrcode-terminal/blob/master/LICENSE) |
| [SQLite](https://www.sqlite.org/) | Database yang dipakai melalui Node.js | [Public domain untuk kode deliverable SQLite](https://www.sqlite.org/copyright.html) |

Daftar ini mencatat fondasi langsung rancangan, bukan inventaris seluruh dependency transitif. Lisensi MIT repo ini tidak menggantikan lisensi dependency, model, gateway, atau syarat layanan WhatsApp. Sebelum mendistribusikan aplikasi hasil build, periksa versi dan lisensi dependency yang benar-benar terpasang; sertakan lisensi, atribusi, dan file NOTICE bila diwajibkan upstream. Penghargaan di README bukan pengganti kewajiban tersebut. Gateway dan provider dipilih operator, sehingga lisensi serta ketentuannya harus diperiksa terpisah.