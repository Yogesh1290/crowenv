# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] — 2026-03-02

### 🎉 Initial Release

#### Added

- **`.cenv` Spec v1.0** — official encrypted secrets format standard
  - AES-256-GCM full-file encryption
  - PBKDF2-HMAC-SHA256 key derivation (600,000 iterations)
  - Git-safe by design: commit `.cenv` openly
  - Tamper detection via GCM authentication tag

- **Node.js CLI** (`npm install -g cenv`)
  - Zero runtime dependencies (built-in Node.js `crypto`)
  - Commands: `init`, `generate-key`, `encrypt`, `decrypt`, `load`, `verify`
  - Full `.env` parser (supports comments, quotes, inline comments)
  - Node.js ≥18 required

- **Python Loader** (`pip install cenv-python`)
  - Full encrypt/decrypt/load API
  - CLI via `python -m cenv`
  - Requires `cryptography` package
  - Python ≥3.9 supported

- **Go CLI** (`go install github.com/cenv/cenv-go@latest`)
  - Single binary, cross-platform
  - Proper PBKDF2 via `golang.org/x/crypto`
  - All 6 commands implemented

- **Rust CLI** (`cargo install cenv`)
  - Fastest implementation
  - Uses `aes-gcm`, `pbkdf2`, `rand`
  - All 6 commands implemented

- **VS Code Extension**
  - Syntax highlighting for `.cenv` files
  - Security warnings for plain `.env` files
  - Commands: encrypt, decrypt, verify, init, generate-key
  - Context menu integration in Explorer
  - Auto-detect `.env` not in `.gitignore`

- **Docker & Kubernetes support**
  - `Dockerfile.example`
  - Kubernetes `secret.yaml` + `deployment.yaml`
  - CI inject script (`ci-inject.sh`)

- **Landing page** (`website/`)
  - Dark glassmorphism design
  - Exposé section with real attack stats
  - Install tabs for all languages
  - Spec reference table

[1.0.0]: https://github.com/cenv/cenv/releases/tag/v1.0.0
