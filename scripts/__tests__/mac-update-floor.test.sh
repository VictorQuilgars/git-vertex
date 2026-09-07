#!/usr/bin/env bash
# =============================================================================
# Tests for the macOS floor written into latest-mac.yml (scripts/mac-update-floor.js).
#
#   bash scripts/__tests__/mac-update-floor.test.sh
#
# What this guards is not a formatting detail. The field decides whether a Mac
# that cannot run the new build is offered it anyway — and the failure mode of
# getting it wrong is silent: a plausible-looking number that blocks nothing,
# and an update that replaces a working app with one macOS refuses to open.
#
# Fixtures only: a temporary yml, never the repository's own release files.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SCRIPT="$ROOT/scripts/mac-update-floor.js"

PASS=0; FAIL=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"
    printf '      expected: %s\n      actual:   %s\n' "$2" "$3"
  fi
}

feed() { # a latest-mac.yml shaped like the one electron-builder writes
  cat > "$1" <<'EOF'
version: 1.35.0
files:
  - url: Git-Vertex-1.35.0-arm64-mac.zip
    sha512: aaa==
    size: 1
  - url: Git-Vertex-1.35.0-mac.zip
    sha512: bbb==
    size: 2
path: Git-Vertex-1.35.0-arm64-mac.zip
sha512: aaa==
releaseDate: '2026-09-07T20:00:00.000Z'
EOF
}

# ── the marketing version is not the number that goes in the file ────────────
check "macOS 13 is written as Darwin 22" \
  "22.0.0" "$(node -e 'process.stdout.write(require(process.argv[1]).darwinFloor("13.0"))' "$SCRIPT")"
check "macOS 12 is Darwin 21" \
  "21.0.0" "$(node -e 'process.stdout.write(require(process.argv[1]).darwinFloor("12"))' "$SCRIPT")"
# The arithmetic everyone reaches for (+9) is right until it is not: macOS 15 is
# Darwin 24 and macOS 26 is Darwin 25, because the numbering jumped.
check "macOS 15 is Darwin 24" \
  "24.0.0" "$(node -e 'process.stdout.write(require(process.argv[1]).darwinFloor("15.0"))' "$SCRIPT")"
check "macOS 26 is Darwin 25, not 35" \
  "25.0.0" "$(node -e 'process.stdout.write(require(process.argv[1]).darwinFloor("26.0"))' "$SCRIPT")"
check "a macOS nobody mapped is refused rather than guessed" \
  "threw" "$(node -e 'try { require(process.argv[1]).darwinFloor("17.0"); process.stdout.write("returned") } catch { process.stdout.write("threw") }' "$SCRIPT")"

# ── the file it writes ───────────────────────────────────────────────────────
feed "$TMP/latest-mac.yml"
node "$SCRIPT" "$TMP/latest-mac.yml" --macos 13.0 > /dev/null
check "the floor is in the feed" \
  "minimumSystemVersion: 22.0.0" "$(grep '^minimumSystemVersion' "$TMP/latest-mac.yml")"
check "the rest of the feed is untouched" \
  "version: 1.35.0" "$(sed -n '1p' "$TMP/latest-mac.yml")"
check "both architectures are still listed — Intel updates through this file too" \
  "2" "$(grep -c 'url: Git-Vertex' "$TMP/latest-mac.yml")"

# ── run twice, said once ─────────────────────────────────────────────────────
node "$SCRIPT" "$TMP/latest-mac.yml" --macos 13.0 > /dev/null
check "running again does not add a second line" \
  "1" "$(grep -c '^minimumSystemVersion' "$TMP/latest-mac.yml")"
node "$SCRIPT" "$TMP/latest-mac.yml" --macos 14.0 > /dev/null
check "a raised floor replaces the old one" \
  "minimumSystemVersion: 23.0.0" "$(grep '^minimumSystemVersion' "$TMP/latest-mac.yml")"

# ── the default comes from what the app itself declares ──────────────────────
feed "$TMP/default.yml"
node "$SCRIPT" "$TMP/default.yml" > /dev/null
DECLARED="$(node -e 'process.stdout.write(require(process.argv[1] + "/package.json").build.mac.minimumSystemVersion)' "$ROOT")"
EXPECTED="$(node -e 'process.stdout.write(require(process.argv[1]).darwinFloor(process.argv[2]))' "$SCRIPT" "$DECLARED")"
check "with no argument it follows build.mac.minimumSystemVersion ($DECLARED)" \
  "minimumSystemVersion: $EXPECTED" "$(grep '^minimumSystemVersion' "$TMP/default.yml")"

printf '\n%b%d passed%b' '\033[32m' "$PASS" '\033[0m'
[ "$FAIL" -gt 0 ] && printf ', %b%d failed%b\n' '\033[31m' "$FAIL" '\033[0m' && exit 1
printf '\n'
