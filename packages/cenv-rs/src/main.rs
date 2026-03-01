// CrowEnv — Rust CLI 🐦‍⬛
// Full working implementation: encrypt, decrypt, load, verify, init, generate-key
// Build: cargo build --release
// Install: cargo install --path .

use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use hmac::Hmac;
use pbkdf2::pbkdf2;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::env;
use std::fs;

// ─── Constants ────────────────────────────────────────────────────────────────

const CENV_VERSION: &str = "1.0";
const MASTER_KEY_ENV: &str = "CENV_MASTER_KEY";
const PBKDF2_ROUNDS: u32 = 600_000;
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const SALT_LEN: usize = 16;

// ─── Cenv File Structure ──────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug)]
struct CenvFile {
    v: String,
    s: String,
    d: String,
}

// ─── Key Derivation ───────────────────────────────────────────────────────────

fn derive_key(master_key: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2::<Hmac<Sha256>>(master_key.as_bytes(), salt, PBKDF2_ROUNDS, &mut key)
        .expect("PBKDF2 failed");
    key
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

fn encrypt_secrets(
    secrets: &HashMap<String, String>,
    master_key: &str,
) -> Result<CenvFile, String> {
    let plaintext = serde_json::to_vec(secrets).map_err(|e| e.to_string())?;

    // Random salt
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);

    // Derive key
    let key_bytes = derive_key(master_key, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;

    // Random nonce
    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    // Encrypt — aes-gcm appends tag at end: [ciphertext || tag(16)]
    let ciphertext_with_tag = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| e.to_string())?;

    let ciphertext = &ciphertext_with_tag[..ciphertext_with_tag.len() - TAG_LEN];
    let tag = &ciphertext_with_tag[ciphertext_with_tag.len() - TAG_LEN..];

    // Build payload: nonce(12) + tag(16) + ciphertext(N)
    let mut payload = Vec::with_capacity(NONCE_LEN + TAG_LEN + ciphertext.len());
    payload.extend_from_slice(&nonce_bytes);
    payload.extend_from_slice(tag);
    payload.extend_from_slice(ciphertext);

    Ok(CenvFile {
        v: CENV_VERSION.to_string(),
        s: BASE64.encode(salt),
        d: BASE64.encode(payload),
    })
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

fn decrypt_secrets(
    cf: &CenvFile,
    master_key: &str,
) -> Result<HashMap<String, String>, String> {
    if cf.v != CENV_VERSION {
        return Err(format!("Unsupported .cenv version: {}", cf.v));
    }

    let salt = BASE64.decode(&cf.s).map_err(|e| format!("decode salt: {}", e))?;
    let payload = BASE64.decode(&cf.d).map_err(|e| format!("decode payload: {}", e))?;

    if payload.len() < NONCE_LEN + TAG_LEN {
        return Err("Malformed .cenv: payload too short".to_string());
    }

    let nonce_bytes = &payload[..NONCE_LEN];
    let tag = &payload[NONCE_LEN..NONCE_LEN + TAG_LEN];
    let ciphertext = &payload[NONCE_LEN + TAG_LEN..];

    let key_bytes = derive_key(master_key, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);

    // aes-gcm expects [ciphertext || tag]
    let mut ct_with_tag = Vec::with_capacity(ciphertext.len() + TAG_LEN);
    ct_with_tag.extend_from_slice(ciphertext);
    ct_with_tag.extend_from_slice(tag);

    let plaintext = cipher
        .decrypt(nonce, ct_with_tag.as_ref())
        .map_err(|_| "Decryption failed: wrong master key or file was tampered with".to_string())?;

    serde_json::from_slice(&plaintext).map_err(|e| format!("unmarshal secrets: {}", e))
}

// ─── .env Parser ──────────────────────────────────────────────────────────────

fn parse_env_file(path: &str) -> Result<HashMap<String, String>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("read {}: {}", path, e))?;
    let mut result = HashMap::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let eq_pos = match line.find('=') {
            Some(p) => p,
            None => continue,
        };
        let key = line[..eq_pos].trim().to_string();
        let mut value = line[eq_pos + 1..].trim().to_string();

        // Strip inline comments (only if not quoted)
        if !value.starts_with('"') && !value.starts_with('\'') {
            if let Some(ci) = value.find(" #") {
                value = value[..ci].trim().to_string();
            }
        }

        // Strip surrounding quotes
        if value.len() >= 2 {
            let first = value.chars().next().unwrap();
            let last = value.chars().last().unwrap();
            if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
                value = value[1..value.len() - 1].to_string();
            }
        }

        if !key.is_empty() {
            result.insert(key, value);
        }
    }

    Ok(result)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn get_master_key() -> String {
    env::var(MASTER_KEY_ENV).unwrap_or_else(|_| {
        eprintln!("\n❌ {} is not set.\n   Run: cenv generate-key\n", MASTER_KEY_ENV);
        std::process::exit(1);
    })
}

fn read_cenv_file(path: &str) -> CenvFile {
    let content = fs::read_to_string(path).unwrap_or_else(|e| {
        eprintln!("\n❌ Cannot read {}: {}\n   Run: cenv encrypt\n", path, e);
        std::process::exit(1);
    });
    serde_json::from_str(&content).unwrap_or_else(|e| {
        eprintln!("\n❌ {} is not valid JSON: {}\n", path, e);
        std::process::exit(1);
    })
}

fn write_cenv_file(path: &str, cf: &CenvFile) {
    let json = serde_json::to_string_pretty(cf).expect("serialize .cenv");
    fs::write(path, json).unwrap_or_else(|e| {
        eprintln!("\n❌ Cannot write {}: {}\n", path, e);
        std::process::exit(1);
    });
}

// ─── Commands ─────────────────────────────────────────────────────────────────

fn cmd_init() {
    let path = ".gitignore";
    let existing = fs::read_to_string(path).unwrap_or_default();
    let entries = [".env", ".cenv.keys"];
    let mut content = existing.clone();
    let mut added = vec![];

    for entry in &entries {
        if !existing.lines().any(|l| l.trim() == *entry) {
            if !content.ends_with('\n') && !content.is_empty() {
                content.push('\n');
            }
            content.push_str(entry);
            content.push('\n');
            added.push(*entry);
        }
    }

    fs::write(path, &content).expect("write .gitignore");
    println!("\n🔐 cenv initialized!");
    if !added.is_empty() {
        println!("✅ .gitignore updated (added: {})", added.join(", "));
    } else {
        println!("✅ .gitignore already correct");
    }
    println!("\nNext steps:");
    println!("  1. cenv generate-key");
    println!("  2. cenv encrypt");
    println!();
}

fn cmd_generate_key() {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let key: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    println!("\n🔑 Your new master key (256-bit random):\n\n   {}\n", key);
    println!("export {}=\"{}\"\n", MASTER_KEY_ENV, key);
}

fn cmd_encrypt(env_file: &str, out_file: &str) {
    let master_key = get_master_key();
    let secrets = parse_env_file(env_file).unwrap_or_else(|e| {
        eprintln!("\n❌ {}\n", e);
        std::process::exit(1);
    });
    let cf = encrypt_secrets(&secrets, &master_key).unwrap_or_else(|e| {
        eprintln!("\n❌ Encryption failed: {}\n", e);
        std::process::exit(1);
    });
    write_cenv_file(out_file, &cf);
    println!("\n✅ {} created ({} secrets encrypted)", out_file, secrets.len());
    println!("   Safe to commit: git add {}\n", out_file);
}

fn cmd_decrypt(cenv_file: &str) {
    let master_key = get_master_key();
    let cf = read_cenv_file(cenv_file);
    let secrets = decrypt_secrets(&cf, &master_key).unwrap_or_else(|e| {
        eprintln!("\n❌ {}\n", e);
        std::process::exit(1);
    });
    println!("\n🔓 Decrypted secrets:");
    for (k, v) in &secrets {
        println!("   {}={}", k, v);
    }
    println!();
}

fn cmd_load(cenv_file: &str) {
    let master_key = get_master_key();
    let cf = read_cenv_file(cenv_file);
    let secrets = decrypt_secrets(&cf, &master_key).unwrap_or_else(|e| {
        eprintln!("\n❌ {}\n", e);
        std::process::exit(1);
    });
    for (k, v) in &secrets {
        env::set_var(k, v);
    }
    println!("✅ {} loaded ({} secrets injected)", cenv_file, secrets.len());
}

fn cmd_verify(cenv_file: &str) {
    let master_key = get_master_key();
    let cf = read_cenv_file(cenv_file);
    println!("\n🔍 Verifying {}...\n   Version: {}", cenv_file, cf.v);
    match decrypt_secrets(&cf, &master_key) {
        Ok(secrets) => {
            let keys: Vec<_> = secrets.keys().cloned().collect();
            println!("\n✅ Integrity verified! {} secret(s): {}\n", keys.len(), keys.join(", "));
        }
        Err(e) => {
            eprintln!("\n❌ Verification FAILED: {}\n", e);
            std::process::exit(1);
        }
    }
}

fn print_help() {
    println!(
        r#"
crowenv v1.0 — Smart secrets. Like a crow. 🐦‍⬛ (Rust CLI)

Usage:
  crowenv <command> [file]

Commands:
  init                    Initialize .gitignore
  generate-key            Generate a 256-bit random master key
  encrypt [envFile]       Encrypt .env → .cenv
  decrypt [cenvFile]      Decrypt .cenv → stdout
  load    [cenvFile]      Load .cenv into environment
  verify  [cenvFile]      Verify .cenv integrity

Environment:
  CENV_MASTER_KEY         Required master key

GitHub: https://github.com/Yogesh1290/crowenv
Spec:   https://github.com/Yogesh1290/crowenv/blob/main/SPEC.md
"#
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("help");
    let arg = |n: usize, def: &str| -> String {
        args.get(n).cloned().unwrap_or_else(|| def.to_string())
    };

    match cmd {
        "init" => cmd_init(),
        "generate-key" | "genkey" => cmd_generate_key(),
        "encrypt" => cmd_encrypt(&arg(2, ".env"), &arg(3, ".cenv")),
        "decrypt" => cmd_decrypt(&arg(2, ".cenv")),
        "load" => cmd_load(&arg(2, ".cenv")),
        "verify" => cmd_verify(&arg(2, ".cenv")),
        "--help" | "-h" | "help" => print_help(),
        _ => {
            eprintln!("\n❌ Unknown command: {}\n   Run: cenv --help\n", cmd);
            std::process::exit(1);
        }
    }
}
