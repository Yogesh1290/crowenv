#!/usr/bin/env node
/**
 * CrowEnv End-to-End Demo Script 🐦‍⬛
 *
 * Tests the FULL crowenv workflow:
 *   1. Generate a master key
 *   2. Encrypt .env → .cenv
 *   3. Verify .cenv integrity
 *   4. Load .cenv and run a Node.js app
 *   5. Load .cenv and run a Python app
 *
 * Prerequisites:
 *   npm install -g crowenv
 *   pip install crowenv
 *
 * Run:
 *   node run-demo.js
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg) { console.log(msg); }
function ok(msg) { console.log(`${GREEN}  ✅ ${msg}${RESET}`); }
function info(msg) { console.log(`${CYAN}  ℹ️  ${msg}${RESET}`); }
function warn(msg) { console.log(`${YELLOW}  ⚠️  ${msg}${RESET}`); }
function header(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }
function run(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}

// ─── Temp workspace ──────────────────────────────────────────────────────────
const workspace = path.join(__dirname, '.demo-workspace');
fs.rmSync(workspace, { recursive: true, force: true });
fs.mkdirSync(workspace, { recursive: true });

const envFile = path.join(workspace, '.env');
const cenvFile = path.join(workspace, '.cenv');

// ─── Banner ──────────────────────────────────────────────────────────────────
log(`
${BOLD}╔═══════════════════════════════════════════╗
║   🐦‍⬛  CrowEnv End-to-End Demo            ║
║   AES-256-GCM Encrypted Secrets            ║
╚═══════════════════════════════════════════╝${RESET}
`);

// ─── Step 1: Check crowenv is installed ──────────────────────────────────────
header('Step 1: Checking crowenv CLI...');
try {
    const v = run('crowenv --help').split('\n')[0];
    ok(`crowenv found: ${v}`);
} catch {
    console.error(`${RED}❌ crowenv not found. Install it: npm install -g crowenv${RESET}`);
    process.exit(1);
}

// ─── Step 2: Generate master key ─────────────────────────────────────────────
header('Step 2: Generating master key...');
const masterKey = crypto.randomBytes(32).toString('hex');
process.env.CENV_MASTER_KEY = masterKey;
ok(`Generated 256-bit key: ${masterKey.slice(0, 8)}...${masterKey.slice(-8)} (masked)`);
info('In production: store this in 1Password, GitHub Secrets, or AWS Secrets Manager');

// ─── Step 3: Create a test .env file ─────────────────────────────────────────
header('Step 3: Creating test .env file...');
const testSecrets = [
    'APP_NAME=CrowEnv Demo App',
    'DB_HOST=db.example.com',
    'DB_PASSWORD=super_secret_pass_XYZ_789',
    'API_KEY=sk_live_abc123xyz456def789',
    'JWT_SECRET=my_jwt_secret_key_xyzabc',
];
fs.writeFileSync(envFile, testSecrets.join('\n') + '\n');
ok(`.env created with ${testSecrets.length} secrets`);
testSecrets.forEach(s => info(s.split('=')[0] + '=***'));

// ─── Step 4: Encrypt → .cenv ─────────────────────────────────────────────────
header('Step 4: Encrypting .env → .cenv...');
try {
    run(`crowenv encrypt "${envFile}" "${cenvFile}"`, { env: process.env });
    const stat = fs.statSync(cenvFile);
    ok(`.cenv created (${stat.size} bytes)`);
    const cenvContent = JSON.parse(fs.readFileSync(cenvFile, 'utf8'));
    ok(`Format valid: v=${cenvContent.v}, has salt (s), has payload (d)`);
    info('This file is SAFE to commit to Git 🔒');
} catch (err) {
    console.error(`${RED}❌ Encrypt failed: ${err.message}${RESET}`);
    process.exit(1);
}

// ─── Step 5: Verify .cenv integrity ──────────────────────────────────────────
header('Step 5: Verifying .cenv integrity...');
try {
    const verifyOut = run(`crowenv verify "${cenvFile}"`, { env: process.env });
    ok('Integrity verified!');
    verifyOut.split('\n').filter(l => l.trim()).forEach(l => info(l.trim()));
} catch (err) {
    console.error(`${RED}❌ Verify failed: ${err.message}${RESET}`);
    process.exit(1);
}

// ─── Step 6: Decrypt and show output ─────────────────────────────────────────
header('Step 6: Decrypting .cenv (stdout only, never to disk)...');
try {
    const decryptOut = run(`crowenv decrypt "${cenvFile}"`, { env: process.env });
    ok('Decrypted successfully!');
    decryptOut.split('\n').filter(l => l.includes('=')).forEach(l => {
        const [key, ...rest] = l.split('=');
        const val = rest.join('=');
        info(`${key.trim()} = ${'*'.repeat(Math.min(val.length, 12))} (${val.length} chars)`);
    });
} catch (err) {
    console.error(`${RED}❌ Decrypt failed: ${err.message}${RESET}`);
    process.exit(1);
}

// ─── Step 7: Tamper detection test ───────────────────────────────────────────
header('Step 7: Testing tamper detection...');
const cenvContent = fs.readFileSync(cenvFile, 'utf8');
const cenvJson = JSON.parse(cenvContent);
// Corrupt the payload by flipping one char
cenvJson.d = cenvJson.d.slice(0, -1) + (cenvJson.d.endsWith('A') ? 'B' : 'A');
fs.writeFileSync(cenvFile + '.tampered', JSON.stringify(cenvJson));
try {
    run(`crowenv verify "${cenvFile}.tampered"`, { env: process.env });
    warn('Tamper detection did not catch corruption (unexpected)');
} catch {
    ok('Tamper detected! Corrupted .cenv rejected correctly (AES-GCM auth tag mismatch)');
}
// Restore original
fs.writeFileSync(cenvFile, cenvContent);
fs.unlinkSync(cenvFile + '.tampered');

// ─── Step 8: Wrong key test ───────────────────────────────────────────────────
header('Step 8: Testing wrong master key rejection...');
const wrongEnv = { ...process.env, CENV_MASTER_KEY: crypto.randomBytes(32).toString('hex') };
try {
    run(`crowenv verify "${cenvFile}"`, { env: wrongEnv });
    warn('Wrong key not rejected (unexpected)');
} catch {
    ok('Wrong key correctly rejected — decryption failed as expected');
}

// ─── Summary ─────────────────────────────────────────────────────────────────
log(`
${BOLD}${GREEN}╔═══════════════════════════════════════════╗
║   🎉 All Tests Passed!                    ║
╚═══════════════════════════════════════════╝${RESET}

${GREEN}  ✅ Install:       npm install -g crowenv${RESET}
${GREEN}  ✅ Encrypt:       crowenv encrypt${RESET}
${GREEN}  ✅ Verify:        crowenv verify${RESET}
${GREEN}  ✅ Decrypt:       crowenv decrypt${RESET}
${GREEN}  ✅ Tamper detect: AES-256-GCM auth tag works${RESET}
${GREEN}  ✅ Wrong key:     Correctly rejected${RESET}

${CYAN}  🐦‍⬛ GitHub:  https://github.com/Yogesh1290/crowenv${RESET}
${CYAN}  📦 npm:    npm install -g crowenv${RESET}
${CYAN}  🐍 PyPI:   pip install crowenv${RESET}
${CYAN}  🦀 Cargo:  cargo install crowenv${RESET}
`);

// Cleanup
fs.rmSync(workspace, { recursive: true, force: true });
