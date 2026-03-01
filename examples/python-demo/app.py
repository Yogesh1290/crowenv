"""
CrowEnv Python Demo App 🐦‍⬛

Shows how to use the `crowenv` pip package in a real Python app.

Setup:
  pip install crowenv
  crowenv generate-key          → copy the key
  export CENV_MASTER_KEY="..."  → set it
  crowenv encrypt               → creates .cenv from .env
  python app.py                 → runs this demo
"""

import os
import sys
import cenv

def main():
    print("\n🐦‍⬛ CrowEnv Python Demo\n")
    print("Loading secrets from .cenv...\n")

    # ── Step 1: Load .cenv into os.environ ────────────────────────────────
    try:
        cenv.load()   # reads .cenv, decrypts, injects into os.environ
    except FileNotFoundError:
        print("❌ .cenv not found.")
        print("   Run: crowenv encrypt   (after setting CENV_MASTER_KEY)")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to load .cenv: {e}")
        print("   Make sure CENV_MASTER_KEY is set correctly.")
        sys.exit(1)

    # ── Step 2: Use secrets normally via os.environ ────────────────────────
    print("✅ Secrets loaded into os.environ!\n")

    app_name    = os.getenv("APP_NAME",    "(not set)")
    db_host     = os.getenv("DB_HOST",     "(not set)")
    db_password = os.getenv("DB_PASSWORD", "(not set)")
    api_key     = os.getenv("API_KEY",     "(not set)")

    print("📦 App Config:")
    print(f"   APP_NAME    = {app_name}")
    print(f"   DB_HOST     = {db_host}")
    print(f"   DB_PASSWORD = {'*' * len(db_password)} ({len(db_password)} chars)")
    print(f"   API_KEY     = {api_key[:6]}... (masked)")

    print("\n🔐 Security summary:")
    print("   ✅ Secrets loaded from encrypted .cenv (AES-256-GCM)")
    print("   ✅ Plain .env never written to disk in this demo")
    print("   ✅ .cenv is safe to commit to Git")
    print("   ✅ Master key stored only in environment variable\n")

if __name__ == "__main__":
    main()
