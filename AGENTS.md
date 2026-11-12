# AGENTS.md: build contract

This repository is a public specification, not an application. Do not create `src/` or `package.json` here. Read `docs/architecture.md` and `docs/build-guide.md`. Target application has exactly five modules: `ai-client`, `persona`, `memory`, `security`, `index`.

Minimum Node.js `>=22.13.0` for `node:sqlite` and `--env-file`; recommend a supported LTS major. Do not claim ARM/native bridge compatibility without device testing. Runtime: `node --env-file=.env src/index.mjs`; no dotenv. AI replies require a gateway. Offline build/tests can pass without a gateway; live AI remains unverified.

## Required boundaries

- No initial personal data, hardcoded names, repository secrets, features outside five modules, or import side effects. `AGENT_NAME` required from configuration.
- Validate all trust-boundary inputs. Safe logs only; never log QR, session, token, chat, raw HTTP, or `err.body`. Full IDs only in private operator-controlled local diagnostics.
- Do not read/print real installation `.env`, auth, or DB. Local wizard is sole `.env` writer; tests use temp directories and synthetic data. No automatic commits or license changes.
- Bot shares selected message/quote data with configured gateway/provider; explain consent and group privacy to operator.

## Configuration

| Key | Required/default | Meaning |
|---|---|---|
| `NINEROUTER_URL` | `http://127.0.0.1:20128` | HTTP(S) base URL without credentials, query, fragment, `/v1`, or completion endpoint |
| `NINEROUTER_API_KEY` | `none` | Gateway token |
| `NINEROUTER_MODEL` | `wa-combo` | Real available model ID, not a bundled model |
| `OWNER_NUMBER` | required | 8-15 international digits, no leading zero; wizard removes ASCII spaces, `+`, parentheses, periods, hyphens only; never guesses country |
| `OWNER_LID` | optional | 1-20 numeric LID; preserve leading zeroes |
| `TZ` | host timezone | IANA timezone |
| `AGENT_NAME` | required | Operator-chosen name, 1-30 characters, no control chars or whitespace-only value |
| `CHAT_MODE` | `owner_only` | `self_only`, `owner_only`, `dm_only`, `all` |
| `AUTH_FOLDER` | `auth_info_baileys` | Session folder, non-empty |

Use `npm run setup`, `npm run setup:check`, `npm run setup:gateway`. `--check` is offline and does not write. `--from-env` only for tests/controlled automation; validate all values before atomic overwrite. Native Node `--env-file` must round-trip values exactly. Never display unknown keys.

Fail fast at startup for missing `AGENT_NAME` and `OWNER_NUMBER`, with an explicit error and no import side effects.

## Lifecycle and bootstrap

- `src/index.mjs` compares `path.resolve(process.argv[1])` with `fileURLToPath(import.meta.url)` for the entry guard. Import must not open a socket, timer, or DB. Memory singleton lazy; tests use a temp DB and call `close()`.
- Bootstrap with `useMultiFileAuthState(AUTH_FOLDER)`, `fetchLatestBaileysVersion()`, then `makeWASocket({version,logger:pino({level:'silent'}),printQRInTerminal:false,auth:state,browser:['Ubuntu','Chrome','124.0.0.0']})`. Handle `fetchLatestBaileysVersion()` failure and caught async `creds.update`/`saveCreds` errors.
- Render QR with `qrcode-terminal` `{small:true}` only in a local TTY. Never print QR in service logs. Never log token, session, chat, QR, raw HTTP; never log `err.body`.
- Track socket state as `starting`; reconnect with one timer and a fresh socket after 5 seconds. Generation/socket guards prevent stale events after await. Initial failures reconnect too. `loggedOut` stops cleanly with exit 0 so `Restart=on-failure` does not loop.
- SIGTERM/SIGINT idempotent: stop timer, abort fetch, prevent new sends, drain credential persistence and memory, then `sock.end`; bounded shutdown. Fatal uncaught exception is sanitized then exits nonzero; ordinary handlers catch their own errors.

## Messages, identity, modes

Process `messages.upsert` batches; only `notify`. Skip every broadcast, including `status@broadcast`, and newsletter. Skip messages with timestamp `< botStartTime - 5000 ms`; skip invalid timestamps. Convert protobuf seconds to ms. Normalize JIDs with `jidNormalizedUser`, including device suffixes. Skip `fromMe` unless the message is self-chat. Compute self identity from normalized bot phone/LID; self-chat target is the bot phone number, not `OWNER_NUMBER` when the bot account is separate. Owner in groups is `participant`, not `remoteJid`; unknown LID fails closed. `owner_only` rejects all groups.

| Mode | Allowed |
|---|---|
| `self_only` | Only chat with the bot account itself |
| `owner_only` | Owner DM; self-chat only when the bot account is owner; no groups |
| `dm_only` | Every DM, including self-chat; no groups |
| `all` | Every DM and group; no additional owner gate |

Extract `conversation`, `extendedTextMessage.text`, `imageMessage.caption`, `videoMessage.caption`; unwrap supported Baileys envelopes. Empty text returns. Quotes are untrusted input. Cap combined text plus quote at exactly 16000 characters before AI. Apply gates in this order: event/type/time/broadcast/self filtering; identity and mode; extract, return empty and enforce the 16000 cap; serial per-chat queue; rate check; combined input+quote jailbreak check for non-owner; commands; history; AI. Owner exception applies only to rate limit and jailbreak, not mode. Rate limit non-owners, including commands. `/ping` replies exactly `Pong! ${agentName} active.`. `/reset` calls `clearHistory` and confirms; keep it in the queue and do not persist the command or confirmation. No other commands.

Per-chat promise queue serializes command/reset/generation/send/persist. Deduplicate message IDs with bounded size; never automatically retry failed sends because duplicate delivery is possible. Check socket generation after awaits. Group memory is per chat; participants share approved context, never other chats' history.

## Application modules

### `src/ai-client.mjs`

`generateChatReply({systemPrompt,messages,model,timeoutMs=45000,maxTokens=500,signal})` returns `Promise<string>`. POST `${NINEROUTER_URL}/v1/chat/completions`, `Content-Type: application/json`, `Authorization: Bearer ...` only when key is not `none`; header `x-9router-token-saver: off` is a request, not a gateway guarantee. JSON body has `model`, system+history `messages`, `max_tokens`, `temperature:0.7`. Timeout budget covers response body and a single retry as one operation; external abort signal works. Reject redirects and validate args. One retry only for empty content; do not retry HTTP error, block reason, or cancellation. Surface `blockReason` safely without raw chat. Internal `err.body` may be retained but never logged. Log only safe code/status/context. Empty sanitized output is not sent. Presence failure never triggers another reply.

### `src/persona.mjs`

`getSystemPrompt()` builds identity from `AGENT_NAME`, current time at call using `TZ`, concise style, and WhatsApp formatting. No personal facts.

### `src/memory.mjs`

`SqliteMemoryStore(dbPath='./data/memory.db', maxHistory=20, ttlMs=7*24*3600*1000)`. Lazy init, parameterized queries, role constraint, argument validation, index `(jid,created_at)`. Table `messages(id,jid,role,content,created_at)`. `addMessage(jid,role,content)`, `getHistory(jid,limit=20)` with limit clipped to `maxHistory`, and `clearHistory(jid)`. Store timestamps in ms. History query newest-first with deterministic tie-break, then return chronological order. Retain the default 20 rows per chat, but honor custom `maxHistory` (never hardcode 20 in retention); this is a constructor option. Runtime must use `addExchange(jid,user,assistant)` as one transaction after successful send. TTL prune at runtime and bounded idle `unref` interval cleared on shutdown; not an exact deletion-time promise. `clearHistory` uses SQL delete; not forensic deletion from WAL/backup/provider. `close()` closes timer and DB. Lazy singleton `memoryStore` has no import-time file access.

### `src/security.mjs`

`checkRateLimit(jid)` stores/prunes sender keys, allows at most 12 events per 60 seconds and rejects when count is `>12`. `isMaliciousJailbreak(text)` must match the baseline required patterns from the original contract, not a broadened feature set:

```js
/ignore (all )?(previous|above) instructions|system prompt|kamu sekarang adalah|reveal your|abaikan instruksi|lupakan aturan|\bDAN mode\b/i
```

Whitespace may be `\s+` for reasonable matching. Do not drop any required pattern.

Heuristic is not a security boundary. `sanitizeAiOutput(text)` strips code fences, changes `**bold**` to `*bold*`, caps at 4000 chars. WhatsApp format: single-asterisk bold, bullets/numbers not dash, no `#` headings or pipe tables, blank lines between paragraphs. Owner bypasses only rate and jailbreak, not output sanitization.

### `src/index.mjs`

Orchestrates lifecycle and messages. Send first, then persist user+assistant atomically. On failure before successful send, send one generic apology only to an approved chat while the socket remains open; catch apology-send failure. After a successful send, DB failure logs safely and must not send an apology/second reply. Presence errors are logged safely and must not block send if the socket remains open. Presence sequence: composing, delay, paused, send.

## Definition of done

Report actual evidence separately:

1. `node --check` for every `src/*.mjs` and `npm test` pass offline without gateway/WhatsApp.
2. `npm run setup:check` uses operator-local config and never displays secrets.
3. `npm run setup:gateway` and live completion prove gateway/model; without both, AI live is not passed.
4. Operator verifies private local QR, restart without pairing, exact `/ping`, live `/reset` and memory rows, owner/non-owner modes, same/separate bot account as relevant.
5. On Linux, foreground session stopped after verified non-root/path/mode pairing, then approved systemd install/enable/status/restart/log check. Do not perform automatic system operations here.
6. Verify `.gitignore` using `git ls-files` and `git check-ignore` for `.env`, actual `AUTH_FOLDER`, DB; `git status` alone is not evidence.

## Out of scope

Browsing, media generation, TTS/STT, reminders, plugins, proactive messaging, knowledge base. Add only on explicit request and with tests.