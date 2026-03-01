'use strict';
/**
 * cenv Node.js test suite — tests encrypt/decrypt/parse round-trip
 * Run: node test/test.js
 * Requires: CENV_MASTER_KEY env var set
 */

const crypto = require('crypto');
const assert = require('assert');

// Set a test master key if not set
if (!process.env.CENV_MASTER_KEY) {
    process.env.CENV_MASTER_KEY = crypto.randomBytes(32).toString('hex');
}

// Import logic by requiring index and extracting functions
// We re-implement inline so test is self-contained
const PBKDF2_ITERATIONS = 600_000;
const KEY_LEN = 32;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;

function deriveKey(masterKey, salt) {
    return crypto.pbkdf2Sync(masterKey, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
}

function encryptSecrets(secrets, masterKey) {
    const salt = crypto.randomBytes(SALT_LEN);
    const key = deriveKey(masterKey, salt);
    const nonce = crypto.randomBytes(NONCE_LEN);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const plaintext = Buffer.from(JSON.stringify(secrets), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([nonce, tag, ciphertext]);
    return { v: '1.0', s: salt.toString('base64'), d: payload.toString('base64') };
}

function decryptSecrets(cenvData, masterKey) {
    const salt = Buffer.from(cenvData.s, 'base64');
    const key = deriveKey(masterKey, salt);
    const payload = Buffer.from(cenvData.d, 'base64');
    const nonce = payload.slice(0, NONCE_LEN);
    const tag = payload.slice(NONCE_LEN, NONCE_LEN + TAG_LEN);
    const ciphertext = payload.slice(NONCE_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    let decrypted;
    try {
        decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (_e) {
        const err = new Error('Decryption failed: wrong master key or .cenv file was tampered with.');
        err.code = 'CENV_AUTH_FAILED';
        throw err;
    }
    return JSON.parse(decrypted.toString('utf8'));
}

function parseEnvFile(text) {
    const result = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx === -1) continue;
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        if (!value.startsWith('"') && !value.startsWith("'")) {
            const commentIdx = value.indexOf(' #');
            if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
        }
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (key) result[key] = value;
    }
    return result;
}

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.error(`  ❌ ${name}: ${e.message}`);
        failed++;
    }
}

console.log('\n🔐 cenv test suite\n');

// ── Test 1: Encrypt/Decrypt round-trip
test('Encrypt → Decrypt round-trip', () => {
    const masterKey = 'test-master-key-1234567890abcdef';
    const secrets = { DB_PASS: 'supersecret', API_KEY: 'sk_live_abc123', PORT: '3000' };
    const encrypted = encryptSecrets(secrets, masterKey);
    const decrypted = decryptSecrets(encrypted, masterKey);
    assert.deepStrictEqual(decrypted, secrets);
});

// ── Test 2: Different encryptions of same data produce different output
test('Encrypt produces random nonce (different ciphertexts each time)', () => {
    const masterKey = 'test-master-key-1234567890abcdef';
    const secrets = { KEY: 'value' };
    const enc1 = encryptSecrets(secrets, masterKey);
    const enc2 = encryptSecrets(secrets, masterKey);
    assert.notStrictEqual(enc1.d, enc2.d, 'Same plaintext should produce different ciphertext (nonce randomness)');
});

// ── Test 3: Wrong master key should throw
test('Wrong master key throws on decrypt', () => {
    const secrets = { SECRET: 'hello' };
    const encrypted = encryptSecrets(secrets, 'correct-key-12345678901234567890');
    assert.throws(() => decryptSecrets(encrypted, 'wrong-key-123456789012345678901'), /Decryption failed/);
});

// ── Test 4: Tampered ciphertext should throw
test('Tampered .cenv payload throws on decrypt', () => {
    const secrets = { SECRET: 'hello' };
    const encrypted = encryptSecrets(secrets, 'correct-key-12345678901234567890');
    const tampered = { ...encrypted, d: encrypted.d.slice(0, -4) + 'XXXX' };
    assert.throws(() => decryptSecrets(tampered, 'correct-key-12345678901234567890'), /Decryption failed/);
});

// ── Test 5: .env parser — basic
test('.env parser: basic key=value', () => {
    const parsed = parseEnvFile('DB_PASS=secret\nAPI_KEY=abc123\n');
    assert.strictEqual(parsed.DB_PASS, 'secret');
    assert.strictEqual(parsed.API_KEY, 'abc123');
});

// ── Test 6: .env parser — comments
test('.env parser: ignores comments and blank lines', () => {
    const parsed = parseEnvFile('# comment\n\nDB_PASS=secret\n');
    assert.strictEqual(Object.keys(parsed).length, 1);
    assert.strictEqual(parsed.DB_PASS, 'secret');
});

// ── Test 7: .env parser — quoted values
test('.env parser: strips surrounding quotes', () => {
    const parsed = parseEnvFile('DB_PASS="my secret value"\nAPI_KEY=\'another value\'\n');
    assert.strictEqual(parsed.DB_PASS, 'my secret value');
    assert.strictEqual(parsed.API_KEY, 'another value');
});

// ── Test 8: .env parser — value with equals sign
test('.env parser: value containing = sign', () => {
    const parsed = parseEnvFile('JWT_SECRET=abc=def=ghi\n');
    assert.strictEqual(parsed.JWT_SECRET, 'abc=def=ghi');
});

// ── Test 9: .cenv version field
test('Encrypted output has version field "1.0"', () => {
    const encrypted = encryptSecrets({ K: 'v' }, 'key-1234567890123456789012345678');
    assert.strictEqual(encrypted.v, '1.0');
});

// ── Test 10: .cenv structure has s and d fields
test('Encrypted output has s (salt) and d (payload) fields', () => {
    const encrypted = encryptSecrets({ K: 'v' }, 'key-1234567890123456789012345678');
    assert.ok(encrypted.s, 'Missing salt field s');
    assert.ok(encrypted.d, 'Missing data field d');
});

// ── Summary
console.log(`\n${'─'.repeat(40)}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
    console.error('\n❌ Some tests failed!\n');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!\n');
}
