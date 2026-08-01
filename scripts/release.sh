#!/usr/bin/env bash
# =============================================================================
# Release one product, or several in one go. The same command for all four.
#
#   scripts/release.sh app patch              1.25.0 -> 1.25.1
#   scripts/release.sh ext minor              1.23.0 -> 1.24.0
#   scripts/release.sh cli 0.2.0              an explicit version
#   scripts/release.sh mcp patch --dry-run
#
#   scripts/release.sh app+ext minor          both, each from its own version
#   scripts/release.sh app=1.28.0+ext=patch   a different bump per product
#
# It bumps the version in each named product's package.json, commits, and opens
# a pull request. Nothing else: merging it lands the new versions on main, CI
# notices, tags them, builds and publishes. There is no tag to type and no
# second mechanism to remember — the desktop app used to need one, and the
# extension had a third path (a publish.sh that uploaded to the Marketplace
# from the laptop and tagged the release with the DESKTOP prefix).
#
# Releasing two products together is one commit touching two version files.
# Each product's workflow watches its own file and nothing else, so the merge
# starts both, in parallel, and each gate compares its own version to its own
# tags. That is why the combined mode needs no new machinery on the CI side —
# only this script had to stop assuming a release was ever a single product.
#
# Every check below is one the CI gate also runs, deliberately: it is far
# cheaper to be told on the laptop that a changelog entry is missing than to
# find out from a red run after something has already gone out to npm — where a
# version can never be replaced.
#
# Write the changelog entries FIRST. The script tells you the versions it is
# about to release and refuses to continue until every entry exists.
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
usage: scripts/release.sh <product[+product…]> [patch|minor|major|X.Y.Z] [--dry-run] [--yes]

  app   desktop app          tags vX.Y.Z       builds macOS/Windows/Linux, GitHub release
  ext   VS Code extension    tags ext-vX.Y.Z   VS Code Marketplace + Open VSX
  cli   terminal UI          tags cli-vX.Y.Z   npm (git-vertex-cli)
  mcp   MCP server           tags mcp-vX.Y.Z   npm (git-vertex-mcp)

  scripts/release.sh ext minor              1.23.0 -> 1.24.0
  scripts/release.sh cli 0.2.0              an explicit version
  scripts/release.sh app+ext minor          both, each bumped from its own version
  scripts/release.sh app=1.28.0+ext=patch   a different bump per product
EOF
  exit 2
}

SPEC=""; BUMP=""; DRY_RUN=0; ASSUME_YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) usage ;;
    -*)        die "unknown option: $1" ;;
    *)         if [ -z "$SPEC" ]; then SPEC="$1"; elif [ -z "$BUMP" ]; then BUMP="$1"; else die "unexpected argument: $1"; fi ;;
  esac
  shift
done
[ -n "$SPEC" ] || usage

is_version() { printf '%s' "$1" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; }

# ── What are we releasing? ───────────────────────────────────────────────────
# The spec is one product, or several joined by '+'. An item may carry its own
# bump after '=', for the case the shared keyword cannot express: shipping a
# feature in the extension on top of a fix in the app is app=patch+ext=minor,
# not one keyword for both.
#
# product_meta writes into shared P_* names and gets called again for every
# product — including, further down, the ones we are NOT releasing. So each
# product's metadata is copied into its own slot here and read from there
# afterwards. Parallel indexed arrays rather than one associative array:
# macOS still ships bash 3.2, and this script has to run on the laptop.
SEL_ID=(); SEL_BUMP=(); SEL_DIR=(); SEL_PKG=(); SEL_PREFIX=()
SEL_CHANGELOG=(); SEL_NOTES=(); SEL_LABEL=(); SEL_WORKFLOW=(); SEL_VERIFY=()

# `read` drops a trailing empty field, so `app+` would otherwise parse as plain
# `app` and release one product while the command line says two. Rejected here,
# where the spec is still the string the user typed.
case "$SPEC" in
  +*|*+|*++*) die "'$SPEC' is not a product list — write it as app+ext, with no leading, trailing or doubled '+'." ;;
esac

IFS='+' read -r -a SPEC_ITEMS <<< "$SPEC"
for item in "${SPEC_ITEMS[@]}"; do
  [ -n "$item" ] || die "empty product in '$SPEC' — write it as app+ext, with no stray '+'."
  case "$item" in
    *=*) id="${item%%=*}"; bump="${item#*=}"
         [ -n "$id" ]   || die "no product before '=' in '$item'."
         [ -n "$bump" ] || die "no bump after '=' in '$item'." ;;
    *)   id="$item"; bump="" ;;
  esac

  product_meta "$id" || usage

  for seen in ${SEL_ID[@]+"${SEL_ID[@]}"}; do
    [ "$seen" = "$id" ] && die "$id is listed twice in '$SPEC'."
  done

  SEL_ID+=("$id");            SEL_BUMP+=("$bump")
  SEL_DIR+=("$P_DIR");        SEL_PKG+=("$P_PKG")
  SEL_PREFIX+=("$P_PREFIX");  SEL_CHANGELOG+=("$P_CHANGELOG")
  SEL_NOTES+=("$P_NOTES");    SEL_LABEL+=("$P_LABEL")
  SEL_WORKFLOW+=("$P_WORKFLOW"); SEL_VERIFY+=("$P_VERIFY")
done

N=${#SEL_ID[@]}

# The trailing bump is what the items without their own '=' fall back on. It is
# required if there is such an item, and refused if there is not — otherwise
# `app=1.28.0+ext=patch minor` would read as if that `minor` did something.
SHARED_USERS=0
for i in $(seq 0 $((N - 1))); do
  [ -n "${SEL_BUMP[$i]}" ] || SHARED_USERS=$((SHARED_USERS + 1))
done
if [ "$SHARED_USERS" -gt 0 ]; then
  [ -n "$BUMP" ] || usage
  # One explicit number cannot be two products' next version. A keyword can:
  # it is resolved against each product's own current version.
  if [ "$SHARED_USERS" -gt 1 ] && is_version "$BUMP"; then
    die "an explicit version cannot apply to $SHARED_USERS products — give one each, e.g. app=$BUMP+ext=minor."
  fi
  for i in $(seq 0 $((N - 1))); do
    [ -n "${SEL_BUMP[$i]}" ] || SEL_BUMP[$i]="$BUMP"
  done
else
  [ -z "$BUMP" ] || die "every product in '$SPEC' carries its own bump — drop the trailing '$BUMP'."
fi

# ── Resolve the versions ─────────────────────────────────────────────────────
SEL_CURRENT=(); SEL_NEW=(); SEL_TAG=()
for i in $(seq 0 $((N - 1))); do
  current=$(node -p "require('./${SEL_PKG[$i]}').version")
  new=$(node -e '
    const [cur, bump] = process.argv.slice(1)
    if (/^\d+\.\d+\.\d+$/.test(bump)) { console.log(bump); process.exit(0) }
    const [a, b, c] = cur.split(".").map(Number)
    if (bump === "patch")      console.log(`${a}.${b}.${c + 1}`)
    else if (bump === "minor") console.log(`${a}.${b + 1}.0`)
    else if (bump === "major") console.log(`${a + 1}.0.0`)
    else { console.error(`not a bump or a version: ${bump}`); process.exit(1) }
  ' "$current" "${SEL_BUMP[$i]}")
  SEL_CURRENT+=("$current"); SEL_NEW+=("$new"); SEL_TAG+=("${SEL_PREFIX[$i]}$new")
done

# Names built from the products and the versions they land on: `release/app-1.28.0`
# for one, `release/app+ext-1.28.0+1.26.0` for two. A leftover from an aborted
# attempt is then obvious, and two releases can be prepared without colliding.
IDS_JOINED=""; VERSIONS_JOINED=""; SUMMARY=""; COMMIT_DETAIL=""
for i in $(seq 0 $((N - 1))); do
  sep=""; [ -n "$IDS_JOINED" ] && sep="+"
  IDS_JOINED="$IDS_JOINED$sep${SEL_ID[$i]}"
  VERSIONS_JOINED="$VERSIONS_JOINED$sep${SEL_NEW[$i]}"
  csep=""; [ -n "$COMMIT_DETAIL" ] && csep=", "
  COMMIT_DETAIL="$COMMIT_DETAIL$csep${SEL_ID[$i]} ${SEL_NEW[$i]}"
  ssep=""; [ -n "$SUMMARY" ] && ssep=" and "
  SUMMARY="$SUMMARY$ssep${SEL_LABEL[$i]} ${SEL_NEW[$i]}"
done
RELEASE_BRANCH="release/$IDS_JOINED-$VERSIONS_JOINED"

if [ "$N" = 1 ]; then
  COMMIT_MSG="chore($IDS_JOINED): release ${SEL_NEW[0]}"
else
  COMMIT_MSG="chore($IDS_JOINED): release $COMMIT_DETAIL"
fi

if [ "$N" = 1 ]; then
  say "${BOLD}Release ${SEL_LABEL[0]} ${SEL_CURRENT[0]} → ${SEL_NEW[0]}${OFF}  ${DIM}(tag ${SEL_TAG[0]})${OFF}"
else
  say "${BOLD}Release $N products together${OFF}"
  for i in $(seq 0 $((N - 1))); do
    say "  ${SEL_LABEL[$i]} ${SEL_CURRENT[$i]} → ${BOLD}${SEL_NEW[$i]}${OFF}  ${DIM}(tag ${SEL_TAG[$i]})${OFF}"
  done
fi
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

# The changelogs (and, for the app, the in-app notes) are expected to be edited
# right now — they are committed together with the bumps, which is what keeps a
# release commit limited to the products being released. Anything else dirty is
# not.
ALLOWED=" "
for i in $(seq 0 $((N - 1))); do
  ALLOWED="$ALLOWED${SEL_CHANGELOG[$i]} "
  [ -n "${SEL_NOTES[$i]}" ] && ALLOWED="$ALLOWED${SEL_NOTES[$i]} "
done
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
  die "uncommitted changes outside the changelog(s) of $IDS_JOINED. Commit or stash them: a release commit must touch only the products it releases, or it would trigger the others."
fi
ok "working tree clean (bar the changelog)"

for i in $(seq 0 $((N - 1))); do
  node -e '
    const [cur, next] = process.argv.slice(1)
    const c = cur.split(".").map(Number), n = next.split(".").map(Number)
    const gt = n[0] > c[0] || (n[0] === c[0] && (n[1] > c[1] || (n[1] === c[1] && n[2] > c[2])))
    if (!gt) { console.error(`${next} is not greater than the current ${cur}`); process.exit(1) }
  ' "${SEL_CURRENT[$i]}" "${SEL_NEW[$i]}" || die "refusing to release ${SEL_LABEL[$i]} backwards."
done
ok "every new version is ahead of its current one"

for i in $(seq 0 $((N - 1))); do
  git tag --list "${SEL_TAG[$i]}" | grep -q . && die "tag ${SEL_TAG[$i]} already exists locally."
  if git ls-remote --tags --exit-code origin "refs/tags/${SEL_TAG[$i]}" >/dev/null 2>&1; then
    die "tag ${SEL_TAG[$i]} already exists on origin — ${SEL_LABEL[$i]} ${SEL_NEW[$i]} has been released."
  fi
done
ok "$([ "$N" = 1 ] && echo "${SEL_TAG[0]} is free" || echo "all $N tags are free")"

# Every release note is checked at once and reported together, rather than
# failing on the first one missing. A merge is all-or-nothing — it lands both
# bumps — so a pair whose second changelog is empty would publish the first
# product and leave the other's gate red, with the first already on npm where a
# version cannot be replaced. Better to see the whole list and write it once.
NOTE_PATH=(); NOTE_STATE=(); MISSING=0
for i in $(seq 0 $((N - 1))); do
  NOTE_PATH+=("${SEL_CHANGELOG[$i]}")
  if bash scripts/changelog-section.sh "${SEL_CHANGELOG[$i]}" "${SEL_NEW[$i]}" >/dev/null 2>&1; then
    NOTE_STATE+=("")
  else
    NOTE_STATE+=("no '## ${SEL_NEW[$i]}' section"); MISSING=1
  fi

  if [ -n "${SEL_NOTES[$i]}" ]; then
    NOTE_PATH+=("${SEL_NOTES[$i]}")
    if grep -qE "^[[:space:]]*'${SEL_NEW[$i]//./\\.}':" "${SEL_NOTES[$i]}"; then
      NOTE_STATE+=("")
    else
      NOTE_STATE+=("no '${SEL_NEW[$i]}': entry"); MISSING=1
    fi
  fi
done
if [ "$MISSING" = 1 ]; then
  WIDTH=0
  for p in "${NOTE_PATH[@]}"; do [ ${#p} -gt $WIDTH ] && WIDTH=${#p}; done
  say ""
  echo "${RED}✗ missing release notes:${OFF}" >&2
  for i in $(seq 0 $((${#NOTE_PATH[@]} - 1))); do
    if [ -z "${NOTE_STATE[$i]}" ]; then
      printf "    %-*s ${GREEN}✓${OFF}\n" "$WIDTH" "${NOTE_PATH[$i]}" >&2
    else
      printf "    %-*s ${RED}%s${OFF}\n" "$WIDTH" "${NOTE_PATH[$i]}" "${NOTE_STATE[$i]}" >&2
    fi
  done
  echo "" >&2
  echo "  Write them, then run this again." >&2
  # src/main/release-notes.ts is the one that gets forgotten: it is not the
  # changelog, it feeds the app's in-app "What's new" tab shown on first launch
  # after the update, and a release without it ships that tab blank.
  exit 1
fi
for i in $(seq 0 $((${#NOTE_PATH[@]} - 1))); do ok "${NOTE_PATH[$i]} has its entry"; done

# The release branch is cut from main, so whatever sits on main unpushed goes
# into the pull request and lands on merge. If an unpushed commit has already
# bumped a product we are NOT releasing, merging would release that one too —
# which is exactly what must not happen. A product we ARE releasing is a
# different matter: its bump is the point. Checked here, while still on main,
# against origin.
for other in $PRODUCTS; do
  selected=0
  for i in $(seq 0 $((N - 1))); do
    [ "${SEL_ID[$i]}" = "$other" ] && selected=1
  done
  [ "$selected" = 1 ] && continue
  product_meta "$other"
  theirs_here=$(node -p "require('./$P_PKG').version")
  theirs_origin=$(git show "origin/main:$P_PKG" 2>/dev/null | node -p "JSON.parse(require('fs').readFileSync(0,'utf8')).version" 2>/dev/null || echo "$theirs_here")
  if [ "$theirs_here" != "$theirs_origin" ]; then
    die "an unpushed commit bumps $P_LABEL ($theirs_origin → $theirs_here). Merging this release would release it as well. Add it to this release ($IDS_JOINED+$other), release it on its own first, or undo that bump."
  fi
done
ok "no other product would be released by this merge"

AHEAD=$(git rev-list --count origin/main..HEAD)
[ "$AHEAD" = 0 ] || warn "$AHEAD unpushed commit(s) will go out with this release"

say ""
say "${BOLD}Verify${OFF}"
for i in $(seq 0 $((N - 1))); do
  say "  ${DIM}(cd ${SEL_DIR[$i]} && ${SEL_VERIFY[$i]})${OFF}"
  ( cd "${SEL_DIR[$i]}" && eval "${SEL_VERIFY[$i]}" ) \
    || die "${SEL_VERIFY[$i]} failed for ${SEL_LABEL[$i]} — not releasing."
  ok "${SEL_LABEL[$i]}: ${SEL_VERIFY[$i]} passed"
done

# ── Confirm ─────────────────────────────────────────────────────────────────
say ""
say "${BOLD}This will${OFF}"
for i in $(seq 0 $((N - 1))); do
  say "  bump    ${SEL_PKG[$i]} to ${SEL_NEW[$i]}"
done
say "  commit  $COMMIT_MSG"
say "  branch  $RELEASE_BRANCH"
say "  open    a pull request into main"
if [ "$N" = 1 ]; then
  say "  then    ${BOLD}you merge it${OFF}, and ${SEL_WORKFLOW[0]} tags ${SEL_TAG[0]}, builds and publishes"
else
  say "  then    ${BOLD}you merge it${OFF}, and both workflows start in parallel:"
  for i in $(seq 0 $((N - 1))); do
    say "          ${SEL_WORKFLOW[$i]} tags ${SEL_TAG[$i]}, builds and publishes"
  done
fi
say ""

if [ "$DRY_RUN" = 1 ]; then
  say "${YELLOW}--dry-run: nothing changed.${OFF}"
  exit 0
fi

if [ "$ASSUME_YES" != 1 ]; then
  [ -t 0 ] || die "not a terminal — pass --yes to confirm."
  printf "Release %s? [y/N] " "$SUMMARY"
  read -r reply < /dev/tty
  case "$reply" in [yY]|[yY][eE][sS]) ;; *) die "aborted." ;; esac
fi

# ── Go ──────────────────────────────────────────────────────────────────────
say ""
git checkout --quiet -b "$RELEASE_BRANCH"

# npm version rewrites package-lock.json alongside package.json. Everything
# staged here belongs to the products being released, so the commit cannot
# start a workflow that was not asked for.
TO_ADD=()
for i in $(seq 0 $((N - 1))); do
  ( cd "${SEL_DIR[$i]}" && npm version "${SEL_NEW[$i]}" --no-git-tag-version >/dev/null )
  ok "${SEL_PKG[$i]} is at ${SEL_NEW[$i]}"
  TO_ADD+=("${SEL_PKG[$i]}" "${SEL_CHANGELOG[$i]}")
  [ -f "${SEL_DIR[$i]}/package-lock.json" ] && TO_ADD+=("${SEL_DIR[$i]}/package-lock.json")
  [ -n "${SEL_NOTES[$i]}" ] && TO_ADD+=("${SEL_NOTES[$i]}")
done

git add -- "${TO_ADD[@]}"
git commit --quiet -m "$COMMIT_MSG"
ok "committed"

# The bumps go to main through a pull request, like everything else.
#
# They used to be pushed straight to main, which worked only because the owner's
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

# ── The pull request body ───────────────────────────────────────────────────
PR_BODY="Bump"
for i in $(seq 0 $((N - 1))); do
  bsep=""; [ "$i" -gt 0 ] && bsep=" and"
  PR_BODY="$PR_BODY$bsep \`${SEL_PKG[$i]}\` to \`${SEL_NEW[$i]}\`"
done
PR_BODY="$PR_BODY."

if [ "$N" = 1 ]; then
  PR_BODY="$PR_BODY

Merging this lands the new version on \`main\`, which is what \`${SEL_WORKFLOW[0]}\`
watches: it tags \`${SEL_TAG[0]}\`, builds and publishes. Nothing goes out before the merge.

The changelog entry is in \`${SEL_CHANGELOG[0]}\`."
else
  PR_BODY="$PR_BODY

Merging this lands both versions on \`main\` in a single commit. Each product's
workflow is triggered by its own version file, so the merge starts them in
parallel and each one tags, builds and publishes independently:
"
  for i in $(seq 0 $((N - 1))); do
    PR_BODY="$PR_BODY
- \`${SEL_PKG[$i]}\` → \`${SEL_WORKFLOW[$i]}\` → \`${SEL_TAG[$i]}\` (${SEL_LABEL[$i]})"
  done
  PR_BODY="$PR_BODY

Nothing goes out before the merge. The changelog entries are in"
  for i in $(seq 0 $((N - 1))); do
    csep=""; [ "$i" -gt 0 ] && csep=" and"
    PR_BODY="$PR_BODY$csep \`${SEL_CHANGELOG[$i]}\`"
  done
  PR_BODY="$PR_BODY."
fi

PR_URL=$(gh pr create --base main --head "$RELEASE_BRANCH" \
  --title "$COMMIT_MSG" \
  --body "$PR_BODY")
ok "opened $PR_URL"

# Back to main, with the release commit left on its branch: a working copy
# sitting on a release branch is how the next release starts from the wrong base.
git checkout --quiet main

say ""
say "${GREEN}${BOLD}$SUMMARY is ready to go out.${OFF}"
say "  ${BOLD}Merge the pull request once its checks are green — that publishes it.${OFF}"
say "  $PR_URL"
say "  ${DIM}Checks:${OFF} gh pr checks --watch"
say ""
say "  ${DIM}Nothing is published yet, and nothing is tagged. To call it off:${OFF}"
say "  ${DIM}gh pr close --delete-branch \$(basename \"$PR_URL\")${OFF}"
