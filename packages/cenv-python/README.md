# 🐦‍⬛ CrowEnv — Python

[![PyPI](https://img.shields.io/pypi/v/crowenv.svg?color=6c63ff)](https://pypi.org/project/crowenv/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](../../LICENSE)
[![Python](https://img.shields.io/pypi/pyversions/crowenv.svg)](https://pypi.org/project/crowenv/)

**CrowEnv** replaces insecure plain `.env` files with `.cenv` — AES-256-GCM encrypted secrets safe to commit to Git.

> *"Crows hide their treasures. Now so can you."* 🐦‍⬛

## Install

```bash
pip install crowenv
```

## Quick Start

```bash
# 1. Initialize .gitignore
crowenv init

# 2. Generate a 256-bit master key (save this in your secrets manager!)
crowenv generate-key
# 🔑 a3f8c901... ← copy and store safely

# 3. Set the key
export CENV_MASTER_KEY="a3f8c901..."

# 4. Encrypt your .env
crowenv encrypt
# ✅ .cenv created (3 secrets, AES-256-GCM)

# 5. Commit .cenv safely
rm .env && git add .cenv && git commit -m "Add encrypted secrets"
```

## Python API

```python
import cenv
import os

# Load .cenv into os.environ (call at app startup)
cenv.load()

# Now use secrets normally
db_password = os.getenv("DB_PASSWORD")
api_key = os.getenv("API_KEY")
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `crowenv init` | Initialize `.gitignore` |
| `crowenv generate-key` | Generate a 256-bit random master key |
| `crowenv encrypt [file]` | Encrypt `.env` → `.cenv` |
| `crowenv decrypt [file]` | Decrypt `.cenv` → stdout |
| `crowenv load [file]` | Load `.cenv` into process environment |
| `crowenv verify [file]` | Verify `.cenv` integrity |

## Security

| Property | Value |
|----------|-------|
| Encryption | AES-256-GCM |
| Key derivation | PBKDF2-HMAC-SHA256 (600,000 iterations) |
| Nonce | 12 bytes, random per encrypt |
| Auth tag | 16 bytes (tamper detection built-in) |
| Dependency | `cryptography` library |

The `.cenv` file format is git-safe — commit it openly. The master key stays secret (env var, secrets manager, vault).

## The .cenv Format

```json
{
  "v": "1.0",
  "s": "<base64 16-byte salt>",
  "d": "<base64 nonce(12) + auth_tag(16) + ciphertext>"
}
```

## Links

- 🐦‍⬛ [GitHub](https://github.com/Yogesh1290/crowenv)
- 📋 [Full Spec](https://github.com/Yogesh1290/crowenv/blob/main/SPEC.md)
- 🔐 [Security Policy](https://github.com/Yogesh1290/crowenv/blob/main/SECURITY.md)
- 📦 [npm (Node.js)](https://npmjs.com/package/crowenv)
- 🦀 [crates.io (Rust)](https://crates.io/crates/crowenv)

## License

MIT
