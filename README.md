# 🐦‍⬛ CrowEnv — Smart Secrets. Like a Crow.

[![npm](https://img.shields.io/npm/v/crowenv.svg?color=6c63ff)](https://npmjs.com/package/crowenv)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Spec: v1.0](https://img.shields.io/badge/spec-v1.0-00d4aa.svg)](SPEC.md)

**CrowEnv** replaces insecure plain `.env` files with `.cenv` — AES-256-GCM encrypted secrets you can safely commit to Git.

```
Plain .env  →  hackable, accidental commits, millions stolen daily
.cenv       →  AES-256-GCM encrypted, git-safe, tamper-proof
             🐦‍⬛  Crows hide their treasures. Now you can too.
```

---

## 🚨 Why `.env` Must Die

> **12+ million `.env` files are publicly exposed on the internet right now.**

Real attacks in the past 24 months:

| Attack | Source | Impact |
|--------|--------|--------|
| Web exposure scan | Palo Alto Unit 42 (Aug 2024) | 110k domains, 7k cloud credentials, ransom demands |
| Git history mining | GitGuardian (2025) | Millions of leaked API keys daily |
| Laravel public .env | Bug bounty hunter (2025) | DB creds → Full RCE |

Plain `.env` was a 2013 convention. It was never a security feature.  
**cenv is the 2026 replacement.**

---

## ✅ Features

- **Encrypted by default** — AES-256-GCM, 600k PBKDF2 iterations
- **Git-safe** — commit `.cenv` openly, master key stays secret
- **Tamper-proof** — GCM auth tag detects any modification
- **Zero dependencies** (Node.js) — built-in `crypto` only
- **Every language** — Node.js, Python, Go, Rust
- **Full ecosystem** — VS Code extension, Docker, Kubernetes, CI scripts
- **Blockchain mode** — wallet-derived keys, on-chain audit trail

---

## 📦 Install

```bash
# Node.js (recommended)
npm install -g crowenv

# Python
pip install crowenv

# Go
go install github.com/Yogesh1290/crowenv/cmd/crowenv@latest

# Rust
cargo install crowenv
```

---

## 🚀 Quick Start

```bash
# 1. Initialize
crowenv init

# 2. Generate a 256-bit master key (save this in 1Password / GitHub Secrets!)
crowenv generate-key

# 3. Set it
export CENV_MASTER_KEY="a3f8c901..."

# 4. Create your plain .env
echo "DB_PASSWORD=supersecret123" > .env
echo "API_KEY=sk_live_abc123" >> .env

# 5. Encrypt → .cenv
crowenv encrypt
# ✅ .cenv created (2 secrets encrypted, AES-256-GCM)

# 6. Delete plain .env
rm .env   # or: del .env on Windows

# 7. Commit .cenv safely
git add .cenv
git commit -m "Add encrypted secrets"
```

---

## 🔐 Commands

| Command | Description |
|---------|-------------|
| `crowenv init` | Initialize `.gitignore` |
| `crowenv generate-key` | Generate a 256-bit random master key |
| `crowenv encrypt [file]` | Encrypt `.env` → `.cenv` |
| `crowenv decrypt [file]` | Decrypt `.cenv` → stdout |
| `crowenv load [file]` | Load `.cenv` into process env |
| `crowenv verify [file]` | Verify `.cenv` integrity |

---

## 🗂 Project Structure

```
crowenv/
├── packages/
│   ├── cenv-node/       Node.js CLI (npm install -g crowenv)
│   ├── cenv-python/     Python loader (pip install crowenv)
│   ├── cenv-go/         Go CLI (go install)
│   ├── cenv-rs/         Rust CLI (cargo install crowenv)
│   └── cenv-vscode/     VS Code extension (CrowEnv)
├── deploy/
│   ├── docker/          Dockerfile.example
│   ├── k8s/             secret.yaml + deployment.yaml
│   └── scripts/         ci-inject.sh
├── website/             Landing page (crowenv.dev)
├── SPEC.md              Official .cenv v1.0 format specification
├── SECURITY.md
├── CONTRIBUTING.md
└── CHANGELOG.md
```

---

## 📄 .cenv File Format

```json
{
  "v": "1.0",
  "s": "<base64-encoded 16-byte random salt>",
  "d": "<base64-encoded nonce(12) + auth_tag(16) + ciphertext>"
}
```

| Algorithm | Detail |
|-----------|--------|
| Encryption | AES-256-GCM |
| Key derivation | PBKDF2-HMAC-SHA256, 600,000 iterations |
| Nonce | 12 bytes, random per encryption |
| Auth tag | 16 bytes (tamper detection) |

→ [Read the full spec](SPEC.md)

---

## 🌍 Usage by Language

### Node.js

```javascript
// Load at app startup
const { execFileSync } = require('child_process');
execFileSync('crowenv', ['load'], { stdio: 'inherit' });
// Now process.env.DB_PASSWORD works
```

Or inline:

```bash
crowenv load -- node server.js
```

### Python

```python
import cenv
cenv.load()   # loads .cenv into os.environ
import os
print(os.getenv("DB_PASSWORD"))
```

### Go

```bash
crowenv load   # injects into os.Setenv
```

### Docker

```dockerfile
FROM node:20-slim
RUN npm install -g crowenv
COPY .cenv /app/.cenv
CMD ["sh", "-c", "crowenv load && node server.js"]
```

```bash
docker run -e CENV_MASTER_KEY="your-key" myapp
```

### Kubernetes

```yaml
# Inject master key from K8s Secret
envFrom:
  - secretRef:
      name: cenv-master-key
```

→ See [deploy/k8s/](deploy/k8s/) for full example.

---

## 🔗 Blockchain Mode (Advanced)

Derive the master key from an Ethereum wallet signature:

```javascript
const { ethers } = require('ethers');

async function walletKey(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const sig = await wallet.signMessage('cenv-master-key-v1');
  return require('crypto').createHash('sha256').update(sig).digest('hex');
}

// Use result as CENV_MASTER_KEY
// ✅ Only your wallet can decrypt. No central secret manager needed.
```

Features:
- 🔑 Wallet-gated decryption
- 🗳️ Threshold decryption (Lit Protocol integration)
- ⛓️ On-chain audit trail (Arweave/Ethereum)

---

## 🔧 VS Code Extension

Install **CrowEnv** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=crowenv.crowenv):

- Syntax highlighting for `.cenv` files
- 🐦‍⬛ Security warnings when `.env` is detected
- Commands: Encrypt, Decrypt, Verify, Generate Key
- Auto-checks `.gitignore` for `.env`

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## 🛡️ Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

---

## 📣 The Thread

> **.env is dead.  
> We just shipped .cenv — AES-256-GCM encrypted secrets in Go/Rust/Node/Python/VS Code/Docker/K8s.  
> Commit secrets safely. No more leaks.  
> github.com/cenv/cenv  
> #devsec #security**
