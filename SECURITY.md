# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Yes    |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security issues via one of these channels:

1. **Email**: security@cenv.dev (PGP key available at keybase.io/cenv)
2. **GitHub Security Advisory**: Use the "Report a vulnerability" button on the Security tab

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 7 days |
| Fix + coordinated disclosure | Within 90 days |

## Cryptographic Assumptions

cenv's security relies on:

1. **AES-256-GCM** — assumed computationally secure against chosen-plaintext and chosen-ciphertext attacks
2. **PBKDF2-HMAC-SHA256 (600k iterations)** — brute-force resistant per OWASP 2024
3. **Master key secrecy** — if `CENV_MASTER_KEY` is compromised, all `.cenv` files encrypted with it are compromised
4. **Nonce uniqueness** — nonce is 12 random bytes, re-encryption generates a new nonce

## Scope

In scope:
- Cryptographic weaknesses in the `.cenv` format
- Key derivation vulnerabilities
- Parser bugs that leak plaintext
- Side-channel attacks in implementations

Out of scope:
- The security of the master key storage mechanism (that's the user's responsibility)
- Attacks requiring physical access to a decrypted machine
