# Panduan build

Prosedur berurutan untuk coding agent membangun aplikasi dari spesifikasi ini. Repo ini tetap spesifikasi: jangan buat `src/`, `package.json`, atau implementasi di sini. Setiap fase punya gate verifikasi; jangan lanjut sebelum lulus. Catat status nyata, bukan klaim.

## Fase 0 : Tanyakan operator

Sebelum menulis file, tanyakan dan catat:

- OS target.
- Jalur absolut folder output sibling yang kosong. Jangan memakai `~/wa-agent`, jangan menimpa direktori tidak kosong, jangan menebak lokasi.
- Akun WhatsApp bot akan menjadi akun owner yang sama atau akun terpisah. Untuk `self_only`, jelaskan bahwa hanya chat diri akun bot yang dilayani.
- Gateway AI: sudah tersedia atau belum, URL dasar, model yang benar-benar ada, siapa menanggung biaya. `wa-combo` adalah nama combo default yang operator harus buat, bukan model bundled.
- Zona waktu IANA.

Jangan minta nomor telepon, token, kredensial, QR, `.env`, sesi, atau isi chat di percakapan agent. Minta konfirmasi rencana sebelum menulis. Minta persetujuan terpisah untuk instalasi sistem, deployment, perubahan layanan, atau tindakan destruktif.

Node minimum `>=22.13.0`. Rekomendasikan major LTS yang masih didukung. Jangan klaim dukungan ARM/native bridge tanpa uji perangkat.

**Gate 0:** jawaban operator lengkap; folder output sibling absolut dan kosong; rencana disetujui.

## Fase 1 : Kerangka

Di folder output, buat `.gitignore` lebih dahulu, sebelum salinan sumber dan sebelum instalasi:

```gitignore
node_modules/
.env
.env.*
!.env.example
auth_info_baileys/
auth_info_baileys-*/
data/
*.db
*.db-*
*.db-wal
*.db-shm
logs/
*.log
```

Jika `AUTH_FOLDER` kustom, tambahkan path aktual secara manual. Jangan memakai wildcard global yang bisa menyembunyikan sumber. Jangan commit otomatis.

Salin sumber spesifikasi yang diperlukan dari repo ini, lalu inisialisasi manifest:

```powershell
npm init -y
npm pkg set type=module
npm pkg set main=src/index.mjs
npm pkg set scripts.start="node --env-file=.env src/index.mjs"
npm pkg set scripts.test="node --test"
npm pkg set scripts.setup="node setup.mjs"
npm pkg set scripts.setup:check="node setup.mjs --check"
npm pkg set scripts.setup:gateway="node setup.mjs --gateway-check"
npm pkg set engines.node=">=22.13.0"
New-Item -ItemType Directory src,test,data -Force | Out-Null
```

Linux/macOS:

```bash
npm init -y
npm pkg set type=module main=src/index.mjs
npm pkg set 'scripts.start=node --env-file=.env src/index.mjs'
npm pkg set 'scripts.test=node --test'
npm pkg set 'scripts.setup=node setup.mjs'
npm pkg set 'scripts.setup:check=node setup.mjs --check'
npm pkg set 'scripts.setup:gateway=node setup.mjs --gateway-check'
npm pkg set engines.node=">=22.13.0"
mkdir -p src test data
```

Setelah output disetujui, install dependency:

```bash
npm i --save-exact @whiskeysockets/baileys@7.0.0-rc14 qrcode-terminal pino
```

Gate manifest: periksa `package.json` dan pastikan versi dependency exact, tanpa `^`/`~`; perintah install memakai `--save-exact`. Pin Baileys tepat `7.0.0-rc14` karena opsi dapat berubah antar release candidate. Ini release candidate, bukan jaminan kompatibilitas ARM atau native bridge. Jangan memakai `latest` atau range tanpa uji. Tidak memakai dotenv; gunakan `node --env-file=.env`. Lockfile dari `npm install` boleh di-commit jika tidak memuat rahasia.

Pertahankan pemberitahuan hak cipta dan lisensi MIT saat menyalin materi repo. Sebelum mendistribusikan hasil build, periksa lisensi versi dependency langsung dan transitif yang terpasang, lalu sertakan lisensi, atribusi, dan NOTICE bila diwajibkan. Jangan menganggap semua dependency memakai MIT: qrcode-terminal memakai Apache-2.0. Lihat [lisensi dan penghargaan](../README.md#lisensi-dan-penghargaan).

**Gate 1:** jalankan `node -v` dan `npm -v`; pastikan Node `>=22.13.0`; `.gitignore` ada sebelum sumber disalin; folder kosong sudah dikonfirmasi; tidak ada `.env`.

## Fase 2 : Wizard

Salin wizard ke root output dan tes ke `test/`. Fixed lookup pada tes bekerja di `template/` maupun salinan `test/`.

```powershell
$spec = 'JALUR_ABSOLUT_REPO_SPESIFIKASI' # operator wajib mengganti nilai ini
Copy-Item -LiteralPath (Join-Path $spec 'template\setup.mjs') -Destination '.\setup.mjs'
Copy-Item -LiteralPath (Join-Path $spec 'template\setup.test.mjs') -Destination '.\test\setup.test.mjs'
```

Linux/macOS:

```bash
SPEC='/absolute/path/to/whatsapp-agent-starter' # replace placeholder with verified absolute repo path
cp "$SPEC/template/setup.mjs" ./setup.mjs
cp "$SPEC/template/setup.test.mjs" ./test/setup.test.mjs
```

Jalankan tes wizard sebelum manusia memasukkan rahasia:

```bash
node --test test/setup.test.mjs
node setup.mjs --check
```

`--check` di folder tanpa konfigurasi harus exit 2, offline, dan tidak menulis. Periksa `--help`. Wizard sekarang punya 9 field; jangan memakai screenshot atau nilai terkonfigurasi literal dari dokumen lama. Setelah itu serahkan terminal ke operator untuk `npm run setup`; jangan jalankan wizard interaktif atas nama operator atau menangkap input rahasia lewat tool.

Tes `--from-env` hanya membuat `.env` sintetis di direktori temp. Jangan memakai konfigurasi lokal nyata.

**Gate 2:** tes wizard lulus; `--check` exit 2 sebelum konfigurasi; operator menjalankan setup sendiri; `npm run setup:check` exit 0 dengan nilai masked.

## Fase 3 : Implementasi lima modul

Ikuti kontrak `AGENTS.md` dan `docs/architecture.md`:

- `src/ai-client.mjs` : HTTP gateway, timeout, redirect ditolak, retry hanya konten kosong, argumen divalidasi, `err.body` tidak dicatat.
- `src/persona.mjs` : `getSystemPrompt()`, nama dari `AGENT_NAME`, waktu dinamis memakai `TZ`, tanpa import nama atau fakta personal.
- `src/memory.mjs` : SQLite lazy, `addMessage`/`addExchange`, TTL, urutan deterministik, isolasi chat, transaksi, trim, `close()`.
- `src/security.mjs` : rate limit, heuristik jailbreak, sanitasi output dan batas ukuran.
- `src/index.mjs` : identity/mode, timestamp, queue per chat, reset, send, kegagalan DB pascakirim, dedup batch, kredensial, reconnect, shutdown.

Jangan mengiklankan metode placeholder sebagai implementasi runnable. Setiap metode di kontrak harus berperilaku.

**Gate 3:** sintaks lulus. PowerShell, exit pada kegagalan:

```powershell
Get-ChildItem src\*.mjs | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
```

Linux/macOS:

```bash
for f in src/*.mjs; do node --check "$f" || exit 1; done
```

## Fase 4 : Tes aplikasi

Buat tes fokus di aplikasi hasil build, bukan di repo spesifikasi. Gunakan `node:test`, tanpa dependency tambahan. Matriks minimum:

- AI HTTP: retry konten kosong, HTTP error tanpa log body, timeout/abort, redirect ditolak.
- Persona: waktu dinamis dan `AGENT_NAME`; tidak ada nama impor.
- Memory: TTL, urutan, isolasi, transaksi atomik, trim, `close()`.
- Security: ambang rate limit, prune, sanitasi output.
- Handler dengan WhatsApp dimock: identitas/mode, timestamp, queue, reset, send gagal dan DB pascakirim gagal, dedup batch, kredensial, reconnect/shutdown. Tanpa koneksi WhatsApp nyata.

```bash
npm test
```

`node --test` menemukan file tes inti secara default; tidak perlu path framework.

**Gate 4:** semua tes offline lulus; tidak ada koneksi WhatsApp/gateway nyata.

## Fase 5 : Verifikasi gateway live

Jika gateway belum tersedia, tandai live AI **deferred**, bukan sukses.

```bash
npm run setup:gateway
node --env-file=.env -e "import('./src/ai-client.mjs').then(async m => { const r = await m.generateChatReply({ systemPrompt: 'Reply with one word.', messages: [{ role: 'user', content: 'Say OK' }] }); if (!r) process.exit(1); console.log('completion ok'); }).catch(() => { console.error('Completion check failed; inspect local configuration.'); process.exitCode=1; })"
```

Jangan mencetak isi respons mentah, header, token, atau `err.body`. Completion ini bukan data pengguna sehingga isi balasan tidak perlu dilog. Gateway tidak berjalan berarti live belum lulus.

**Gate 5:** `setup:gateway` melihat model terkonfigurasi; completion sukses; tidak ada rahasia di output.

## Fase 6 : Pairing dan uji akun

Jalankan foreground di terminal lokal privat:

```bash
npm start
```

Scan QR hanya di terminal tepercaya. Jangan kirim QR, sesi, token, atau log chat ke agent/chat. Uji `/ping` dan `/reset` pada kedua tipe akun yang relevan. Uji owner dan non-owner untuk mode yang dipilih. Jika `OWNER_LID` perlu, operator membaca diagnosis lokal terkendali sendiri; jangan mengekspos ID lengkap ke log agent. Hentikan proses foreground sebelum memasang service agar tidak ada login ganda.

**Gate 6:** balasan owner benar, non-owner sesuai mode, command diproses, restart sesi tanpa QR baru.

## Fase 7 : systemd (Linux, setelah disetujui)

Hanya untuk Linux yang disetujui. Konfirmasi path user/service; jangan memakai `$USER`/`$HOME` atau sudo yang memperluas akses secara tak terduga. Ganti placeholder dengan path absolut yang sudah diverifikasi operator:

```bash
NODE_BIN=$(command -v node)
printf '%s\n' "$NODE_BIN"   # verifikasi path absolut
```

Unit, placeholder `<ABSOLUTE_OUTPUT>`, `<ABSOLUTE_NODE>`, `<NON_ROOT_USER>` wajib diganti dan ditinjau sebelum instalasi:

```ini
[Unit]
Description=WhatsApp Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<NON_ROOT_USER>
WorkingDirectory=<ABSOLUTE_OUTPUT>
ExecStart=<ABSOLUTE_NODE> --env-file=.env src/index.mjs
Restart=on-failure
RestartSec=5
UMask=0077
Environment=NODE_ENV=production
NoNewPrivileges=true
KillSignal=SIGTERM
TimeoutStopSec=20

[Install]
WantedBy=multi-user.target
```

Jangan memasang unit placeholder tanpa edit. Jangan memakai `EnvironmentFile` karena parser systemd tidak identik dengan Node. Setelah foreground berhenti dan pairing/path/non-root user/mode diverifikasi, tinjau unit final. Instalasi dan perubahan layanan memerlukan approval terpisah. Sesudah approval:

```bash
sudo install -m 644 wa-agent.service /etc/systemd/system/wa-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now wa-agent
systemctl --no-pager status wa-agent
sudo systemctl restart wa-agent
journalctl --no-pager -u wa-agent -n 50
```

Jalankan perintah status/log hanya di terminal operator privat; jangan salin log mentah ke agent. Uji restart sesi.

**Gate 7:** service aktif, restart mempertahankan sesi, log tidak memuat rahasia. Jangan klaim deployment terverifikasi tanpa bukti operator.

## Fase 8 : Operasi

- Hentikan proses sebelum backup. Operator memilih encrypted storage lalu membatasi akses mode 700. Salin `.env`, seluruh `AUTH_FOLDER`, dan seluruh direktori data saat proses berhenti; sertakan DB serta file `-wal`/`-shm` jika ada. Verifikasi backup tanpa mencetak rahasia. Restore hanya setelah approval, ke lokasi terpisah dulu; jangan menimpa data.
- Restore hanya dengan persetujuan, tanpa menimpa data yang tidak disetujui lebih dulu, dan tanpa instruksi hapus sembarangan.
- Update: tinjau perubahan manifest dan lockfile tanpa membuka/menampilkan rahasia. `npm ci` memasang lockfile tanpa memperbarui dependency. Untuk update terkontrol, pilih versi exact baru, ubah manifest secara eksplisit, jalankan `npm install`, tinjau lockfile, lalu tes dan uji perangkat. Jangan commit otomatis.
- Uninstall: hentikan/disable service, pertahankan data sampai ada persetujuan destruktif eksplisit.

## Troubleshooting aman

| Gejala | Tindakan |
|---|---|
| `fetch failed` | cek URL/port gateway; jangan cetak token/`err.body` |
| HTTP 404 | URL dasar tidak boleh berisi `/v1` atau completion |
| Balasan kosong | cek model di `/v1/models`, batas token |
| QR berulang | verifikasi scan/sesi; jangan hapus sesi otomatis |
| Owner diabaikan | cek mode/identitas lewat diagnosis lokal privat |
| Node tidak mendukung `node:sqlite` | naikkan ke >=22.13.0 |

Hygiene: gunakan `git ls-files` dan `git check-ignore` terhadap path aktual, bukan hanya `git status`. Jangan membaca `.env` untuk membuktikan ignore. Jika output bukan repo git, jangan klaim terverifikasi.

Lisensi repo tidak diubah.
