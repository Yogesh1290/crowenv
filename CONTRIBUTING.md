# Contributing to CrowEnv

Thank you for contributing to CrowEnv 🐦‍⬛ — every line of code makes secrets safer for all developers.

## Ways to Contribute

- 🐛 **Bug reports** — open a GitHub Issue
- 🌟 **Feature requests** — open a Discussion
- 💻 **Code** — fork, branch, PR
- 📄 **Docs** — improve README, SPEC.md, or add examples
- 🌍 **Loaders** — add cenv support to a new language

## Development Setup

### Node.js CLI

```bash
cd packages/cenv-node
# No install needed — zero deps!
export CENV_MASTER_KEY="test-key-$(openssl rand -hex 16)"
node test/test.js   # run tests
node index.js --help   # shows crowenv help
```

### Python

```bash
cd packages/cenv-python
pip install -e ".[dev]"
python -m pytest
```

### Go

```bash
cd packages/cenv-go
go mod tidy
go test ./...
go build -o cenv .
```

### Rust

```bash
cd packages/cenv-rs
cargo test
cargo build --release
```

## Pull Request Guidelines

1. **Tests**: All new crypto code must include tests
2. **Spec compliance**: Any changes to the format must update `SPEC.md`
3. **No placeholders**: All submitted code must be fully functional
4. **Security**: Cryptographic changes require detailed justification

## Reporting Security Issues

**Do NOT open public issues for security vulnerabilities.** See [SECURITY.md](SECURITY.md).

Full submission guide: [github.com/Yogesh1290/crowenv](https://github.com/Yogesh1290/crowenv)
