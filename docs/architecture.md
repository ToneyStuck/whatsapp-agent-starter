# Arsitektur

Dokumen deskriptif. Kontrak normatif ada di `AGENTS.md`. Repo ini spesifikasi/template, bukan aplikasi. Target Node.js `>=22.13.0` untuk `node:sqlite` dan `--env-file`; rekomendasikan major LTS yang masih didukung. Tidak ada klaim dukungan ARM atau verifikasi deployment.

## 1. Alur data

```
WhatsApp
   |  messages.upsert (batch)
   v
index.mjs
  1. filter      hanya event notify; skip broadcast, termasuk status@broadcast, dan newsletter; timestamp valid dan >= botStartTime-5000 ms
  2. identity    normalisasi JID, self-chat, target, gate CHAT_MODE
  3. extract     conversation/text/caption + kutipan tak tepercaya, envelope unwrap, batas 16000
  4. queue       serial per chat
  5. security    rate limit non-owner termasuk command, jailbreak input+kutipan non-owner
  6. command     /ping atau /reset sebelum AI
  7. memory      getHistory(jid)
  8. persona     getSystemPrompt()
  9. ai-client   generateChatReply(...)
 10. security    sanitizeAiOutput(text)
 11. send        composing -> delay -> paused -> sendMessage
 12. memory      addExchange(user, assistant) satu transaksi setelah send sukses
   |
   v
gateway /v1/chat/completions
```

Pipeline linier. Jaringan gateway dan WhatsApp serta DB punya efek samping; queue per chat menjaga urutan. Setiap tahap memakai hasil tahap sebelumnya; tidak ada tahap yang diklaim tanpa efek nyata.

## 2. Modul

### `src/ai-client.mjs`

Satu-satunya pemanggil gateway. POST `${NINEROUTER_URL}/v1/chat/completions`, header `x-9router-token-saver: off` (permintaan ke gateway, bukan jaminan gateway mematuhi). Timeout via `AbortController`, redirect ditolak, argumen divalidasi. Satu retry hanya untuk konten kosong; HTTP error, `blockReason`, dan cancel tidak diulang. Raw body disimpan di `err.body` untuk konsumsi internal dan tidak pernah dicatat. Log hanya kode/status/konteks aman tanpa chat atau token.

### `src/persona.mjs`

`getSystemPrompt()` mengembalikan system prompt. Fungsi, bukan konstanta, karena memuat waktu aktual saat dipanggil dan `AGENT_NAME`. Tidak ada fakta pribadi.

### `src/memory.mjs`

SQLite via `node:sqlite`. Lazy init; import tidak membuka file. Tabel `messages(id,jid,role,content,created_at)` dengan indeks `(jid,created_at)`, parameterized query, constraint role, validasi argumen. Timestamp disimpan dalam ms.

- `addMessage(jid,role,content)` tetap tersedia.
- `addExchange(jid,user,assistant)` menulis dua row dalam satu transaksi untuk runtime.
- `getHistory(jid,limit=20)` memakai limit yang di-clip ke `maxHistory`; query newest deterministic lalu hasil dikembalikan kronologis.
- Trim fisik tiap chat ke `maxHistory` row, menghormati opsi constructor custom.
- TTL prune saat runtime dan interval idle `unref` terbatas yang dibersihkan saat shutdown. Ini pembersihan berkala, bukan janji hapus tepat 7 hari.
- `clearHistory(jid)` memakai SQL delete; bukan penghapusan forensik dari WAL, backup, atau provider.
- `close()` menutup timer dan DB.

Konstruktor menerima jalur DB agar tes memakai file temp. Instalasi baru kosong.

### `src/security.mjs`

- `checkRateLimit(jid)` per identitas pengirim, sliding window maksimum 12 event per 60 detik, prune key. `>12` ditolak.
- `isMaliciousJailbreak(text)` regex heuristik murah untuk pola umum Inggris/Indonesia/DAN, bukan batas keamanan.
- `sanitizeAiOutput(text)` strip code fence, `**bold**` ke `*bold*`, batas 4000 karakter, output kosong tidak dikirim. Format WhatsApp: bold satu asterisk, bullet/nomor bukan dash, tanpa heading `#` atau tabel pipe, paragraf dipisah baris kosong.

Owner hanya dikecualikan dari rate limit dan jailbreak; sanitasi output selalu berlaku untuk semua pengirim.

### `src/index.mjs`

Penyambung: siklus socket, reconnect, handler pesan, queue per chat. Mengekspor `startBot()` dan memanggilnya hanya saat entry point, sehingga tes dapat mengimpor tanpa koneksi.

## 3. State

| State | Lokasi | Masa hidup |
|---|---|---|
| Sesi WhatsApp | `AUTH_FOLDER` | sampai logout atau dihapus |
| Memori chat | `data/memory.db` | TTL 7 hari per pesan, prune berkala |
| Konfigurasi | `.env` | persisten sampai diubah |
| Jendela rate limit | Map memori | selama proses hidup |

Konfigurasi memang dipersistenkan di `.env` oleh wizard. Hanya sesi dan DB yang ditulis runtime.

## 4. Identitas

WhatsApp memakai JID nomor (`...@s.whatsapp.net`) dan LID (`...@lid`). Bot menormalisasi JID dengan `jidNormalizedUser` termasuk suffix perangkat, membandingkan dengan `OWNER_NUMBER`/`OWNER_LID`, dan memakai akun bot untuk self-chat. Owner di grup adalah `participant`, bukan `remoteJid`. LID tak dikenal fail closed, tidak ditebak. `OWNER_LID` adalah jalur pemulihan; operator membacanya dari diagnosis lokal privat, bukan dari log yang dibagikan.

## 5. Mode

| Mode | Diizinkan |
|---|---|
| `self_only` | Hanya chat diri akun bot |
| `owner_only` | DM owner; self-chat hanya jika akun bot memang owner; semua grup ditolak |
| `dm_only` | Semua DM termasuk self-chat; grup ditolak |
| `all` | Semua DM dan grup; tanpa gate owner tambahan |

## 6. Kegagalan

| Kegagalan | Perilaku |
|---|---|
| Gateway tidak terjangkau | error aman dicatat, satu apology generik hanya untuk chat approved dan socket masih terbuka; kegagalan kirim apology ditangkap |
| Balasan kosong | satu retry, lalu apology |
| Socket tertutup | socket baru setelah 5 detik; `loggedOut` berhenti exit 0 |
| Bentuk pesan buruk | handler berhenti awal, tidak mengirim |
| DB gagal setelah send | log aman, tidak ada apology/reply kedua |
| Presence gagal | log aman, send tetap jalan bila socket terbuka |
| Uncaught exception | log tersanitasi lalu exit nonzero |
| `AGENT_NAME`/`OWNER_NUMBER` hilang | menolak start dengan pesan eksplisit |

## 7. Privasi

Pesan dan kutipan yang dipilih dikirim ke gateway/provider sesuai konfigurasi operator. Konteks grup dibagikan ke semua peserta grup yang disetujui; tidak ada data chat lain. Operator harus memahami consent grup dan kebijakan provider. Backup sesi dan DB sensitif; simpan terbatas dan jangan unggah.

## 8. Alasan bentuk ini

- Permukaan kecil: lima modul dan satu wizard.
- Tanpa framework, DI container, ORM, atau plugin.
- Batas eksplisit: wizard satu-satunya penulis `.env`; ai-client satu-satunya pemanggil HTTP; memory satu-satunya pemanggil SQLite.
- Pemulihan memakai backup konsisten; penghapusan sesi/DB memerlukan persetujuan operator dan bukan penghapusan salinan provider.
