#!/usr/bin/env bash
set -euo pipefail

# Usage: ./publish.sh <version>
# Example: ./publish.sh 0.0.5
#
# Tokens are read from environment variables or a local .env file (git-ignored):
#   VSCE_PAT=...
#   OVSX_PAT=...

if [ -z "${1:-}" ]; then
  echo "Usage: ./publish.sh <version>"
  exit 1
fi

VERSION="$1"

# Load .env if present
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

if [ -z "${VSCE_PAT:-}" ] || [ -z "${OVSX_PAT:-}" ]; then
  echo "Error: VSCE_PAT and OVSX_PAT must be set (env vars or .env file)"
  exit 1
fi

echo "▶ Bumping version to $VERSION"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "▶ Publishing to VS Code Marketplace"
npx vsce publish --pat "$VSCE_PAT"

echo "▶ Building Open VSX VSIX (name: markdown-commenter)"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.name = 'markdown-commenter';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
npx vsce package --out markdown-commenter.vsix
git checkout package.json

echo "▶ Publishing to Open VSX"
npx ovsx publish markdown-commenter.vsix --pat "$OVSX_PAT"
rm markdown-commenter.vsix

echo "▶ Committing and tagging v$VERSION"
git add package.json
git commit -m "chore: bump version to $VERSION"
git tag "v$VERSION"
git push && git push origin "v$VERSION"

echo "✓ Done — v$VERSION published to both marketplaces"
