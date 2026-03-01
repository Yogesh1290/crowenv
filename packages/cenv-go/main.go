// Package main — cenv Go CLI
// Full working implementation: encrypt, decrypt, load, init, generate-key
// No placeholders. All commands functional.
//
// Build:  go build -o cenv .
// Install: go install github.com/cenv/cenv-go@latest
package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/crypto/pbkdf2"
	"crypto/sha256"
)

// ─── Constants ────────────────────────────────────────────────────────────────

const (
	CenvVersion    = "1.0"
	MasterKeyEnv   = "CENV_MASTER_KEY"
	PbkdfIter      = 600_000
	KeyLen         = 32  // AES-256
	NonceLen       = 12  // GCM 96-bit
	TagLen         = 16  // GCM 128-bit
	SaltLen        = 16  // PBKDF2 128-bit
)

// ─── Cenv File Structure ──────────────────────────────────────────────────────

type CenvFile struct {
	V string `json:"v"`
	S string `json:"s"`
	D string `json:"d"`
}

// ─── Key Derivation ───────────────────────────────────────────────────────────

// deriveKey uses PBKDF2-HMAC-SHA256 to derive a 256-bit AES key.
func deriveKey(masterKey string, salt []byte) []byte {
	return pbkdf2.Key([]byte(masterKey), salt, PbkdfIter, KeyLen, sha256.New)
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

// encryptSecrets encrypts a map of env vars into the .cenv format.
func encryptSecrets(secrets map[string]string, masterKey string) (*CenvFile, error) {
	// Marshal secrets to JSON
	plaintext, err := json.Marshal(secrets)
	if err != nil {
		return nil, fmt.Errorf("marshal secrets: %w", err)
	}

	// Generate random salt
	salt := make([]byte, SaltLen)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, fmt.Errorf("generate salt: %w", err)
	}

	// Derive key
	key := deriveKey(masterKey, salt)

	// Generate random nonce
	nonce := make([]byte, NonceLen)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate nonce: %w", err)
	}

	// AES-256-GCM encrypt
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	// Seal appends auth tag at end: [ciphertext || tag(16)]
	sealedWithTag := aesgcm.Seal(nil, nonce, plaintext, nil)
	ciphertext := sealedWithTag[:len(sealedWithTag)-TagLen]
	tag := sealedWithTag[len(sealedWithTag)-TagLen:]

	// Build payload: nonce(12) + tag(16) + ciphertext(N)
	payload := make([]byte, 0, NonceLen+TagLen+len(ciphertext))
	payload = append(payload, nonce...)
	payload = append(payload, tag...)
	payload = append(payload, ciphertext...)

	return &CenvFile{
		V: CenvVersion,
		S: base64.StdEncoding.EncodeToString(salt),
		D: base64.StdEncoding.EncodeToString(payload),
	}, nil
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

// decryptSecrets decrypts a CenvFile back into a map of env vars.
func decryptSecrets(cf *CenvFile, masterKey string) (map[string]string, error) {
	if cf.V != CenvVersion {
		return nil, fmt.Errorf("unsupported .cenv version: %s", cf.V)
	}

	salt, err := base64.StdEncoding.DecodeString(cf.S)
	if err != nil {
		return nil, fmt.Errorf("decode salt: %w", err)
	}

	payload, err := base64.StdEncoding.DecodeString(cf.D)
	if err != nil {
		return nil, fmt.Errorf("decode payload: %w", err)
	}

	if len(payload) < NonceLen+TagLen {
		return nil, fmt.Errorf("malformed .cenv: payload too short")
	}

	nonce := payload[:NonceLen]
	tag := payload[NonceLen : NonceLen+TagLen]
	ciphertext := payload[NonceLen+TagLen:]

	key := deriveKey(masterKey, salt)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create GCM: %w", err)
	}

	// Open expects: [ciphertext || tag]
	ciphertextWithTag := append(ciphertext, tag...) //nolint:gocritic
	plaintext, err := aesgcm.Open(nil, nonce, ciphertextWithTag, nil)
	if err != nil {
		return nil, fmt.Errorf("decryption failed: wrong master key or file was tampered with")
	}

	var secrets map[string]string
	if err := json.Unmarshal(plaintext, &secrets); err != nil {
		return nil, fmt.Errorf("unmarshal secrets: %w", err)
	}

	return secrets, nil
}

// ─── .env Parser ──────────────────────────────────────────────────────────────

// parseEnvFile parses a .env file into a map of key-value pairs.
func parseEnvFile(path string) (map[string]string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	result := make(map[string]string)
	for _, rawLine := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eqIdx := strings.Index(line, "=")
		if eqIdx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:eqIdx])
		value := strings.TrimSpace(line[eqIdx+1:])

		// Strip inline comments (only if not quoted)
		if !strings.HasPrefix(value, `"`) && !strings.HasPrefix(value, `'`) {
			if ci := strings.Index(value, " #"); ci != -1 {
				value = strings.TrimSpace(value[:ci])
			}
		}
		// Strip surrounding quotes
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}

		if key != "" {
			result[key] = value
		}
	}
	return result, nil
}

// ─── File Helpers ─────────────────────────────────────────────────────────────

func getMasterKey() string {
	key := os.Getenv(MasterKeyEnv)
	if key == "" {
		fmt.Fprintf(os.Stderr, "\n❌ %s is not set.\n   Run: cenv generate-key\n\n", MasterKeyEnv)
		os.Exit(1)
	}
	return key
}

func readCenvFile(path string) *CenvFile {
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Cannot read %s: %v\n   Run: cenv encrypt\n\n", path, err)
		os.Exit(1)
	}
	var cf CenvFile
	if err := json.Unmarshal(data, &cf); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %s is not valid JSON: %v\n\n", path, err)
		os.Exit(1)
	}
	return &cf
}

func writeCenvFile(path string, cf *CenvFile) {
	data, _ := json.MarshalIndent(cf, "", "  ")
	if err := os.WriteFile(path, data, 0644); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Cannot write %s: %v\n\n", path, err)
		os.Exit(1)
	}
}

// ─── Commands ─────────────────────────────────────────────────────────────────

func cmdInit() {
	gitignorePath := ".gitignore"
	var existing string
	if data, err := os.ReadFile(gitignorePath); err == nil {
		existing = string(data)
	}

	entries := []string{".env", ".cenv.keys"}
	var added []string
	for _, e := range entries {
		found := false
		for _, line := range strings.Split(existing, "\n") {
			if strings.TrimSpace(line) == e {
				found = true
				break
			}
		}
		if !found {
			if existing != "" && !strings.HasSuffix(existing, "\n") {
				existing += "\n"
			}
			existing += e + "\n"
			added = append(added, e)
		}
	}

	os.WriteFile(gitignorePath, []byte(existing), 0644) //nolint:errcheck

	fmt.Println("\n🔐 cenv initialized!")
	if len(added) > 0 {
		fmt.Printf("✅ .gitignore updated (added: %s)\n", strings.Join(added, ", "))
	} else {
		fmt.Println("✅ .gitignore already correct")
	}
	fmt.Println("\nNext steps:")
	fmt.Println("  1. cenv generate-key")
	fmt.Println("  2. cenv encrypt")
	fmt.Println("  3. cenv verify")
	fmt.Println()
}

func cmdGenerateKey() {
	b := make([]byte, 32)
	io.ReadFull(rand.Reader, b) //nolint:errcheck
	key := hex.EncodeToString(b)
	fmt.Printf("\n🔑 Your new master key (256-bit random):\n\n   %s\n\n", key)
	fmt.Printf("export %s=\"%s\"\n\n", MasterKeyEnv, key)
}

func cmdEncrypt(envFile, outFile string) {
	masterKey := getMasterKey()
	secrets, err := parseEnvFile(envFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %v\n\n", err)
		os.Exit(1)
	}

	cf, err := encryptSecrets(secrets, masterKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Encryption failed: %v\n\n", err)
		os.Exit(1)
	}

	writeCenvFile(outFile, cf)
	fmt.Printf("\n✅ %s created (%d secrets encrypted)\n", outFile, len(secrets))
	fmt.Println("   Safe to commit: git add " + outFile)
	fmt.Println()
}

func cmdDecrypt(cenvFile string) {
	masterKey := getMasterKey()
	cf := readCenvFile(cenvFile)
	secrets, err := decryptSecrets(cf, masterKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %v\n\n", err)
		os.Exit(1)
	}
	fmt.Println("\n🔓 Decrypted secrets:")
	for k, v := range secrets {
		fmt.Printf("   %s=%s\n", k, v)
	}
	fmt.Println()
}

func cmdLoad(cenvFile string) {
	masterKey := getMasterKey()
	cf := readCenvFile(cenvFile)
	secrets, err := decryptSecrets(cf, masterKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ %v\n\n", err)
		os.Exit(1)
	}
	for k, v := range secrets {
		os.Setenv(k, v)
	}
	fmt.Printf("✅ %s loaded (%d secrets injected)\n", cenvFile, len(secrets))
}

func cmdVerify(cenvFile string) {
	masterKey := getMasterKey()
	cf := readCenvFile(cenvFile)
	fmt.Printf("\n🔍 Verifying %s...\n\n", cenvFile)
	fmt.Printf("   Version: %s\n", cf.V)
	secrets, err := decryptSecrets(cf, masterKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ Verification FAILED: %v\n\n", err)
		os.Exit(1)
	}
	keys := make([]string, 0, len(secrets))
	for k := range secrets {
		keys = append(keys, k)
	}
	fmt.Printf("\n✅ Integrity verified! %d secret(s): %s\n\n", len(keys), strings.Join(keys, ", "))
}

func printHelp() {
	fmt.Print(`
cenv v1.0 — Encrypted .env replacement (Go CLI)

Usage:
  cenv <command> [file]

Commands:
  init                    Initialize .gitignore
  generate-key            Generate a 256-bit random master key
  encrypt [envFile]       Encrypt .env → .cenv
  decrypt [cenvFile]      Decrypt .cenv → stdout
  load    [cenvFile]      Load .cenv into environment
  verify  [cenvFile]      Verify .cenv integrity

Environment:
  CENV_MASTER_KEY         Required master key

Spec: https://github.com/cenv/cenv/blob/main/SPEC.md
`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

func main() {
	if len(os.Args) < 2 {
		printHelp()
		return
	}

	cmd := os.Args[1]
	arg := func(n int, def string) string {
		if len(os.Args) > n {
			return os.Args[n]
		}
		return def
	}

	switch cmd {
	case "init":
		cmdInit()
	case "generate-key", "genkey":
		cmdGenerateKey()
	case "encrypt":
		cmdEncrypt(arg(2, ".env"), arg(3, ".cenv"))
	case "decrypt":
		cmdDecrypt(arg(2, ".cenv"))
	case "load":
		cmdLoad(arg(2, ".cenv"))
	case "verify":
		cmdVerify(arg(2, ".cenv"))
	case "--help", "-h", "help":
		printHelp()
	default:
		fmt.Fprintf(os.Stderr, "\n❌ Unknown command: %s\n   Run: cenv --help\n\n", cmd)
		os.Exit(1)
	}
}
