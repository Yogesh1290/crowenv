"""
cenv — Python loader for the .cenv encrypted secrets standard
AES-256-GCM + PBKDF2-HMAC-SHA256 (600,000 iterations)

Install:
    pip install cenv-python

Usage:
    import cenv
    cenv.load()   # loads .cenv into os.environ
    print(os.getenv("DB_PASS"))

Or with explicit path:
    cenv.load(cenv_path=".cenv", master_key="your-key")
"""

from .core import load_cenv as load, encrypt_cenv as encrypt, decrypt_cenv as decrypt

__version__ = "1.0.0"
__all__ = ["load", "encrypt", "decrypt"]
