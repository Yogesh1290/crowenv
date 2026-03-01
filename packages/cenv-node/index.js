#!/usr/bin/env node
'use strict';

/**
 * crowenv — Smart secrets. Like a crow. 🐦‍⬛
 * AES-256-GCM encrypted .cenv files that replace insecure plain .env
 * Zero runtime dependencies — uses Node.js built-in crypto module
 *
 * Commands:
 *   crowenv init         — set up .gitignore and show quick-start guide
 *   crowenv generate-key — generate a cryptographically random master key
 *   crowenv encrypt      — encrypt .env → .cenv
 *   crowenv decrypt      — decrypt .cenv → stdout (never writes plaintext to disk)
 *   crowenv load         — load .cenv into process.env and exec a command
 *   crowenv verify       — verify .cenv integrity without decrypting secrets
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Constants ────────────────────────────────────────────────────────────────
const MASTER_KEY_ENV = 'CENV_MASTER_KEY';
const CENV_VERSION = '1.0';
const PBKDF2_ITERATIONS = 600_000;
const KEY_LEN = 32;          // AES-256 → 32 bytes
const NONCE_LEN = 12;        // GCM standard: 96-bit nonce
const TAG_LEN = 16;          // GCM auth tag: 128-bit
const SALT_LEN = 16;         // PBKDF2 salt: 128-bit

// ─── Core Crypto ──────────────────────────────────────────────────────────────

/**
 * Derive a 256-bit AES key from the master password using PBKDF2-HMAC-SHA256.
 * @param {string} masterKey - The CENV_MASTER_KEY string
 * @param {Buffer} salt - 16-byte random salt
 * @returns {Buffer} 32-byte derived key
 */
function deriveKey(masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

/**
 * Encrypt a plain-object of secrets using AES-256-GCM.
 * @param {Object} secrets - Key-value pairs (env vars)
 * @param {string} masterKey - The master password
 * @returns {Object} .cenv JSON structure {v, s, d}
 */
function encryptSecrets(secrets, masterKey) {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = deriveKey(masterKey, salt);
  const nonce = crypto.randomBytes(NONCE_LEN);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // Payload: nonce(12) + tag(16) + ciphertext(N)
  const payload = Buffer.concat([nonce, tag, ciphertext]);

  return {
    v: CENV_VERSION,
    s: salt.toString('base64'),
    d: payload.toString('base64'),
  };
}

/**
 * Decrypt a .cenv JSON structure back to a plain-object.
 * Throws if the master key is wrong or the file was tampered with.
 * @param {Object} cenvData - Parsed .cenv JSON {v, s, d}
 * @param {string} masterKey - The master password
 * @returns {Object} Decrypted key-value secrets
 */
function decryptSecrets(cenvData, masterKey) {
  if (cenvData.v !== CENV_VERSION) {
    throw new Error(`Unsupported .cenv version: ${cenvData.v}. This tool supports v${CENV_VERSION}.`);
  }

  const salt = Buffer.from(cenvData.s, 'base64');
  const key = deriveKey(masterKey, salt);
  const payload = Buffer.from(cenvData.d, 'base64');

  if (payload.length < NONCE_LEN + TAG_LEN) {
    throw new Error('Malformed .cenv: payload too short.');
  }

  const nonce = payload.slice(0, NONCE_LEN);
  const tag = payload.slice(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ciphertext = payload.slice(NONCE_LEN + TAG_LEN);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);

  let decrypted;
  try {
    const part1 = decipher.update(ciphertext);
    const part2 = decipher.final(); // throws if auth tag fails
    decrypted = Buffer.concat([part1, part2]);
  } catch (_e) {
    // GCM authentication failed — wrong key or tampered file
    const err = new Error('Decryption failed: wrong master key or .cenv file was tampered with.');
    err.code = 'CENV_AUTH_FAILED';
    throw err;
  }

  return JSON.parse(decrypted.toString('utf8'));
}

// ─── .env Parser ──────────────────────────────────────────────────────────────

/**
 * Parse a .env file string into a key-value object.
 * Handles: comments (#), blank lines, quoted values, inline comments.
 * @param {string} text - Raw .env file content
 * @returns {Object} Parsed key-value pairs
 */
function parseEnvFile(text) {
  const result = {};
  const lines = text.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip blank lines and comments
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Strip inline comments (value must not be quoted for this)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    }

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) result[key] = value;
  }

  return result;
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

function readMasterKey() {
  const key = process.env[MASTER_KEY_ENV];
  if (!key) {
    console.error(`\n❌ Error: ${MASTER_KEY_ENV} is not set.\n`);
    console.error(`   Set it with:`);
    console.error(`   export CENV_MASTER_KEY="$(node -e "require('crypto').randomBytes(32).toString('hex')" console.log)"`)
    console.error(`   Or run: cenv generate-key\n`);
    process.exit(1);
  }
  return key;
}

function readCenvFile(filePath = '.cenv') {
  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ Error: ${filePath} not found.\n   Run: cenv encrypt\n`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`\n❌ Error: ${filePath} is not valid JSON: ${e.message}\n`);
    process.exit(1);
  }
}

// ─── CLI Commands ─────────────────────────────────────────────────────────────

function cmdInit() {
  // Update .gitignore
  const gitignorePath = path.resolve('.gitignore');
  let content = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';

  const entries = ['.env', '.cenv.keys'];
  let added = [];

  for (const entry of entries) {
    if (!content.split('\n').some(l => l.trim() === entry)) {
      content += (content.endsWith('\n') ? '' : '\n') + entry + '\n';
      added.push(entry);
    }
  }

  fs.writeFileSync(gitignorePath, content);

  console.log('\n🔐 cenv initialized!\n');
  console.log('✅ .gitignore updated' + (added.length ? ` (added: ${added.join(', ')})` : ' (already correct)'));
  console.log('\nNext steps:');
  console.log('  1. Generate a master key:   cenv generate-key');
  console.log('  2. Create your .env file:   DB_PASS=secret > .env');
  console.log('  3. Encrypt it:              cenv encrypt');
  console.log('  4. Delete plain .env:       del .env  (or rm .env)');
  console.log('  5. Commit .cenv safely:     git add .cenv');
  console.log('\n💡 Store CENV_MASTER_KEY in 1Password, macOS Keychain, or GitHub Secrets.\n');
}

function cmdGenerateKey() {
  const key = crypto.randomBytes(32).toString('hex'); // 64-char hex = 256 bits
  console.log('\n🔑 Your new master key (256-bit random):');
  console.log(`\n   ${key}\n`);
  console.log('Save this in your password manager, then:');
  console.log(`   export CENV_MASTER_KEY="${key}"`);
  console.log('\n⚠️  If you lose this key, your .cenv cannot be recovered.\n');
}

function cmdEncrypt(envFile = '.env', outFile = '.cenv') {
  if (!fs.existsSync(envFile)) {
    console.error(`\n❌ Error: ${envFile} not found.\n   Create it first, then run: cenv encrypt\n`);
    process.exit(1);
  }

  const masterKey = readMasterKey();
  const envText = fs.readFileSync(envFile, 'utf8');
  const secrets = parseEnvFile(envText);

  const count = Object.keys(secrets).length;
  if (count === 0) {
    console.error('\n⚠️  Warning: .env file has no parseable key=value pairs.\n');
  }

  const encrypted = encryptSecrets(secrets, masterKey);
  fs.writeFileSync(outFile, JSON.stringify(encrypted, null, 2), 'utf8');

  console.log(`\n✅ ${outFile} created and encrypted (${count} secrets)!`);
  console.log(`   Algorithm: AES-256-GCM + PBKDF2-SHA256 (${PBKDF2_ITERATIONS.toLocaleString()} iterations)`);
  console.log(`   Safe to commit: git add ${outFile}`);
  console.log(`\n🗑️  Now delete your plain .env: del .env\n`);
}

function cmdDecrypt(cenvFile = '.cenv') {
  const masterKey = readMasterKey();
  const cenvData = readCenvFile(cenvFile);
  const secrets = decryptSecrets(cenvData, masterKey);

  console.log('\n🔓 Decrypted secrets (DO NOT log this in production):\n');
  for (const [k, v] of Object.entries(secrets)) {
    console.log(`   ${k}=${v}`);
  }
  console.log('');
}

function cmdLoad(cenvFile = '.cenv', execArgs = []) {
  const masterKey = readMasterKey();
  const cenvData = readCenvFile(cenvFile);
  const secrets = decryptSecrets(cenvData, masterKey);

  // Load into current process.env
  Object.assign(process.env, secrets);
  console.log(`✅ .cenv loaded (${Object.keys(secrets).length} secrets injected into process.env)`);

  // If extra args provided, exec them as a subprocess with the enriched env
  if (execArgs.length > 0) {
    const [cmd, ...args] = execArgs;
    try {
      execFileSync(cmd, args, { stdio: 'inherit', env: process.env });
    } catch (e) {
      process.exit(e.status || 1);
    }
  }
}

function cmdVerify(cenvFile = '.cenv') {
  const masterKey = readMasterKey();
  const cenvData = readCenvFile(cenvFile);

  console.log(`\n🔍 Verifying ${cenvFile}...\n`);
  console.log(`   Version:    ${cenvData.v}`);
  console.log(`   Salt:       ${cenvData.s?.length} chars (base64)`);
  console.log(`   Payload:    ${cenvData.d?.length} chars (base64)`);

  try {
    const secrets = decryptSecrets(cenvData, masterKey);
    const keys = Object.keys(secrets);
    console.log(`\n✅ Integrity verified! ${keys.length} secret(s) found.`);
    console.log(`   Keys: ${keys.join(', ')}\n`);
  } catch (e) {
    console.error(`\n❌ Verification FAILED: ${e.message}\n`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
crowenv v1.0 — Smart secrets. Like a crow. 🐦‍⬛
AES-256-GCM encrypted .cenv replacement for plain .env

Usage:
  crowenv <command> [options]

Commands:
  init                   Initialize project (.gitignore setup)
  generate-key           Generate a new 256-bit master key
  encrypt [envFile]      Encrypt .env → .cenv  (default: .env → .cenv)
  decrypt [cenvFile]     Decrypt .cenv → stdout (default: .cenv)
  load [cenvFile] [--] [cmd...]
                         Load .cenv into env, optionally exec a command
  verify [cenvFile]      Verify .cenv integrity (default: .cenv)

Environment:
  CENV_MASTER_KEY        Required: your master password / 256-bit key

Examples:
  crowenv init
  crowenv generate-key
  echo "DB_PASS=secret" > .env && crowenv encrypt
  crowenv verify
  crowenv load -- node server.js
  crowenv load -- python app.py

Format:  .cenv v1.0 (AES-256-GCM + PBKDF2-SHA256, 600k iterations)
GitHub:  https://github.com/Yogesh1290/crowenv
Spec:    https://github.com/Yogesh1290/crowenv/blob/main/SPEC.md
`);
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'init': cmdInit(); break;
  case 'generate-key': cmdGenerateKey(); break;
  case 'encrypt': cmdEncrypt(rest[0] || '.env', rest[1] || '.cenv'); break;
  case 'decrypt': cmdDecrypt(rest[0] || '.cenv'); break;
  case 'load': {
    // Allow: cenv load [cenvFile] [-- cmd args...]
    const dashIdx = rest.indexOf('--');
    const cenvArg = (dashIdx === 0 || rest[0] === '--') ? '.cenv' : (rest[0] || '.cenv');
    const execArgs = dashIdx !== -1 ? rest.slice(dashIdx + 1) : [];
    cmdLoad(cenvArg, execArgs);
    break;
  }
  case 'verify': cmdVerify(rest[0] || '.cenv'); break;
  case undefined:
  case '--help':
  case '-h':
  case 'help': printHelp(); break;
  default:
    console.error(`\n❌ Unknown command: ${cmd}\n   Run: cenv --help\n`);
    process.exit(1);
}
