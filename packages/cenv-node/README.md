# cenv — Node.js CLI

[![npm](https://img.shields.io/npm/v/cenv.svg)](https://npmjs.com/package/cenv)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)

The official Node.js CLI for the `.cenv` encrypted secrets standard.

## Install

```bash
npm install -g cenv
# or use without installing:
npx cenv
```

## Quick Start

```bash
# 1. Initialize project
cenv init

# 2. Generate a master key
cenv generate-key
# Copy the output and:
export CENV_MASTER_KEY="your-generated-key-here"

# 3. Create a plain .env (just for encryption — delete after)
echo "DB_PASS=supersecret" > .env
echo "API_KEY=sk_live_abc123" >> .env

# 4. Encrypt it
cenv encrypt
# Creates .cenv — safe to commit!

# 5. Delete the plain .env
rm .env   # or: del .env on Windows

# 6. Commit .cenv
git add .cenv && git commit -m "Add encrypted secrets"
```

## Commands

| Command | Description |
|---------|-------------|
| `cenv init` | Initialize .gitignore |
| `cenv generate-key` | Generate a 256-bit random master key |
| `cenv encrypt [envFile]` | Encrypt `.env` → `.cenv` |
| `cenv decrypt [cenvFile]` | Decrypt `.cenv` → stdout |
| `cenv load [cenvFile] [-- cmd]` | Load `.cenv` into env and optionally exec a command |
| `cenv verify [cenvFile]` | Verify `.cenv` integrity |

## Use in Node.js Apps

```javascript
// At the top of your app entry point:
require('child_process').execFileSync('cenv', ['load'], { stdio: 'inherit' });
// Now process.env.DB_PASS etc. are available

// Or with exec:
// cenv load -- node server.js
```

## API

```javascript
// Direct API usage (no CLI needed)
const { encryptSecrets, decryptSecrets } = require('cenv/lib');
```

## Zero Dependencies

This CLI uses only Node.js built-in `crypto` module. No third-party packages required at runtime.
