#!/usr/bin/env node
/**
 * Interactive configuration wizard.
 *
 * Writes a `.env` file without ever echoing secrets to the terminal or to logs.
 *
 *   node setup.mjs              Interactive. Requires a TTY.
 *   node setup.mjs --check          Print a masked summary and validate completeness.
 *   node setup.mjs --gateway-check Ask the configured gateway for /v1/models.
 *   node setup.mjs --from-env   Non-interactive. Read values from environment variables.
 *   node setup.mjs --help
 *
 * Zero dependencies. Works on Linux, macOS and Windows.
 * An empty answer keeps the previously stored value.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import process from 'node:process';
import { parseEnv } from 'node:util';

const ENV_PATH = path.resolve('.env');
const SECRET_KEYS = new Set(['NINEROUTER_API_KEY', 'OWNER_NUMBER', 'OWNER_LID']);
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const args = new Set(process.argv.slice(2));

/** Normalize separators only; operator must enter international country code. */
function toDigits(raw) {
  return String(raw).replace(/[ +().-]/g, '');
}

function validPhone(value) {
  return /^\d{8,15}$/.test(value) && !value.startsWith('0');
}

function validTimeZone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

/** Encode only forms that Node's native --env-file parser round-trips exactly. */
function serializeEnvValue(value) {
  const text = String(value);
  if (CONTROL.test(text)) throw new Error('Configuration values cannot contain control characters.');
  if (!/[#'"`\\\s]/.test(text)) return text;
  const candidates = ["'", '"', '`'].filter((q) => !text.includes(q)).map((q) => `${q}${text}${q}`);
  const safe = candidates.find((candidate) => {
    try { return parseEnv(`VALUE=${candidate}`).VALUE === text; } catch { return false; }
  });
  if (!safe) throw new Error('Value cannot be represented safely in .env.');
  return safe;
}

/**
 * Every field declares how it is explained to a non-technical operator:
 *   label    short name shown in the header
 *   help     plain-language explanation, one line per array entry
 *   example  a realistic sample value
 *   def      default applied when the operator presses Enter
 */
const FIELDS = [
  {
    key: 'NINEROUTER_URL',
    label: 'AI gateway base URL',
    help: [
      'The address of the service that generates replies.',
      'If the gateway runs on the same machine as this bot, keep the default.',
      'If it runs elsewhere, replace the host with that machine IP address.',
      'Remote HTTP sends prompts and tokens without encryption; use HTTPS for remote gateways.',
      'Do not append /v1/chat/completions here.',
    ],
    example: 'http://127.0.0.1:20128',
    def: 'http://127.0.0.1:20128',
    validate: (v) => {
      try {
        const url = new URL(v);
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return 'Use an HTTP(S) base URL without credentials, query or fragment';
        if (/\/v1(?:\/|$)/i.test(url.pathname) || /\/chat\/completions\/?$/i.test(url.pathname)) return 'Enter the base URL without /v1 or /chat/completions';
        return null;
      } catch {
        return 'Enter a valid HTTP(S) URL';
      }
    },
  },
  {
    key: 'NINEROUTER_API_KEY',
    label: 'AI gateway access token',
    help: [
      'Acts as the password for the gateway above.',
      'If your gateway accepts unauthenticated requests, enter: none',
      'This value is a secret. It is masked with asterisks while you type.',
    ],
    example: 'none   or   sk-xxxxxxxxxxxxxxxx',
    def: 'none',
  },
  {
    key: 'NINEROUTER_MODEL',
    label: 'Model identifier',
    help: [
      'The model the bot will use to answer messages.',
      'It must exist on your gateway. List available IDs with:',
      '  curl -s http://127.0.0.1:20128/v1/models',
    ],
    example: 'model ID shown by the gateway',
    def: 'wa-combo',
  },
  {
    key: 'OWNER_NUMBER',
    label: 'Your WhatsApp number',
    help: [
      'The phone number allowed to talk to this bot.',
      'Enter your own number, not the bot number.',
      'Include the country code. Spaces, +, parentheses and hyphens are removed automatically.',
      'This value is a secret. It is masked with asterisks while you type.',
    ],
    example: '6281234567890',
    normalize: toDigits,
    validate: (v) => (validPhone(v) ? null : 'Must be 8 to 15 international digits, without + or leading 0'),
  },
  {
    key: 'OWNER_LID',
    label: 'Owner linked-device identifier (optional)',
    help: [
      'Some WhatsApp accounts deliver the sender identity as a numeric LID.',
      'Fill this only if the bot ignores your messages even though OWNER_NUMBER is correct.',
      'To find the value: start the bot, send one message from your phone,',
      'then use a local private diagnostic only for operator troubleshooting.',
      'Press Enter to skip. This value is a secret and is masked while typing.',
    ],
    example: '123456789012345   (or leave empty)',
    optional: true,
    validate: (v) => (!v || /^\d{1,20}$/.test(v) ? null : 'Must be a numeric LID of at most 20 digits'),
  },
  {
    key: 'TZ',
    label: 'Timezone',
    help: ['Zona waktu IANA untuk waktu lokal dalam balasan.', 'Tekan Enter untuk memakai zona waktu yang terdeteksi.'],
    example: 'Asia/Jakarta',
    def: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    validate: (v) => (validTimeZone(v) ? null : 'Harus berupa zona waktu IANA yang valid'),
  },
  {
    key: 'AGENT_NAME',
    label: 'Assistant name',
    help: [
      'The name the assistant uses for itself.',
      'There is no default. Pick anything you like; this is a product decision, not a technical one.',
    ],
    example: '(choose your own name)',
        validate: (v) => (v.trim() && v.length <= 30 && !/[\r\n\u0000-\u001f\u007f]/.test(v) ? null : 'Enter 1 to 30 non-blank characters without control characters'),
  },
  {
    key: 'CHAT_MODE',
    label: 'Who may talk to the bot',
    help: [
      'owner_only  only the OWNER_NUMBER account (recommended)',
      'self_only   only the "Message yourself" chat',
      'dm_only     any direct message, group chats ignored',
      'all         direct messages and group chats',
    ],
    example: 'owner_only',
    def: 'owner_only',
    validate: (v) => (['self_only', 'owner_only', 'dm_only', 'all'].includes(v) ? null : 'Not a valid option'),
  },
  {
    key: 'AUTH_FOLDER',
    label: 'WhatsApp session folder',
    help: [
      'Where the WhatsApp login keys are stored after you scan the QR code.',
      'Keep the default. Never share or commit this folder.',
    ],
    example: 'auth_info_baileys',
    def: 'auth_info_baileys',
    validate: (v) => (v.trim() ? null : 'Must not be empty'),
  },
];

function validateValues(values) {
  for (const field of FIELDS) {
    const value = values[field.key] ?? '';
    if (CONTROL.test(String(value))) return `${field.key}: control characters are not allowed`;
    if (!value) {
      if (!field.optional && field.def === undefined) return `${field.key} is required`;
      continue;
    }
    const error = field.validate?.(value);
    if (error) return `${field.key}: ${error}`;
  }
  return null;
}

/** Partially hide secret values without ever revealing the whole value. */
function mask(key, value) {
  if (!value) return '';
  if (!SECRET_KEYS.has(key)) return value;
  if (key === 'NINEROUTER_API_KEY' && value === 'none') return 'none';
  if (value.length < 10) return '*'.repeat(value.length);
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}

/** Atomic write with restrictive permissions. */
function writeEnv(obj) {
  const body = `${Object.entries(obj)
    .map(([key, value]) => `${key}=${serializeEnvValue(value)}`)
    .join('\n')}\n`;
  const tmp = `${ENV_PATH}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, body, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, ENV_PATH);
    if (process.platform !== 'win32') fs.chmodSync(ENV_PATH, 0o600);
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw new Error('Could not save .env. Check path and permissions.');
  }
}

async function checkGateway() {
  const base = (current.NINEROUTER_URL || 'http://127.0.0.1:20128').replace(/\/+$/, '');
  const model = current.NINEROUTER_MODEL || 'wa-combo';
  const key = current.NINEROUTER_API_KEY || 'none';
  try {
    const response = await fetch(`${base}/v1/models`, {
      headers: key === 'none' ? {} : { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) {
      console.error(`Gateway returned HTTP ${response.status}. Response body hidden.`);
      process.exitCode = 1; return;
    }
    const parsed = JSON.parse(await response.text());
    if (!parsed || !Array.isArray(parsed.data)) throw new Error('invalid response');
    const ids = parsed.data.filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => item.id);
    const clean = (text) => {
      let safe = String(text);
      for (const key of SECRET_KEYS) {
        const value = current[key];
        if (value && value !== 'none') safe = safe.split(value).join('[redacted]');
      }
      return safe.replace(/[\u0000-\u001f\u007f-\u009f]/g, '?').slice(0, 100);
    };
    if (!ids.length) throw new Error('missing model IDs');
    console.log(`Gateway OK: ${base}`);
    console.log(`Models: ${ids.map(clean).join(', ')}`);
    if (!ids.includes(model)) {
      console.error(`Configured model "${clean(model)}" is not listed. Update NINEROUTER_MODEL.`);
      process.exitCode = 1; return;
    }
    console.log(`Configured model "${clean(model)}" is listed.`);
  } catch {
    console.error('Gateway check failed. Verify gateway URL, network, response format, and model configuration.');
    process.exitCode = 1;
  }
}

/**
 * A single readline interface serves the whole session. Secret answers are
 * masked by intercepting the echo instead of opening a raw-mode stream, which
 * keeps behaviour identical on TTY, on pipes and on Windows.
 */
function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: Boolean(process.stdin.isTTY),
  });
  let muted = false;

  rl._writeToOutput = function writeToOutput(chunk) {
    const text = String(chunk);
    if (!muted) {
      rl.output.write(text);
      return;
    }
    const safe = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
    if (safe) rl.output.write('*'.repeat([...safe].length));
  };

  return {
    async ask(prompt, { secret = false } = {}) {
      if (secret) rl.output.write(prompt);
      muted = secret;
      try {
        return await rl.question(secret ? '' : prompt);
      } finally {
        muted = false;
      }
    },
    close() {
      rl.close();
    },
  };
}

function printHeader(field, index, total, existing) {
  const line = '─'.repeat(48);
  const bad = existing && (CONTROL.test(String(existing)) || field.validate?.(existing));
  console.log(`\n${line}`);
  console.log(`[${index}/${total}] ${field.label}`);
  for (const text of field.help) console.log(`  ${text}`);
  console.log(`  Example: ${field.example}`);
  console.log(`  Current: ${bad ? '(invalid; replace)' : mask(field.key, existing) || '(empty)'}`);
  if (field.def !== undefined) console.log(`  Press Enter to use the default: ${field.def}`);
  else if (field.optional) console.log('  Press Enter to leave this empty.');
  console.log(line);
}

function representable(value) {
  try { serializeEnvValue(value); return null; } catch (error) { return error.message; }
}

if (args.has('--help') || args.has('-h')) {
  console.log(
    [
      'Usage:',
      '  node setup.mjs              Interactive configuration (requires a terminal)',
      '  node setup.mjs --check      Masked summary and completeness check',
      '  node setup.mjs --gateway-check  Check gateway models and configured model',
      '  node setup.mjs --from-env   Non-interactive, reads environment variables',
      '',
      'Managed keys:',
      ...FIELDS.map((f) => {
        const tag = f.optional ? '(optional)' : f.def !== undefined ? `(default: ${f.def})` : '(required)';
        return `  ${f.key.padEnd(20)} ${tag}`;
      }),
    ].join('\n')
  );
  process.exit(0);
}

let current = {};
try {
  if (fs.existsSync(ENV_PATH) && fs.lstatSync(ENV_PATH).isSymbolicLink()) {
    console.error('.env must not be a symbolic link. Refusing to read or overwrite it.');
    process.exit(1);
  }
  current = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
} catch {
  console.error('Could not read or parse .env safely.');
  process.exit(1);
}

if (args.has('--check')) {
  let missing = 0;
  for (const f of FIELDS) {
    const value = current[f.key] ?? '';
    const required = !f.optional && f.def === undefined;
    const error = value ? (CONTROL.test(String(value)) ? 'control characters are not allowed' : f.validate?.(value)) : null;
    let status;
    if (value && !error) status = mask(f.key, value);
    else if (error) { status = '(INVALID)'; missing += 1; }
    else if (f.optional) status = '(empty, optional)';
    else if (f.def !== undefined) status = `(default: ${f.def})`;
    else { status = '(MISSING)'; if (required) missing += 1; }
    console.log(`${f.key}=${status}`);
  }
  if (missing) {
    console.log(`\n${missing} required or invalid value(s). Run: node setup.mjs`);
    process.exit(2);
  }
  console.log('\nConfiguration complete. Start the bot with: npm start');
  process.exit(0);
}

if (args.has('--gateway-check')) {
  const missing = validateValues(current);
  if (missing) {
    console.error(`${missing}\nRun: node setup.mjs`);
    process.exit(2);
  }
  await checkGateway();
  process.exit(process.exitCode ?? 0);
}

if (args.has('--from-env')) {
  const next = { ...current };
  const missing = [];
  for (const f of FIELDS) {
    const raw = process.env[f.key];
    if (raw === undefined || raw === '') {
      if (current[f.key] && (CONTROL.test(String(current[f.key])) || f.validate?.(current[f.key]))) {
        console.error(`${f.key}: stored value is invalid; provide a valid replacement`);
        process.exit(1);
      }
      if (f.def !== undefined) {
        next[f.key] = current[f.key] || f.def;
        continue;
      }
      if (f.optional) {
        next[f.key] = current[f.key] ?? '';
        continue;
      }
      if (!current[f.key]) missing.push(f.key);
      continue;
    }
    if (CONTROL.test(raw)) { console.error(`${f.key}: control characters are not allowed`); process.exit(1); }
    const value = f.normalize ? f.normalize(raw) : raw;
        const err = f.validate?.(value) || representable(value);
    if (err) {
      console.error(`${f.key}: ${err}`);
      process.exit(1);
    }
    next[f.key] = value;
  }
  if (missing.length) {
    console.error(`Missing required values: ${missing.join(', ')}`);
    process.exit(1);
  }
  const invalid = validateValues(next);
  if (invalid) { console.error(invalid); process.exit(1); }
  try { writeEnv(next); } catch { console.error('Could not save .env. Check path and permissions.'); process.exit(1); }
  console.log('.env written.');
  for (const f of FIELDS) console.log(`  ${f.key}=${mask(f.key, next[f.key] ?? '')}`);
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error(
    'Error: interactive configuration needs a terminal.\n' +
      'Run `node setup.mjs` in a normal shell, not through a pipe.\n' +
      'For automation use `node setup.mjs --from-env`.'
  );
  process.exit(1);
}

console.log('\n=== WhatsApp Agent Configuration ===');
console.log('Each question is explained in plain language and includes an example.');
console.log('Secret values are masked with asterisks while you type.');
console.log('Press Enter to accept the default or keep the stored value.');
console.log('Press Ctrl+C at any time to abort without writing anything.\n');

const prompter = createPrompter();
const next = { ...current };
let aborted = false;

try {
  outer: for (let i = 0; i < FIELDS.length; i += 1) {
    const field = FIELDS[i];
    const existing = current[field.key] ?? '';
    printHeader(field, i + 1, FIELDS.length, existing);

    for (;;) {
      const prompt = SECRET_KEYS.has(field.key)
        ? '  Type your answer (hidden), then Enter: '
        : '  Type your answer, then Enter: ';
      let raw;
      try { raw = await prompter.ask(prompt, { secret: SECRET_KEYS.has(field.key) }); }
      catch { console.error('Input ended. No changes written.'); aborted = true; break outer; }
      raw = String(raw);
      if (CONTROL.test(raw)) { console.log('  ! Control characters are not allowed.'); continue; }
            raw = raw.trim();

      if (!raw) {
        if (existing && (CONTROL.test(String(existing)) || field.validate?.(existing))) {
          console.log('  ! Stored value is invalid. Enter a valid replacement.');
          continue;
        }
        if (existing) {
          console.log(`  → keeping stored value: ${mask(field.key, existing)}`);
          break;
        }
        if (field.optional) {
          next[field.key] = '';
          console.log('  → skipped.');
          break;
        }
        if (field.def !== undefined) {
          next[field.key] = field.def;
          console.log(`  → using default: ${field.def}`);
          break;
        }
        console.log(`  ! This field is required. Example: ${field.example}`);
        continue;
      }

      const value = field.normalize ? field.normalize(raw) : raw;
            const err = field.validate?.(value) || representable(value);
      if (err) {
        console.log(`  ! ${err}. Expected something like: ${field.example}`);
        continue;
      }
      next[field.key] = value;
      console.log(`  → saved: ${mask(field.key, value)}`);
      break;
    }
  }
} finally {
  prompter.close();
}
if (aborted) process.exit(1);
const invalidNext = validateValues(next);
if (invalidNext) { console.error(invalidNext); process.exit(1); }
try { writeEnv(next); } catch { console.error('Could not save .env. Check path and permissions.'); process.exit(1); }

console.log('\n=== Done ===');
console.log(process.platform === 'win32' ? '.env written. Windows permissions depend on directory ACLs.\n' : '.env written with mode 600 (owner read/write only).\n');
console.log('Summary (secrets masked):');
for (const f of FIELDS) console.log(`  ${f.key}=${mask(f.key, next[f.key] ?? '')}`);

console.log('\nNext steps:');
console.log('  1. Start the bot:   npm start');
console.log('  2. Scan the QR code with WhatsApp → Linked devices.');
if (!next.OWNER_LID) {
  console.log(
    '  3. If the bot ignores your messages, run `npm run setup` again and set OWNER_LID\n' +
      '     using a private local diagnostic; do not share logs.'
  );
}
console.log('\nRestart the bot after changing .env for the new values to take effect.');