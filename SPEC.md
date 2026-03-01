# .cenv File Format Specification v1.0

**Status:** Published  
**Date:** 2026-03-02  
**Authors:** cenv Contributors

---

## Overview

The `.cenv` format is an open standard for storing application secrets in an encrypted, git-safe file. It replaces the insecure plain-text `.env` convention with AES-256-GCM full-file encryption.

---

## 1. Goals

- **Git-safe by default** — `.cenv` files can be committed to version control
- **Language-agnostic** — loadable from any language with 20–50 lines of code
- **Zero-dependency in Node.js** — uses native `crypto` module
- **Tamper-evident** — AES-256-GCM authentication tag detects modification
- **Interoperable** — same format across all official implementations

---

## 2. File Format

A `.cenv` file MUST be valid JSON with the following structure:

```json
{
  "v": "1.0",
  "s": "<base64-encoded 16-byte random salt>",
  "d": "<base64-encoded payload>"
}
```

### Fields

| Field | Type   | Description |
|-------|--------|-------------|
| `v`   | string | Spec version. MUST be `"1.0"` for this version. |
| `s`   | string | Base64-encoded 16-byte random salt used for key derivation. |
| `d`   | string | Base64-encoded concatenation of: `nonce (12 bytes) + auth_tag (16 bytes) + ciphertext`. |

---

## 3. Encryption Algorithm

### 3.1 Key Derivation

```
key = PBKDF2-HMAC-SHA256(password=CENV_MASTER_KEY, salt=s, iterations=600000, dklen=32)
```

- Algorithm: **PBKDF2-HMAC-SHA256**
- Iterations: **600,000** (OWASP 2024 minimum for SHA-256)
- Output length: **32 bytes** (256 bits)

### 3.2 Encryption

```
nonce = random 12 bytes (96-bit, GCM standard)
ciphertext, auth_tag = AES-256-GCM-Encrypt(key, nonce, plaintext)
```

- Algorithm: **AES-256-GCM**
- Nonce length: **12 bytes** (96 bits — GCM standard)
- Auth tag length: **16 bytes** (128 bits — maximum security)

### 3.3 Plaintext Format

The plaintext encrypted inside `d` MUST be a JSON-serialized object where:
- Keys are the environment variable names (strings)
- Values are the environment variable values (strings)

```json
{
  "DB_PASSWORD": "supersecret123",
  "API_KEY": "sk_live_abc123xyz",
  "JWT_SECRET": "very-long-random-string"
}
```

### 3.4 Payload Layout

```
d = Base64( nonce[0:12] + auth_tag[0:16] + ciphertext[...] )
```

---

## 4. Master Key

The master key (`CENV_MASTER_KEY`) MUST:

- Be stored **outside** the `.cenv` file
- Be at least **32 characters** (256 bits of entropy recommended)
- Be injected at runtime via:
  - Environment variable: `CENV_MASTER_KEY`
  - Secrets manager (AWS Secrets Manager, HashiCorp Vault, 1Password, etc.)
  - Hardware key (YubiKey-derived HMAC)
  - Ethereum/Solana wallet signature (blockchain mode — see Section 6)

The master key MUST NOT be committed to version control.

---

## 5. Recommended File Layout

```
project/
  .cenv           ← commit this (encrypted)
  .cenv.keys      ← NEVER commit (gitignored, holds CENV_MASTER_KEY locally)
  .env            ← NEVER commit (plain text, delete after encrypting)
  .gitignore      ← must include: .env and .cenv.keys
```

---

## 6. Blockchain Mode (Optional Extension)

In blockchain mode, the `CENV_MASTER_KEY` is derived deterministically from a cryptocurrency wallet:

```
master_key = SHA256( wallet.signMessage("cenv-master-key-v1") )
```

This allows:
- **Wallet-gated decryption**: only wallets holding the private key can decrypt
- **Threshold decryption**: using Lit Protocol, require M-of-N team wallets
- **On-chain audit**: store SHA256(.cenv) on Ethereum/Arweave for tamper-proof audit trail

Implementations supporting blockchain mode MUST indicate this with `"mode": "blockchain"` in the JSON.

---

## 7. Security Properties

| Property | Value |
|----------|-------|
| Confidentiality | AES-256-GCM (256-bit key) |
| Integrity | AES-GCM authentication tag (128-bit) |
| Key derivation | PBKDF2-HMAC-SHA256 (600k iterations) |
| Nonce reuse | Prevented by random 96-bit nonce per encryption |
| Git safety | ✅ Safe to commit (encrypted) |
| Brute-force resistance | ~2^256 key space |
| Timing attacks | Mitigated by constant-time decryption in all implementations |

---

## 8. What `.cenv` Is NOT

- NOT a secrets manager replacement for production (use AWS SM / Vault for that)
- NOT designed for secrets larger than ~1MB
- NOT streaming (full file is decrypted at load time)

---

## 9. Versioning

The `v` field enables future format upgrades. Implementations MUST reject files with unknown versions to prevent silent format mismatches.

---

## 10. MIME Type & File Extension

| Property | Value |
|----------|-------|
| File extension | `.cenv` |
| MIME type | `application/cenv+json` |
| VS Code language ID | `cenv` |

---

## Reference Implementations

| Language | Package | Status |
|----------|---------|--------|
| Node.js  | `cenv` (npm) | ✅ Stable |
| Python   | `cenv` (pip) | ✅ Stable |
| Go       | `github.com/cenv/cenv-go` | ✅ Stable |
| Rust     | `cenv` (crates.io) | ✅ Stable |

---

*© 2026 cenv Contributors — MIT License*
