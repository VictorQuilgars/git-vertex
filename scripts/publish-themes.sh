#!/usr/bin/env bash
# =============================================================================
# Publishes the theme bank to gitvertex.vi-lab.fr/themes/v1/
#
# By hand, from this laptop, and that is deliberate: the bank lives in
# `docs-private/themes/`, which is git-ignored (.gitignore line 31). CI cannot
# see it, cannot regenerate it and cannot publish it. The alternative was
# committing 3 MB of CSS and a 3,960-file tree into a repo that ships four
# products, which is worse than a script someone runs.
#
# The server cannot pull this the way `gv-release.sh` pulls installers from
# GitHub either — there is nothing to pull from. So this pushes.
#
#   scripts/publish-themes.sh                 regenerate, verify, publish
#   scripts/publish-themes.sh --dry-run       everything except the write
#   scripts/publish-themes.sh --local-only    regenerate and verify, no ssh
#
# What it does NOT do is crawl. Re-fetching the bank from Open VSX is
# `crawl.py fetch` (two hours, network) and re-mapping it is `crawl.py remap`
# (seconds, offline); both are upstream of this and are run when the mapper
# changes, not when the site is republished.
#
# Dependencies: python3, rsync, ssh. The `homelab` host must be in ~/.ssh/config.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BANK="$REPO_ROOT/docs-private/themes"
TREE="dist/themes/v1"

# The remote directory nginx mounts read-only at /themes. Guarded below: an
# empty variable here would turn `rsync --delete` into a very bad afternoon.
SSH_HOST="${GV_THEMES_HOST:-homelab}"
REMOTE_DIR="${GV_THEMES_DIR:-/data/sites/gitvertex-themes}"

DRY_RUN=0
LOCAL_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)    DRY_RUN=1 ;;
    --local-only) LOCAL_ONLY=1 ;;
    -h|--help)    sed -n '2,22p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "publish-themes: unknown argument $arg" >&2; exit 2 ;;
  esac
done

[ -d "$BANK" ] || { echo "publish-themes: no $BANK — the bank is git-ignored, so a fresh clone does not have it" >&2; exit 1; }
[ -f "$BANK/themes.json" ] || { echo "publish-themes: no themes.json — run 'python3 assemble.py' in $BANK first" >&2; exit 1; }

cd "$BANK"

# ── Regenerate ───────────────────────────────────────────────────────────────
# catalogue.py wipes the tree itself before writing. It has to: the tree was
# once written on top of a previous generation and kept 491 files that were no
# longer in the index, 449 of them carrying the success == danger bug fixed in
# c1456ad. They answered on their own URLs, and theme/{id}.json is served
# `immutable, max-age=31536000`.
echo "→ regenerating $TREE"
GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)" python3 catalogue.py

# ── Verify, before anything is written anywhere ───────────────────────────────
# The publish step is the last place this can be caught. A tree that disagrees
# with its own index is a gallery that lists rows which 404 on install.
echo "→ verifying"
python3 - "$TREE" <<'PY'
import json, os, re, sys
tree = sys.argv[1]
idx = json.load(open(f"{tree}/index.json"))
live = {t["id"] for t in idx["themes"]}
files = {f[:-5] for f in os.listdir(f"{tree}/theme") if f.endswith(".json")}
SEEDS = ["canvas","surface","sunken","border","text","text-2","text-3","accent",
         "agent","success","warning","danger","conflict","on-fill"] + \
        [f"lane-{i}" for i in range(1, 11)]
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
ID  = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
bad = []
if idx["count"] != len(idx["themes"]): bad.append(f"count {idx['count']} != {len(idx['themes'])} rows")
if files - live:  bad.append(f"{len(files - live)} orphaned theme files")
if live - files:  bad.append(f"{len(live - files)} index rows with no file")
if not os.path.exists(f"{tree}/NOTICES.md"): bad.append("NOTICES.md missing — the licences require it")
if not os.path.exists(f"{tree}/index.json.gz"): bad.append("index.json.gz missing")
if idx.get("generatedAt", "").startswith("1970"): bad.append("generatedAt not stamped")
for t in idx["themes"]:
    if not ID.match(t["id"]): bad.append(f"bad id {t['id']!r}"); break
# Spot-check the payloads rather than all 3,960: a malformed seed is a CSS
# injection into the app's stylesheet, and the shape is generated uniformly.
import random; random.seed(0)
for t in random.sample(idx["themes"], min(200, len(idx["themes"]))):
    d = json.load(open(f"{tree}/theme/{t['id']}.json"))
    s = d.get("seeds", {})
    if set(s) != set(SEEDS):
        bad.append(f"{t['id']}: seeds are not the 24 keys"); break
    if not all(HEX.match(str(v)) for v in s.values()):
        bad.append(f"{t['id']}: a seed is not a 6-digit hex"); break
    if len({s[k] for k in ("success","warning","danger","conflict")}) < 4:
        bad.append(f"{t['id']}: semantic seeds collapsed"); break
if bad:
    print("publish-themes: refusing to publish —", "; ".join(bad), file=sys.stderr)
    sys.exit(1)
print(f"  {len(live)} themes, index and tree agree, NOTICES.md present")
PY

if [ "$LOCAL_ONLY" = 1 ]; then
  echo "→ --local-only, stopping before the upload"
  exit 0
fi

# ── Publish ──────────────────────────────────────────────────────────────────
# --delete is the point, not a flourish: it is what stops a theme dropped from
# the bank (71 were, when the plausibility check moved into report()) from
# going on answering at its old URL for a year.
case "$REMOTE_DIR" in
  /|/data|/data/sites|"") echo "publish-themes: refusing --delete against $REMOTE_DIR" >&2; exit 1 ;;
esac

RSYNC_OPTS=(-az --delete --checksum --human-readable)
[ "$DRY_RUN" = 1 ] && RSYNC_OPTS+=(--dry-run --itemize-changes)

echo "→ publishing to $SSH_HOST:$REMOTE_DIR/v1/"
ssh "$SSH_HOST" "mkdir -p '$REMOTE_DIR'"
rsync "${RSYNC_OPTS[@]}" "$TREE/" "$SSH_HOST:$REMOTE_DIR/v1/"

if [ "$DRY_RUN" = 1 ]; then
  echo "→ dry run, nothing was written"
  exit 0
fi

echo "→ published — https://gitvertex.vi-lab.fr/themes/v1/index.json"
