"""
cenv core — AES-256-GCM encryption/decryption for .cenv format
Requires: pip install cryptography
"""

import os
import json
import base64
import secrets as _secrets
from typing import Dict, Optional

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
except ImportError:
    raise ImportError(
        "The 'cryptography' package is required.\n"
        "Install it with: pip install cryptography"
    )

# ─── Constants ────────────────────────────────────────────────────────────────
CENV_VERSION = "1.0"
PBKDF2_ITERATIONS = 600_000
KEY_LEN = 32       # AES-256
NONCE_LEN = 12     # GCM 96-bit nonce
TAG_LEN = 16       # GCM 128-bit auth tag
SALT_LEN = 16      # PBKDF2 128-bit salt
MASTER_KEY_ENV = "CENV_MASTER_KEY"


# ─── Key Derivation ───────────────────────────────────────────────────────────

def _derive_key(master_key: str, salt: bytes) -> bytes:
    """Derive a 256-bit AES key using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
    )
    return kdf.derive(master_key.encode("utf-8"))


# ─── Encrypt ──────────────────────────────────────────────────────────────────

def encrypt_cenv(
    secrets: Dict[str, str],
    master_key: Optional[str] = None,
) -> dict:
    """
    Encrypt a dictionary of secrets into .cenv format.
    
    Args:
        secrets: Dict of environment variable name → value
        master_key: Master key string. Defaults to CENV_MASTER_KEY env var.

    Returns:
        dict with keys 'v', 's', 'd' (the .cenv JSON structure)
    """
    if not master_key:
        master_key = os.getenv(MASTER_KEY_ENV)
    if not master_key:
        raise ValueError(
            f"{MASTER_KEY_ENV} is not set. "
            "Set it or pass master_key= explicitly."
        )

    salt = _secrets.token_bytes(SALT_LEN)
    key = _derive_key(master_key, salt)
    nonce = _secrets.token_bytes(NONCE_LEN)

    aesgcm = AESGCM(key)
    plaintext = json.dumps(secrets, ensure_ascii=False).encode("utf-8")

    # AESGCM.encrypt returns ciphertext + tag appended
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)
    # Rearrange to match spec: nonce + tag + ciphertext
    # cryptography lib appends tag at end: ciphertext_with_tag = ct + tag(16)
    ciphertext = ciphertext_with_tag[:-TAG_LEN]
    tag = ciphertext_with_tag[-TAG_LEN:]

    payload = nonce + tag + ciphertext

    return {
        "v": CENV_VERSION,
        "s": base64.b64encode(salt).decode("ascii"),
        "d": base64.b64encode(payload).decode("ascii"),
    }


# ─── Decrypt ──────────────────────────────────────────────────────────────────

def decrypt_cenv(
    cenv_data: dict,
    master_key: Optional[str] = None,
) -> Dict[str, str]:
    """
    Decrypt a .cenv JSON structure back into a dict of secrets.

    Args:
        cenv_data: dict parsed from a .cenv file
        master_key: Master key string. Defaults to CENV_MASTER_KEY env var.

    Returns:
        Dict of environment variable name → value

    Raises:
        ValueError: If the master key is wrong or file is tampered with
    """
    if not master_key:
        master_key = os.getenv(MASTER_KEY_ENV)
    if not master_key:
        raise ValueError(f"{MASTER_KEY_ENV} is not set.")

    version = cenv_data.get("v")
    if version != CENV_VERSION:
        raise ValueError(f"Unsupported .cenv version: {version!r}")

    salt = base64.b64decode(cenv_data["s"])
    key = _derive_key(master_key, salt)
    payload = base64.b64decode(cenv_data["d"])

    if len(payload) < NONCE_LEN + TAG_LEN:
        raise ValueError("Malformed .cenv: payload too short.")

    nonce = payload[:NONCE_LEN]
    tag = payload[NONCE_LEN:NONCE_LEN + TAG_LEN]
    ciphertext = payload[NONCE_LEN + TAG_LEN:]

    aesgcm = AESGCM(key)
    # cryptography lib expects ciphertext + tag
    try:
        plaintext = aesgcm.decrypt(nonce, ciphertext + tag, None)
    except Exception:
        raise ValueError(
            "Decryption failed: wrong master key or .cenv was tampered with."
        )

    return json.loads(plaintext.decode("utf-8"))


# ─── Load ─────────────────────────────────────────────────────────────────────

def load_cenv(
    cenv_path: str = ".cenv",
    master_key: Optional[str] = None,
) -> Dict[str, str]:
    """
    Load a .cenv file and inject all secrets into os.environ.

    Args:
        cenv_path: Path to the .cenv file (default: '.cenv')
        master_key: Master key. Defaults to CENV_MASTER_KEY env var.

    Returns:
        Dict of loaded secrets (also sets os.environ)
    """
    if not os.path.exists(cenv_path):
        raise FileNotFoundError(
            f"{cenv_path} not found. Run 'cenv encrypt' first."
        )

    with open(cenv_path, "r", encoding="utf-8") as f:
        cenv_data = json.load(f)

    secrets = decrypt_cenv(cenv_data, master_key)
    os.environ.update(secrets)
    print(f"✅ .cenv loaded ({len(secrets)} secrets injected into os.environ)")
    return secrets


# ─── Parse .env ───────────────────────────────────────────────────────────────

def parse_env_file(path: str = ".env") -> Dict[str, str]:
    """Parse a plain .env file into a dict."""
    result = {}
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            eq_idx = line.find("=")
            if eq_idx == -1:
                continue
            key = line[:eq_idx].strip()
            value = line[eq_idx + 1:].strip()
            # Strip inline comments
            if not value.startswith(('"', "'")):
                ci = value.find(" #")
                if ci != -1:
                    value = value[:ci].strip()
            # Strip surrounding quotes
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]
            if key:
                result[key] = value
    return result


# ─── CLI Entry (python -m cenv) ───────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    def _get_master_key():
        key = os.getenv(MASTER_KEY_ENV)
        if not key:
            print(f"❌ {MASTER_KEY_ENV} is not set.", file=sys.stderr)
            sys.exit(1)
        return key

    cmd = sys.argv[1] if len(sys.argv) > 1 else None

    if cmd == "encrypt":
        env_file = sys.argv[2] if len(sys.argv) > 2 else ".env"
        out_file = sys.argv[3] if len(sys.argv) > 3 else ".cenv"
        plain = parse_env_file(env_file)
        encrypted = encrypt_cenv(plain, _get_master_key())
        with open(out_file, "w") as f:
            json.dump(encrypted, f, indent=2)
        print(f"✅ {out_file} created ({len(plain)} secrets encrypted)")

    elif cmd == "decrypt":
        cenv_file = sys.argv[2] if len(sys.argv) > 2 else ".cenv"
        with open(cenv_file) as f:
            data = json.load(f)
        secrets = decrypt_cenv(data, _get_master_key())
        for k, v in secrets.items():
            print(f"{k}={v}")

    elif cmd == "load":
        cenv_file = sys.argv[2] if len(sys.argv) > 2 else ".cenv"
        load_cenv(cenv_file, _get_master_key())

    else:
        print("Usage: python -m cenv <encrypt|decrypt|load> [file]")
        sys.exit(1)
