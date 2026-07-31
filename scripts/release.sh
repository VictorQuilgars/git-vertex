#!/usr/bin/env bash
# =============================================================================
# Release one product. The same command for all four.
#
#   scripts/release.sh app patch          1.25.0 -> 1.25.1
#   scripts/release.sh ext minor          1.23.0 -> 1.24.0
#   scripts/release.sh cli 0.2.0          an explicit version
#   scripts/release.sh mcp patch --dry-run
#
# It bumps the version in that product's package.json, commits, and pushes to
# main. Nothing else: CI notices the new version, tags it, builds and publishes.
# There is no tag to type and no second mechanism to remember — the desktop app
# used to need one, and the extension had a third path (a publish.sh that
# uploaded to the Marketplace from the laptop and tagged the release with the
# DESKTOP prefix).
#
# Every check below is one the CI gate also runs, deliberately: it is far
# cheaper to be told on the laptop that a changelog entry is missing than to
# find out from a red run after something has already gone out to npm — where a
# version can never be replaced.
#
# Write the changelog entry FIRST. The script tells you the version it is about
# to release and refuses to continue until that entry exists.
#
# Options:
#   --dry-run   run every check, change nothing
#   --yes       skip the confirmation (for a non-interactive shell)
# =============================================================================
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
source scripts/products.sh

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
say()  { echo "$*"; }
ok()   { echo "  ${GREEN}✓${OFF} $*"; }
warn() { echo "  ${YELLOW}!${OFF} $*"; }
die()  { echo "${RED}✗ $*${OFF}" >&2; exit 1; }

usage() {
  cat >&2 <<EOF
usage: scripts/release.sh <app|ext|cli|mcp> <patch|minor|major|X.Y.Z> [--dry-run] [--yes]

  app   desktop app          tags vX.Y.Z       builds macOS/Windows/Linux, GitHub release
  ext   VS Code extension    tags ext-vX.Y.Z   VS Code Marketplace + Open VSX
  cli   terminal UI          tags cli-vX.Y.Z   npm (git-vertex-cli)
  mcp   MCP server           tags mcp-vX.Y.Z   npm (git-vertex-mcp)
EOF
  exit 2
}

PRODUCT=""; BUMP=""; DRY_RUN=0; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) usage ;;
    -*)        die "unknown option: $1" ;;
    *)         if [ -z "$PRODUCT" ]; then PRODUCT="$1"; elif [ -z "$BUMP" ]; then BUMP="$1"; else die "unexpected argument: $1"; fi ;;
  esac
  shift
done
[ -n "$PRODUCT" ] && [ -n "$BUMP" ] || usage

product_meta "$PRODUCT" || usage

# product_meta writes into shared P_* names, and the check for "would this push
# release something else too?" has to call it again for the other products.
# Freeze what belongs to this release before that can clobber it.
MY_DIR="$P_DIR"; MY_PKG="$P_PKG"; MY_PREFIX="$P_PREFIX"
MY_CHANGELOG="$P_CHANGELOG"; MY_NOTES="$P_NOTES"
MY_LABEL="$P_LABEL"; MY_WORKFLOW="$P_WORKFLOW"; MY_VERIFY="$P_VERIFY"

CURRENT=$(node -p "require('./$MY_PKG').version")
NEW=$(node -e '
  const [cur, bump] = process.argv.slice(1)
  if (/^\d+\.\d+\.\d+$/.test(bump)) { console.log(bump); process.exit(0) }
  const [a, b, c] = cur.split(".").map(Number)
  if (bump === "patch")      console.log(`${a}.${b}.${c + 1}`)
  else if (bump === "minor") console.log(`${a}.${b + 1}.0`)
  else if (bump === "major") console.log(`${a + 1}.0.0`)
  else { console.error(`not a bump or a version: ${bump}`); process.exit(1) }
' "$CURRENT" "$BUMP")
TAG="$MY_PREFIX$NEW"
# One branch per release, named after what it releases: a leftover from an
# aborted attempt is then obvious, and two products can be prepared at once.
RELEASE_BRANCH="release/$PRODUCT-$NEW"

say "${BOLD}Release $MY_LABEL $CURRENT → $NEW${OFF}  ${DIM}(tag $TAG)${OFF}"
say ""

# ── Preflight ───────────────────────────────────────────────────────────────
say "${BOLD}Checks${OFF}"

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
[ "$BRANCH" = "main" ] || die "on branch '$BRANCH' — releases are cut from main."
ok "on main"

git fetch --quiet origin main
BEHIND=$(git rev-list --count HEAD..origin/main)
[ "$BEHIND" = 0 ] || die "$BEHIND commit(s) behind origin/main — pull first."
ok "up to date with origin/main"

# The changelog (and, for the app, the in-app notes) are expected to be edited
# right now — they are committed together with the bump, which is what keeps a
# release commit limited to a single product. Anything else dirty is not.
ALLOWED=" $MY_CHANGELOG "
[ -n "$MY_NOTES" ] && ALLOWED="$ALLOWED$MY_NOTES "
UNEXPECTED=()
while IFS= read -r line; do
  [ -n "$line" ] || continue
  path="${line:3}"
  case "$ALLOWED" in *" $path "*) continue ;; esac
  UNEXPECTED+=("$path")
done < <(git status --porcelain)
if [ "${#UNEXPECTED[@]}" -gt 0 ]; then
  say ""
  for p in "${UNEXPECTED[@]}"; do echo "      $p" >&2; done
  die "uncommitted changes outside $MY_LABEL's changelog. Commit or stash them: a release commit must touch one product only, or it would trigger the others."
fi
ok "working tree clean (bar the changelog)"

node -e '
  const [cur, next] = process.argv.slice(1)
  const c = cur.split(".").map(Number), n = next.split(".").map(Number)
  const gt = n[0] > c[0] || (n[0] === c[0] && (n[1] > c[1] || (n[1] === c[1] && n[2] > c[2])))
  if (!gt) { console.error(`${next} is not greater than the current ${cur}`); process.exit(1) }
' "$CURRENT" "$NEW" || die "refusing to release backwards."
ok "$NEW is ahead of $CURRENT"

git tag --list "$TAG" | grep -q . && die "tag $TAG already exists locally."
if git ls-remote --tags --exit-code origin "refs/tags/$TAG" >/dev/null 2>&1; then
  die "tag $TAG already exists on origin — $NEW has been released."
fi
ok "$TAG is free"

bash scripts/changelog-section.sh "$MY_CHANGELOG" "$NEW" >/dev/null \
  || die "add a '## $NEW' section to $MY_CHANGELOG, then run this again."
ok "$MY_CHANGELOG has an entry for $NEW"

if [ -n "$MY_NOTES" ]; then
  grep -qE "^[[:space:]]*'${NEW//./\\.}':" "$MY_NOTES" \
    || die "add a '$NEW': ... entry to $MY_NOTES — it feeds the app's in-app \"What's new\" tab, shown on first launch after the update."
  ok "$MY_NOTES has an entry for $NEW"
fi

# The release branch is cut from main, so whatever sits on main unpushed goes
# into the pull request and lands on merge. If an unpushed commit has already
# bumped another product, merging would release that one too — which is exactly
# what must not happen. Checked here, while still on main, against origin.
for other in $PRODUCTS; do
  [ "$other" = "$PRODUCT" ] && continue
  product_meta "$other"
  theirs_here=$(node -p "require('./$P_PKG').version")
  theirs_origin=$(git show "origin/main:$P_PKG" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version" 2>/dev/null || echo "$theirs_here")
  if [ "$theirs_here" != "$theirs_origin" ]; then
    die "an unpushed commit bumps $P_LABEL ($theirs_origin → $theirs_here). Merging this release would release it as well. Release it on its own first, or undo that bump."
  fi
done
ok "no other product would be released by this merge"

AHEAD=$(git rev-list --count origin/main..HEAD)
[ "$AHEAD" = 0 ] || warn "$AHEAD unpushed commit(s) will go out with this release"

say ""
say "${BOLD}Verify${OFF}  ${DIM}(cd $MY_DIR && $MY_VERIFY)${OFF}"
( cd "$MY_DIR" && eval "$MY_VERIFY" ) || die "$MY_VERIFY failed — not releasing."
ok "$MY_VERIFY passed"

# ── Confirm ─────────────────────────────────────────────────────────────────
say ""
say "${BOLD}This will${OFF}"
say "  bump    $MY_PKG to $NEW"
say "  commit  chore($PRODUCT): release $NEW"
say "  branch  $RELEASE_BRANCH"
say "  open    a pull request into main"
say "  then    ${BOLD}you merge it${OFF}, and $MY_WORKFLOW tags $TAG, builds and publishes"
say ""

if [ "$DRY_RUN" = 1 ]; then
  say "${YELLOW}--dry-run: nothing changed.${OFF}"
  exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
  [ -t 0 ] || die "not a terminal — pass --yes to confirm."
  printf "Release %s %s? [y/N] " "$MY_LABEL" "$NEW"
  read -r reply < /dev/tty
  case "$reply" in [yY]|[yY][eE][sS]) ;; *) die "aborted." ;; esac
fi

# ── Go ──────────────────────────────────────────────────────────────────────
say ""
git checkout --quiet -b "$RELEASE_BRANCH"
( cd "$MY_DIR" && npm version "$NEW" --no-git-tag-version >/dev/null )
ok "$MY_PKG is at $NEW"

# npm version rewrites package-lock.json alongside package.json. Everything
# staged here belongs to this one product, so the commit cannot start another
# product's workflow.
TO_ADD=("$MY_PKG" "$MY_CHANGELOG")
[ -f "$MY_DIR/package-lock.json" ] && TO_ADD+=("$MY_DIR/package-lock.json")
[ -n "$MY_NOTES" ] && TO_ADD+=("$MY_NOTES")
git add -- "${TO_ADD[@]}"
git commit --quiet -m "chore($PRODUCT): release $NEW"
ok "committed"

# The bump goes to main through a pull request, like everything else.
#
# It used to be pushed straight to main, which worked only because the owner's
# admin role waived the branch rules — every release printed "Bypassed rule
# violations: changes must be made through a pull request / 4 of 4 required
# status checks are expected". Waiving the second line is the part that mattered:
# a release could go out on a tree whose tests had never run on CI.
#
# A push cannot satisfy required status checks — at push time they have not run
# on that commit — so the only way to have them bind is to stop pushing. The
# release trigger does not care how the version file arrives on main: the
# workflow watches that path, and the gate compares the version to the tags.
# A merge commit changes it exactly like a direct push did.
git push --quiet -u origin "HEAD:$RELEASE_BRANCH"
ok "pushed $RELEASE_BRANCH"

PR_URL=$(gh pr create --base main --head "$RELEASE_BRANCH" \
  --title "chore($PRODUCT): release $NEW" \
  --body "Bump $MY_PKG to \`$NEW\`.

Merging this lands the new version on \`main\`, which is what \`$MY_WORKFLOW\`
watches: it tags \`$TAG\`, builds and publishes. Nothing goes out before the merge.

The changelog entry is in \`$MY_CHANGELOG\`.")
ok "opened $PR_URL"

# Back to main, with the release commit left on its branch: a working copy
# sitting on a release branch is how the next release starts from the wrong base.
git checkout --quiet main

say ""
say "${GREEN}${BOLD}$MY_LABEL $NEW is ready to go out.${OFF}"
say "  ${BOLD}Merge the pull request once its checks are green — that publishes it.${OFF}"
say "  $PR_URL"
say "  ${DIM}Checks:${OFF} gh pr checks --watch"
say ""
say "  ${DIM}Nothing is published yet, and nothing is tagged. To call it off:${OFF}"
say "  ${DIM}gh pr close --delete-branch \$(basename \"$PR_URL\")${OFF}"
