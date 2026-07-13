#!/usr/bin/env bash
#
# Generates a realistic-looking demo git repository for portfolio screenshots.
# Fictional project "TaskFlow" with a gitflow-style history: parallel feature
# branches, --no-ff merges (visible merge commits), release & hotfix branches,
# version tags, several authors (for avatars) and dates spread over months.
#
# Usage: ./make-demo-repo.sh [target-dir]
set -euo pipefail

TARGET="${1:-/Users/victor/Documents/taskflow-demo}"

if [ -e "$TARGET" ]; then
  echo "⚠  $TARGET existe déjà — suppression."
  rm -rf "$TARGET"
fi
mkdir -p "$TARGET"
cd "$TARGET"

git init -q -b main

# ── Authors (bash 3.2 compatible — no associative arrays) ───────────────────
author_name() {
  case "$1" in
    vic) echo "Victor Quilgars" ;; mar) echo "Marie Dubois" ;;
    luc) echo "Lucas Martin" ;;   emm) echo "Emma Bernard" ;;
    tho) echo "Thomas Leroy" ;;
  esac
}
author_mail() {
  case "$1" in
    vic) echo "victorqlgs@gmail.com" ;; mar) echo "marie.dubois@example.com" ;;
    luc) echo "lucas.martin@example.com" ;; emm) echo "emma.bernard@example.com" ;;
    tho) echo "thomas.leroy@example.com" ;;
  esac
}

# ── Date cursor (raw git format "<epoch> +0200") ─────────────────────────────
EPOCH=1725148800   # 2024-09-01 00:00 UTC

# commit <author_key> <file> <message>
commit() {
  local who="$1" file="$2" msg="$3"
  local nm ml; nm="$(author_name "$who")"; ml="$(author_mail "$who")"
  EPOCH=$(( EPOCH + 3600 * (2 + RANDOM % 36) ))   # +2h..+38h between commits
  mkdir -p "$(dirname "$file")"
  echo "// $msg ($RANDOM)" >> "$file"
  git add -A
  GIT_AUTHOR_NAME="$nm"   GIT_AUTHOR_EMAIL="$ml" \
  GIT_COMMITTER_NAME="$nm" GIT_COMMITTER_EMAIL="$ml" \
  GIT_AUTHOR_DATE="$EPOCH +0200" GIT_COMMITTER_DATE="$EPOCH +0200" \
  git commit -q -m "$msg"
}

# merge <author_key> <branch> <message>  (always --no-ff for a visible merge node)
merge() {
  local who="$1" branch="$2" msg="$3"
  local nm ml; nm="$(author_name "$who")"; ml="$(author_mail "$who")"
  EPOCH=$(( EPOCH + 3600 * (2 + RANDOM % 12) ))
  GIT_AUTHOR_NAME="$nm"   GIT_AUTHOR_EMAIL="$ml" \
  GIT_COMMITTER_NAME="$nm" GIT_COMMITTER_EMAIL="$ml" \
  GIT_AUTHOR_DATE="$EPOCH +0200" GIT_COMMITTER_DATE="$EPOCH +0200" \
  git merge --no-ff -q -m "$msg" "$branch"
}

tag() {
  GIT_COMMITTER_DATE="$EPOCH +0200" git tag -a "$1" -m "$2"
}

# ── main: initial project scaffold ──────────────────────────────────────────
commit vic README.md          "chore: initialize TaskFlow project"
commit vic package.json       "build: add package.json and base dependencies"
commit vic .gitignore         "chore: add .gitignore for node and build artifacts"

# ── develop branches from main ──────────────────────────────────────────────
git branch develop
git checkout -q develop
commit mar src/app.ts         "feat: bootstrap application entry point"
commit mar src/router.ts      "feat: add client-side router"
commit luc src/styles.css     "style: set up global theme and design tokens"

# ── feature/auth ─────────────────────────────────────────────────────────────
git checkout -q -b feature/auth develop
commit emm src/auth/login.ts    "feat(auth): add login form and validation"
commit emm src/auth/session.ts  "feat(auth): implement JWT session handling"
commit luc src/auth/login.ts    "fix(auth): trim whitespace from email field"
commit emm src/auth/signup.ts   "feat(auth): add signup flow with email verification"
git checkout -q develop
merge vic feature/auth          "Merge branch 'feature/auth' into develop"

# ── feature/dashboard (parallel with notifications below) ────────────────────
git checkout -q -b feature/dashboard develop
commit mar src/dashboard/index.ts   "feat(dashboard): scaffold dashboard layout"
commit mar src/dashboard/widgets.ts "feat(dashboard): add stats widgets"

# ── feature/notifications starts before dashboard is merged ──────────────────
git checkout -q -b feature/notifications develop
commit tho src/notif/center.ts   "feat(notif): add notification center"
commit tho src/notif/toast.ts    "feat(notif): add toast component"

# back to dashboard, more work, then merge
git checkout -q feature/dashboard
commit luc src/dashboard/widgets.ts "fix(dashboard): correct widget grid on mobile"
commit mar src/dashboard/charts.ts  "feat(dashboard): add activity charts"
git checkout -q develop
merge vic feature/dashboard         "Merge branch 'feature/dashboard' into develop"

# finish notifications, merge
git checkout -q feature/notifications
commit tho src/notif/center.ts   "feat(notif): mark-all-as-read action"
git checkout -q develop
merge mar feature/notifications  "Merge branch 'feature/notifications' into develop"
commit vic CHANGELOG.md          "docs: update changelog for upcoming 1.0.0"

# ── release/1.0.0 ────────────────────────────────────────────────────────────
git checkout -q -b release/1.0.0 develop
commit vic package.json          "build: bump version to 1.0.0"
commit emm src/auth/session.ts   "fix(auth): refresh token 60s before expiry"
commit vic README.md             "docs: finalize README for 1.0.0 release"
# merge to main + tag
git checkout -q main
merge vic release/1.0.0          "Merge branch 'release/1.0.0'"
tag v1.0.0 "Release 1.0.0 — first stable release"
# back-merge into develop
git checkout -q develop
merge vic release/1.0.0          "Merge branch 'release/1.0.0' back into develop"

# ── hotfix on main after release ─────────────────────────────────────────────
git checkout -q -b hotfix/login-crash main
commit emm src/auth/login.ts     "fix(auth): prevent crash on empty credentials"
commit emm src/auth/login.ts     "test(auth): add regression test for empty login"
git checkout -q main
merge vic hotfix/login-crash     "Merge branch 'hotfix/login-crash'"
tag v1.0.1 "Release 1.0.1 — login crash hotfix"
git checkout -q develop
merge vic hotfix/login-crash     "Merge branch 'hotfix/login-crash' into develop"

# ── ongoing develop work ─────────────────────────────────────────────────────
commit mar src/router.ts         "refactor: lazy-load routes for faster startup"
commit luc src/styles.css        "style: improve contrast for accessibility"

# ── feature/api-v2 (left unmerged — active branch tip) ───────────────────────
git checkout -q -b feature/api-v2 develop
commit tho src/api/client.ts     "feat(api): new typed API client (v2)"
commit tho src/api/client.ts     "feat(api): add retry with exponential backoff"
commit luc src/api/cache.ts      "feat(api): add request cache layer"

# ── feature/dark-mode (left unmerged — another active tip) ───────────────────
git checkout -q -b feature/dark-mode develop
commit emm src/styles.css        "feat(ui): add dark mode theme"
commit emm src/theme/toggle.ts   "feat(ui): add theme toggle in settings"

# Leave HEAD on develop so the app opens on the main line of work
git checkout -q develop

echo ""
echo "✅ Dépôt démo créé : $TARGET"
echo "   Branches : $(git branch --format='%(refname:short)' | tr '\n' ' ')"
echo "   Tags     : $(git tag | tr '\n' ' ')"
echo "   Commits  : $(git rev-list --all --count)"
