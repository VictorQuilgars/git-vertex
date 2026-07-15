#!/bin/bash
# Fixtures for git-vertex-mcp automated tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$ROOT/fixtures"
mkdir -p "$ROOT/fixtures"
cd "$ROOT/fixtures"

ginit() {
  git init -q -b main "$1"
  cd "$1"
  git config user.name "Alice Dev"
  git config user.email alice@test.local
  git config commit.gpgsign false
  git config core.hooksPath /dev/null
}
c() { git add -A >/dev/null; GIT_AUTHOR_DATE="$2" GIT_COMMITTER_DATE="$2" git commit -qm "$1"; }

# ── main: rich read-only fixture ────────────────────────────────
ginit main
printf 'Line one\nLine two\nLine three\nLine four\n' > README.md
printf 'shared v1\n' > shared.txt
c "Initial commit" "2026-06-01T10:00:00"
mkdir -p src
cat > src/app.js <<'EOF'
function computeTotal(items) {
  return items.reduce((a, b) => a + b, 0)
}
module.exports = { computeTotal }
EOF
c "feat: add computeTotal" "2026-06-02T10:00:00"
git tag v1.0
git config user.name "Bob Reviewer"; git config user.email bob@test.local
printf 'Line one\nLine two CHANGED\nLine three\nLine four\nLine five\n' > README.md
c "docs: update README" "2026-06-10T10:00:00"
git config user.name "Alice Dev"; git config user.email alice@test.local
printf 'module.exports = {}\n' > src/app.js
c "refactor: drop computeTotal" "2026-06-20T10:00:00"

git branch feature-clean
git checkout -q feature-clean
printf 'clean feature\n' > feature.txt
c "feat: clean feature file" "2026-06-21T10:00:00"
git checkout -q main
git checkout -qb feature-conflict
printf 'shared FEATURE\n' > shared.txt
c "feat: change shared (feature)" "2026-06-22T10:00:00"
git checkout -q main
printf 'shared MAIN\n' > shared.txt
c "chore: change shared (main)" "2026-06-23T10:00:00"

# dangling commit (find_lost_work)
printf 'temp work to lose\n' > lost.txt
git add -A; git commit -qm "WIP: lost work"
git reset -q --hard HEAD~1

# working state: staged (incl. big file for truncation), unstaged, untracked
python3 -c "open('big.txt','w').write('\n'.join(f'line {i}: some fairly long content to inflate the diff well beyond the truncation threshold' for i in range(600)))"
printf 'staged content\n' > staged-file.txt
git add staged-file.txt big.txt
printf 'unstaged edit\n' >> README.md
printf 'not tracked\n' > untracked.txt
cd ..

# ── merge-conflict: mid-merge, 2 conflicted files ───────────────
ginit merge-conflict
printf 'alpha base\n' > a.txt
printf 'beta base\n' > b.txt
printf 'gamma\n' > c.txt
c "base" "2026-07-01T10:00:00"
git checkout -qb feature
printf 'alpha FEATURE\n' > a.txt
printf 'beta FEATURE\n' > b.txt
c "feature: edit a and b" "2026-07-02T10:00:00"
git checkout -q main
printf 'alpha MAIN\n' > a.txt
printf 'beta MAIN\n' > b.txt
c "main: edit a and b" "2026-07-03T10:00:00"
git merge feature >/dev/null 2>&1 || true
cd ..

# ── rebase-conflict: mid-rebase of topic onto main ──────────────
ginit rebase-conflict
printf 'base\n' > f.txt
c "base" "2026-07-01T10:00:00"
git checkout -qb topic
printf 'topic change\n' > f.txt
c "topic: edit f" "2026-07-02T10:00:00"
git checkout -q main
printf 'main change\n' > f.txt
c "main: edit f" "2026-07-03T10:00:00"
git checkout -q topic
git rebase main >/dev/null 2>&1 || true
cd ..

# ── cherry-conflict: mid cherry-pick ────────────────────────────
ginit cherry-conflict
printf 'base\n' > f.txt
c "base" "2026-07-01T10:00:00"
git checkout -qb side
printf 'side version\n' > f.txt
c "side: edit f" "2026-07-02T10:00:00"
git checkout -q main
printf 'main version\n' > f.txt
c "main: edit f" "2026-07-03T10:00:00"
git cherry-pick side >/dev/null 2>&1 || true
cd ..

# ── bisect: 15 commits, bug introduced at commit 10 ─────────────
ginit bisect
for i in $(seq 1 15); do
  echo "entry $i" >> log.txt
  if [ "$i" = "10" ]; then echo "BUG" > bug.txt; fi
  c "commit $i" "2026-07-05T10:$(printf '%02d' "$i"):00"
done
cd ..

echo "fixtures ready: $ROOT/fixtures"
