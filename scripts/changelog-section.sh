#!/usr/bin/env bash
# =============================================================================
# Print the changelog section for one version, on stdout.
#
#   scripts/changelog-section.sh CHANGELOG.md 1.25.0
#
# Exits 1 with an actionable message when there is no such section, or when it
# is empty — a release with no notes fails instead of shipping "Release vX.Y.Z"
# as its only description.
#
# One implementation, called from three places: the CI gate (to fail before any
# build work), each publish job (to build the GitHub release body), and
# scripts/release.sh (to catch it on the laptop, before pushing). Duplicating
# the awk in a workflow is how a release ends up passing locally and failing in
# CI — see the jq 1.6/1.7 note in the homelab's gv-release.sh for the version
# of that bug that already cost a lost release.
#
# The awk below is POSIX only: it runs on macOS's BSD awk and on GNU awk in CI,
# and it does its own blank-line trimming rather than piping through `sed -i`,
# whose -i flag takes an argument on BSD and none on GNU.
# =============================================================================
set -euo pipefail

FILE="${1:?usage: changelog-section.sh <changelog file> <version>}"
VERSION="${2:?usage: changelog-section.sh <changelog file> <version>}"

if [ ! -f "$FILE" ]; then
  echo "::error::$FILE does not exist — every product needs a changelog for its release notes." >&2
  exit 1
fi

SECTION=$(awk -v ver="## $VERSION" '
  $0 == ver      { found = 1; next }   # the heading itself is not part of it
  found && /^## / { exit }             # stop at the next version
  found          { line[++n] = $0 }
  END {
    first = 0; last = 0
    for (i = 1; i <= n; i++)
      if (line[i] ~ /[^[:space:]]/) { if (!first) first = i; last = i }
    if (!first) exit
    for (i = first; i <= last; i++) print line[i]
  }
' "$FILE")

if [ -z "$SECTION" ]; then
  echo "::error::No changelog entry for $VERSION in $FILE. Add a '## $VERSION' heading with content under it before releasing." >&2
  exit 1
fi

printf '%s\n' "$SECTION"
