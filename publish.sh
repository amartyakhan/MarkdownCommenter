#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./publish.sh          — auto-bumps patch (0.0.4 → 0.0.5)
#   ./publish.sh minor    — bumps minor (0.0.4 → 0.1.0)
#   ./publish.sh major    — bumps major (0.0.4 → 1.0.0)
#   ./publish.sh 1.2.3    — sets exact version
#
# Tokens are read from environment variables or a local .env file (git-ignored):
#   VSCE_PAT=...
#   OVSX_PAT=...

BUMP="${1:-patch}"

# Load .env if present
if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a; source .env; set +a
fi

if [ -z "${VSCE_PAT:-}" ] || [ -z "${OVSX_PAT:-}" ]; then
  echo "Error: VSCE_PAT and OVSX_PAT must be set (env vars or .env file)"
  exit 1
fi

# Track per-target results
VSCE_STATUS="ok"
OVSX_STATUS="ok"

# Compute new version
CURRENT=$(node -p "require('./package.json').version")
VERSION=$(node -e "
  const [major, minor, patch] = '$CURRENT'.split('.').map(Number);
  const bump = '$BUMP';
  if (bump === 'major') console.log((major+1) + '.0.0');
  else if (bump === 'minor') console.log(major + '.' + (minor+1) + '.0');
  else if (bump === 'patch') console.log(major + '.' + minor + '.' + (patch+1));
  else console.log(bump);
")

echo "▶ Bumping $CURRENT → $VERSION"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# ── VS Code Marketplace ──────────────────────────────────────────────────────
echo ""
echo "▶ Publishing to VS Code Marketplace"
if npx vsce publish --pat "$VSCE_PAT"; then
  echo "✓ VS Code Marketplace — published"
else
  echo "✗ VS Code Marketplace — FAILED"
  VSCE_STATUS="failed"
fi

# ── Open VSX ─────────────────────────────────────────────────────────────────
echo ""
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
if npx ovsx publish markdown-commenter.vsix --pat "$OVSX_PAT"; then
  echo "✓ Open VSX — published"
else
  echo "✗ Open VSX — FAILED"
  OVSX_STATUS="failed"
fi
rm -f markdown-commenter.vsix

# ── Commit & tag (only if at least one publish succeeded) ────────────────────
echo ""
if [ "$VSCE_STATUS" = "ok" ] || [ "$OVSX_STATUS" = "ok" ]; then
  echo "▶ Committing and tagging v$VERSION"
  git add package.json
  git commit -m "chore: bump version to $VERSION"
  git tag "v$VERSION"
  git push && git push origin "v$VERSION"
else
  echo "⚠ Both publishes failed — reverting package.json, nothing committed"
  git checkout package.json
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "── Publish summary ──────────────────────"
echo "  VS Code Marketplace : $VSCE_STATUS"
echo "  Open VSX            : $OVSX_STATUS"
echo "─────────────────────────────────────────"

if [ "$VSCE_STATUS" = "failed" ] || [ "$OVSX_STATUS" = "failed" ]; then
  exit 1
fi
