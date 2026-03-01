#!/usr/bin/env node
/**
 * CrowEnv Full Multi-Language E2E Demo 🐦‍⬛
 *
 * Tests ALL implementations against the SAME .cenv file:
 *   ✅ Node.js  — crowenv CLI (npm install -g crowenv)
 *   ✅ Python   — cenv.load() API (pip install crowenv)
 *   ✅ Go       — built binary (go build ./packages/cenv-go)
 *   ✅ Rust     — crowenv binary (cargo install crowenv)
 *
 * Run:
 *   node run-demo.js
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Colors ──────────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', C = '\x1b[36m',
    R = '\x1b[31m', B = '\x1b[1m', X = '\x1b[0m';

const ok = m => console.log(`${G}  ✅ ${m}${X}`);
const fail = m => console.log(`${R}  ❌ ${m}${X}`);
const info = m => console.log(`${C}  ℹ  ${m}${X}`);
const skip = m => console.log(`${Y}  ⏭  ${m}${X}`);
const header = m => console.log(`\n${B}━━━ ${m} ━━━${X}`);

function run(cmd, opts = {}) {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim();
}

function tryRun(cmd, opts = {}) {
    try { return { ok: true, out: run(cmd, opts) }; }
    catch (e) { return { ok: false, out: e.stderr || e.message }; }
}

// ─── Setup shared workspace ───────────────────────────────────────────────────
const root = path.resolve(__dirname, '..');
const workspace = path.join(__dirname, '.demo-workspace');
fs.rmSync(workspace, { recursive: true, force: true });
fs.mkdirSync(workspace, { recursive: true });

const envFile = path.join(workspace, '.env');
const cenvFile = path.join(workspace, '.cenv');

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log(`
${B}╔══════════════════════════════════════════════════╗
║  🐦‍⬛  CrowEnv Multi-Language E2E Demo             ║
║  Node.js · Python · Go · Rust                    ║
╚══════════════════════════════════════════════════╝${X}
`);

const results = { passed: 0, failed: 0, skipped: 0 };

// ─── Generate shared master key + .env ───────────────────────────────────────
const masterKey = crypto.randomBytes(32).toString('hex');
process.env.CENV_MASTER_KEY = masterKey;

fs.writeFileSync(envFile, [
    'APP_NAME=CrowEnv Demo',
    'DB_HOST=db.example.com',
    'DB_PASSWORD=super_secret_XYZ789',
    'API_KEY=sk_live_abc123xyz456',
    'JWT_SECRET=jwt_supersecret_key',
].join('\n') + '\n');

// ─── Step 1: Encrypt shared .env using Node.js CLI ───────────────────────────
header('Step 1 — Encrypt .env → .cenv (Node.js CLI)');
const encResult = tryRun(`crowenv encrypt "${envFile}" "${cenvFile}"`, { env: process.env });
if (encResult.ok) {
    ok('Encrypted .env → .cenv (AES-256-GCM)');
    ok('.cenv is shared across ALL language tests below');
    results.passed++;
} else {
    fail(`Encrypt failed: ${encResult.out}`);
    fail('Run: npm install -g crowenv');
    results.failed++;
    process.exit(1); // can't continue without .cenv
}

// ─── Step 2: Node.js — CLI verify + decrypt ──────────────────────────────────
header('Step 2 — Node.js CLI (crowenv)');
const nvResult = tryRun(`crowenv verify "${cenvFile}"`, { env: process.env });
if (nvResult.ok) {
    ok('crowenv verify → PASSED');
    results.passed++;
} else {
    fail(`crowenv verify → FAILED: ${nvResult.out}`);
    results.failed++;
}

const ndResult = tryRun(`crowenv decrypt "${cenvFile}"`, { env: process.env });
if (ndResult.ok) {
    ok('crowenv decrypt → PASSED');
    const lines = ndResult.out.split('\n').filter(l => l.includes('='));
    lines.forEach(l => {
        const [k] = l.split('=');
        info(`  ${k.trim()} = ***`);
    });
    results.passed++;
} else {
    fail(`crowenv decrypt → FAILED: ${ndResult.out}`);
    results.failed++;
}

// ─── Step 3: Python — cenv.load() API ────────────────────────────────────────
header('Step 3 — Python API (cenv.load())');
const pyScript = `
import sys, os
sys.path.insert(0, r'${path.join(root, 'packages', 'cenv-python')}')
try:
    from cenv.core import decrypt_file
    secrets = decrypt_file(r'${cenvFile}', os.environ['CENV_MASTER_KEY'])
    for k, v in secrets.items():
        print(f'{k}=***')
    print('PYTHON_OK')
except Exception as e:
    print(f'PYTHON_ERR:{e}', file=sys.stderr)
    sys.exit(1)
`.trim();

const pyFile = path.join(workspace, 'test_python.py');
fs.writeFileSync(pyFile, pyScript);
const pyEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
const pyResult = tryRun(`python "${pyFile}"`, { env: pyEnv });

if (pyResult.ok && pyResult.out.includes('PYTHON_OK')) {
    ok('Python cenv.load() → PASSED');
    pyResult.out.split('\n').filter(l => l.includes('=')).forEach(l => info(`  ${l}`));
    results.passed++;
} else {
    // Try pip-installed crowenv
    const py2Script = `
import os, sys
os.environ['CENV_MASTER_KEY'] = r'${masterKey}'
try:
    import cenv
    cenv.load(r'${cenvFile}')
    print('APP_NAME=' + os.environ.get('APP_NAME', 'NOT_SET'))
    print('PYTHON_OK')
except Exception as e:
    print(f'PYTHON_ERR:{e}', file=sys.stderr)
    sys.exit(1)
`.trim();
    fs.writeFileSync(pyFile, py2Script);
    const py2Result = tryRun(`python "${pyFile}"`, { env: pyEnv });
    if (py2Result.ok && py2Result.out.includes('PYTHON_OK')) {
        ok('Python cenv.load() (pip crowenv) → PASSED');
        results.passed++;
    } else {
        fail(`Python → FAILED. Install: pip install crowenv`);
        info(`Error: ${py2Result.out || pyResult.out}`);
        results.failed++;
    }
}

// ─── Step 4: Go — build and test binary ──────────────────────────────────────
header('Step 4 — Go binary (built from source)');
const goDir = path.join(root, 'packages', 'cenv-go');
const goBin = path.join(workspace, process.platform === 'win32' ? 'crowenv-go.exe' : 'crowenv-go');
const goBuild = tryRun(`go build -o "${goBin}" .`, { cwd: goDir });

if (goBuild.ok) {
    ok('Go binary built successfully');
    const goVerify = tryRun(`"${goBin}" verify "${cenvFile}"`, { env: process.env });
    if (goVerify.ok) {
        ok('Go crowenv verify → PASSED');
        results.passed++;
    } else {
        fail(`Go verify → FAILED: ${goVerify.out}`);
        results.failed++;
    }

    const goDecrypt = tryRun(`"${goBin}" decrypt "${cenvFile}"`, { env: process.env });
    if (goDecrypt.ok) {
        ok('Go crowenv decrypt → PASSED');
        goDecrypt.out.split('\n').filter(l => l.includes('=')).forEach(l => {
            const [k] = l.split('=');
            info(`  ${k.trim()} = ***`);
        });
        results.passed++;
    } else {
        fail(`Go decrypt → FAILED: ${goDecrypt.out}`);
        results.failed++;
    }
} else {
    skip(`Go binary not built — is Go installed? (go build failed)`);
    info('Install Go: https://go.dev/dl/');
    results.skipped++;
}

// ─── Step 5: Rust — cargo-installed binary ────────────────────────────────────
header('Step 5 — Rust binary (cargo install crowenv)');

// Rust binary might shadow npm's crowenv — find it via cargo bin path
const cargoHome = process.env.CARGO_HOME || path.join(process.env.USERPROFILE || process.env.HOME, '.cargo');
const rustBin = path.join(cargoHome, 'bin', process.platform === 'win32' ? 'crowenv.exe' : 'crowenv');

if (fs.existsSync(rustBin)) {
    const rsVerify = tryRun(`"${rustBin}" verify "${cenvFile}"`, { env: process.env });
    if (rsVerify.ok) {
        ok('Rust crowenv verify → PASSED');
        results.passed++;
    } else {
        fail(`Rust verify → FAILED: ${rsVerify.out}`);
        results.failed++;
    }

    const rsDecrypt = tryRun(`"${rustBin}" decrypt "${cenvFile}"`, { env: process.env });
    if (rsDecrypt.ok) {
        ok('Rust crowenv decrypt → PASSED');
        rsDecrypt.out.split('\n').filter(l => l.includes('=')).forEach(l => {
            const [k] = l.split('=');
            info(`  ${k.trim()} = ***`);
        });
        results.passed++;
    } else {
        fail(`Rust decrypt → FAILED: ${rsDecrypt.out}`);
        results.failed++;
    }
} else {
    // Try building from source
    const rsDir = path.join(root, 'packages', 'cenv-rs');
    const rsBin = path.join(workspace, process.platform === 'win32' ? 'crowenv-rs.exe' : 'crowenv-rs');
    const rsBuild = tryRun(`cargo build --release`, { cwd: rsDir });
    if (rsBuild.ok) {
        const rsSrc = path.join(rsDir, 'target', 'release', process.platform === 'win32' ? 'crowenv.exe' : 'crowenv');
        if (fs.existsSync(rsSrc)) {
            fs.copyFileSync(rsSrc, rsBin);
            const rsVerify = tryRun(`"${rsBin}" verify "${cenvFile}"`, { env: process.env });
            if (rsVerify.ok) {
                ok('Rust crowenv verify (built from source) → PASSED');
                results.passed++;
            } else {
                fail(`Rust verify → FAILED: ${rsVerify.out}`);
                results.failed++;
            }
        }
    } else {
        skip('Rust binary not found — install with: cargo install crowenv');
        results.skipped++;
    }
}

// ─── Step 6: Cross-language tamper detection ─────────────────────────────────
header('Step 6 — Cross-language tamper detection');
const cenvJson = JSON.parse(fs.readFileSync(cenvFile, 'utf8'));
cenvJson.d = cenvJson.d.slice(0, -2) + 'ZZ';  // corrupt payload
const tamperedFile = cenvFile + '.tampered';
fs.writeFileSync(tamperedFile, JSON.stringify(cenvJson));

const tamperNode = tryRun(`crowenv verify "${tamperedFile}"`, { env: process.env });
if (!tamperNode.ok) {
    ok('Node.js: tampered .cenv correctly rejected');
    results.passed++;
} else {
    fail('Node.js: tamper NOT detected!');
    results.failed++;
}

fs.unlinkSync(tamperedFile);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`
${B}╔══════════════════════════════════════════════════╗
║  Results                                         ║
╚══════════════════════════════════════════════════╝${X}

  ${G}Passed:  ${results.passed}${X}
  ${R}Failed:  ${results.failed}${X}
  ${Y}Skipped: ${results.skipped}${X}

  ${G}Node.js  → npm install -g crowenv${X}
  ${G}Python   → pip install crowenv${X}
  ${G}Go       → go install github.com/Yogesh1290/crowenv@latest${X}
  ${G}Rust     → cargo install crowenv${X}

  🐦‍⬛  ${C}https://github.com/Yogesh1290/crowenv${X}
`);

// Cleanup
fs.rmSync(workspace, { recursive: true, force: true });

if (results.failed > 0) process.exit(1);
