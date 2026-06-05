#!/usr/bin/env bash
# publish.sh — Build and publish Git Vertex to VS Code Marketplace and Open VSX.
#
# Usage:
#   ./scripts/publish.sh                     # publish current version
#   ./scripts/publish.sh --bump patch        # bump patch, then publish
#   ./scripts/publish.sh --bump minor        # bump minor, then publish
#   ./scripts/publish.sh --bump major        # bump major, then publish
#   ./scripts/publish.sh --marketplace-only  # skip Open VSX
#   ./scripts/publish.sh --openvsx-only      # skip VS Code Marketplace
#   ./scripts/publish.sh --dry-run           # package only, do not publish
#
# Required env vars (or set them in .env.publish — see .env.publish.example):
#   VSCE_PAT        Personal Access Token for VS Code Marketplace (Azure DevOps)
#   OVSX_PAT        Personal Access Token for Open VSX (https://open-vsx.org)

set -euo pipefail

# ── Load optional .env.publish ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT/.env.publish"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

# ── Parse arguments ───────────────────────────────────────────────────────────
BUMP=""
DO_MARKETPLACE=true
DO_OPENVSX=true
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump) BUMP="${2:?--bump requires patch|minor|major}"; shift 2 ;;
    --marketplace-only) DO_OPENVSX=false; shift ;;
    --openvsx-only) DO_MARKETPLACE=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${BLUE}▶ $*${NC}"; }
success() { echo -e "${GREEN}✓ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# ── Checks ────────────────────────────────────────────────────────────────────
command -v node  >/dev/null 2>&1 || die "node is not installed"
command -v npm   >/dev/null 2>&1 || die "npm is not installed"

# Prefer global vsce; fall back to npx so the script works without a global install.
if command -v vsce >/dev/null 2>&1; then
  VSCE=vsce
else
  warn "vsce not found globally — using npx @vscode/vsce (slower first run)"
  VSCE="npx --yes @vscode/vsce"
fi

cd "$ROOT"

# ── Bump version ──────────────────────────────────────────────────────────────
if [[ -n "$BUMP" ]]; then
  [[ "$BUMP" =~ ^(patch|minor|major)$ ]] || die "Invalid bump type: $BUMP (use patch, minor, or major)"
  info "Bumping $BUMP version…"
  OLD_VERSION=$(node -p "require('./package.json').version")
  npm version "$BUMP" --no-git-tag-version   # updates package.json only
  NEW_VERSION=$(node -p "require('./package.json').version")
  success "Version: $OLD_VERSION → $NEW_VERSION"
  # Also keep the desktop app's package.json version in sync
  DESKTOP_PKG="$(cd "$ROOT/.." && pwd)/package.json"
  if [[ -f "$DESKTOP_PKG" ]]; then
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$DESKTOP_PKG','utf8'));
      p.version = '$NEW_VERSION';
      fs.writeFileSync('$DESKTOP_PKG', JSON.stringify(p, null, 2) + '\n');
    "
    success "Desktop package.json also updated to $NEW_VERSION"
  fi
else
  NEW_VERSION=$(node -p "require('./package.json').version")
  info "Publishing version $NEW_VERSION (no bump)"
fi

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building extension…"
npm run compile
success "Build complete"

# ── Package ───────────────────────────────────────────────────────────────────
info "Packaging VSIX…"
VSIX_FILE="git-vertex-${NEW_VERSION}.vsix"
$VSCE package --no-dependencies --out "$VSIX_FILE"
success "Packaged → $VSIX_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  warn "Dry-run mode: skipping publication. VSIX is at $ROOT/$VSIX_FILE"
  exit 0
fi

# ── Publish to VS Code Marketplace ───────────────────────────────────────────
if [[ "$DO_MARKETPLACE" == "true" ]]; then
  if [[ -z "${VSCE_PAT:-}" ]]; then
    die "VSCE_PAT is not set. Add it to $ENV_FILE or export it before running this script."
  fi
  info "Publishing to VS Code Marketplace…"
  VSCE_PAT="$VSCE_PAT" $VSCE publish --no-dependencies --packagePath "$VSIX_FILE"
  success "Published to Marketplace: https://marketplace.visualstudio.com/items?itemName=VictorQuilgars.git-vertex"
fi

# ── Publish to Open VSX ───────────────────────────────────────────────────────
if [[ "$DO_OPENVSX" == "true" ]]; then
  if [[ -z "${OVSX_PAT:-}" ]]; then
    warn "OVSX_PAT is not set — skipping Open VSX publication."
  else
    if ! command -v ovsx >/dev/null 2>&1; then
      info "Installing ovsx globally…"
      npm install -g ovsx
    fi
    info "Publishing to Open VSX…"
    ovsx publish "$VSIX_FILE" -p "$OVSX_PAT"
    success "Published to Open VSX: https://open-vsx.org/extension/VictorQuilgars/git-vertex"
  fi
fi

# ── Git tag ───────────────────────────────────────────────────────────────────
if [[ -n "$BUMP" ]]; then
  info "Creating git tag v${NEW_VERSION}…"
  git -C "$ROOT/.." add \
    "$ROOT/package.json" \
    "$ROOT/../package.json" 2>/dev/null || true
  git -C "$ROOT/.." commit -m "chore(release): v${NEW_VERSION}" || true
  git -C "$ROOT/.." tag "v${NEW_VERSION}"
  success "Tag v${NEW_VERSION} created (run 'git push && git push --tags' to push)"
fi

echo ""
success "Done! Git Vertex v${NEW_VERSION} is live."
