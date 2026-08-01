#!/usr/bin/env bash
# =============================================================================
# Tests for the `## Unreleased` → `## <version>` promotion in release.sh.
#
#   bash scripts/__tests__/promote-unreleased.test.sh
#
# Fixtures only: this never runs a release, never touches git, and never reads
# the repository's own changelogs. A harness that works on the real tree is how
# a test run ends up leaving commits behind.
#
# The function under test is sourced out of release.sh rather than copied, so
# the two cannot drift — copying it is exactly how the "is this version already
# tagged?" check drifted across three workflows and mirrored the wrong release.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Pull just the function out of release.sh (it exits early without arguments).
eval "$(awk '/^promote_unreleased\(\) \{/,/^\}/' "$ROOT/scripts/release.sh")"

PASS=0; FAIL=0
check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); printf '  \033[31m✗\033[0m %s\n' "$1"
    printf '      expected: %s\n      actual:   %s\n' "$2" "$3"
  fi
}

# ── a changelog whose top section is Unreleased ──────────────────────────────
cat > "$TMP/CHANGELOG.md" <<'EOF'
# Changelog

## Unreleased

### Added
- Something new.

## 1.27.0

### Fixed
- Something old.
EOF
promote_unreleased "$TMP/CHANGELOG.md" "1.28.0"
check "the heading becomes the version" \
  "## 1.28.0" "$(sed -n '3p' "$TMP/CHANGELOG.md")"
check "the section below is untouched" \
  "- Something new." "$(sed -n '6p' "$TMP/CHANGELOG.md")"
check "older sections are untouched" \
  "## 1.27.0" "$(sed -n '8p' "$TMP/CHANGELOG.md")"
check "the section is now extractable by version" \
  "### Added
- Something new." "$(bash "$ROOT/scripts/changelog-section.sh" "$TMP/CHANGELOG.md" 1.28.0)"

# ── a changelog with no Unreleased heading is left alone ─────────────────────
cat > "$TMP/PLAIN.md" <<'EOF'
# Changelog

## 1.27.0
- Only this.
EOF
before="$(cat "$TMP/PLAIN.md")"
promote_unreleased "$TMP/PLAIN.md" "1.28.0"
check "a file without Unreleased is byte-identical" "$before" "$(cat "$TMP/PLAIN.md")"

# ── the in-app notes: key AND the version inside the body ────────────────────
cat > "$TMP/release-notes.ts" <<'EOF'
export const RELEASE_NOTES: Record<string, string> = {
  'Unreleased': `## What's new in Unreleased

### A thing
- It does something.
`,
  '1.27.0': `## What's new in 1.27.0

- Older, and must not be rewritten to Unreleased or anything else.
`,
}
EOF
promote_unreleased "$TMP/release-notes.ts" "1.28.0"
check "the notes key becomes the version" \
  "  '1.28.0': \`## What's new in 1.28.0" "$(sed -n '2p' "$TMP/release-notes.ts")"
check "the previous entry keeps its own version" \
  "  '1.27.0': \`## What's new in 1.27.0" "$(sed -n '7p' "$TMP/release-notes.ts")"
# The fixture puts the word in the OLDER entry's prose on purpose: promotion
# must stop at the next version key, not sweep the whole file.
check "the word survives in an older entry's prose" \
  1 "$(grep -c 'must not be rewritten to Unreleased' "$TMP/release-notes.ts")"
check "no Unreleased left in the promoted entry" \
  0 "$(sed -n '2,6p' "$TMP/release-notes.ts" | grep -c 'Unreleased')"

# ── an Unreleased heading that is not at the top still works ─────────────────
cat > "$TMP/MID.md" <<'EOF'
# Changelog

## 1.27.0
- Shipped.

## Unreleased
- Pending.
EOF
promote_unreleased "$TMP/MID.md" "1.28.0"
check "a non-leading Unreleased heading is promoted too" \
  "## 1.28.0" "$(sed -n '6p' "$TMP/MID.md")"

# ── the word Unreleased in prose is not a heading ────────────────────────────
cat > "$TMP/PROSE.md" <<'EOF'
# Changelog

## 1.27.0
- Mentions the word Unreleased in a sentence, which must survive.
EOF
promote_unreleased "$TMP/PROSE.md" "1.28.0"
check "the word in prose is left alone" \
  1 "$(grep -c 'word Unreleased in a sentence' "$TMP/PROSE.md")"

echo
if [ "$FAIL" -gt 0 ]; then
  printf '\033[31m%d failed\033[0m, %d passed\n' "$FAIL" "$PASS"; exit 1
fi
printf '\033[32m%d passed\033[0m\n' "$PASS"
