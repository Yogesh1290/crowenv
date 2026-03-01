/**
 * CrowEnv Node.js Demo App 🐦‍⬛
 *
 * This demo shows how to use the `crowenv` npm package in a real Node.js app.
 *
 * Setup:
 *   npm install -g crowenv
 *   crowenv generate-key          → copy the key
 *   export CENV_MASTER_KEY="..."  → set it
 *   crowenv encrypt               → creates .cenv from .env
 *   node app.js                   → runs this demo
 */

'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

// ─── Step 1: Load .cenv into process.env ─────────────────────────────────────
console.log('\n🐦‍⬛ CrowEnv Node.js Demo\n');
console.log('Loading secrets from .cenv...');

try {
    execFileSync('crowenv', ['load', path.join(__dirname, '.cenv')], {
        stdio: 'inherit',
        env: process.env,
    });
} catch (err) {
    console.error('❌ Failed to load .cenv:', err.message);
    console.error('   Make sure crowenv is installed: npm install -g crowenv');
    console.error('   And CENV_MASTER_KEY is set.');
    process.exit(1);
}

// ─── Step 2: Use secrets normally via process.env ────────────────────────────
console.log('\n✅ Secrets loaded into process.env!\n');

const DB_HOST = process.env.DB_HOST || '(not set)';
const DB_PASSWORD = process.env.DB_PASSWORD || '(not set)';
const API_KEY = process.env.API_KEY || '(not set)';
const APP_NAME = process.env.APP_NAME || '(not set)';

console.log('📦 App Config:');
console.log(`   APP_NAME    = ${APP_NAME}`);
console.log(`   DB_HOST     = ${DB_HOST}`);
console.log(`   DB_PASSWORD = ${'*'.repeat(DB_PASSWORD.length)} (${DB_PASSWORD.length} chars)`);
console.log(`   API_KEY     = ${API_KEY.slice(0, 6)}... (masked)`);

console.log('\n🔐 Security summary:');
console.log('   ✅ Secrets loaded from encrypted .cenv (AES-256-GCM)');
console.log('   ✅ Plain .env never written to disk in this demo');
console.log('   ✅ .cenv is safe to commit to Git');
console.log('   ✅ Master key stored only in environment variable\n');
