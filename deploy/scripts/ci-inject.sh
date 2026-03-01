#!/usr/bin/env bash
# cenv CI inject script — encrypt and deploy in one step
# Usage in CI (GitHub Actions, GitLab CI, etc.):
#
#   # GitHub Actions:
#   - name: Deploy with cenv
#     env:
#       CENV_MASTER_KEY: ${{ secrets.CENV_MASTER_KEY }}
#     run: bash deploy/scripts/ci-inject.sh

set -euo pipefail

echo "🔐 cenv CI Inject Script"
echo "========================"

# Check CENV_MASTER_KEY is set
if [ -z "${CENV_MASTER_KEY:-}" ]; then
  echo "❌ CENV_MASTER_KEY is not set."
  echo "   Set it as a CI/CD secret:"
  echo "   GitHub Actions: Settings > Secrets > CENV_MASTER_KEY"
  echo "   GitLab CI:      Settings > CI/CD > Variables > CENV_MASTER_KEY"
  exit 1
fi

# Install cenv if not present
if ! command -v cenv &> /dev/null; then
  echo "📦 Installing cenv CLI..."
  npm install -g cenv
fi

# If .cenv exists, verify it
if [ -f ".cenv" ]; then
  echo "🔍 Verifying .cenv integrity..."
  cenv verify
  echo ""
fi

# If .env exists (CI may have generated it), encrypt it
if [ -f ".env" ]; then
  echo "🔐 Encrypting .env → .cenv..."
  cenv encrypt
  rm .env
  echo "✅ .env encrypted and deleted"
fi

# Kubernetes: create/update the cenv configmap
if command -v kubectl &> /dev/null && [ -f ".cenv" ]; then
  echo ""
  echo "☸️  Updating Kubernetes ConfigMap..."
  kubectl create configmap cenv-config \
    --from-file=.cenv \
    --dry-run=client \
    -o yaml | kubectl apply -f -
  echo "✅ Kubernetes ConfigMap updated"
fi

echo ""
echo "✅ cenv CI inject complete!"
