#!/usr/bin/env bash
# =============================================================================
# The four products of this monorepo, and what a release of each one needs.
#
# Sourced by BOTH sides of a release:
#   - scripts/release.sh                  the local preflight
#   - .github/workflows/_release-gate.yml the CI gate
#
# That is the point. The "is this version already tagged?" check used to be
# copy-pasted in three workflows, each with its own paths and its own tag
# prefix, and the desktop app used a fourth, unrelated mechanism. One of those
# copies drifted and ext-v1.23.0 was mirrored as the wrong release. A single
# table, read by everything, is what makes that class of bug impossible.
#
# Every product releases the same way: bump the version in its own
# package.json, push to main, CI does the rest. The version file is also the
# only path that triggers its workflow — so a fix in src/** never starts the
# extension's release, and bumping the CLI never touches the app.
# =============================================================================

PRODUCTS="app ext cli mcp"

# product_meta <app|ext|cli|mcp>
#
# Sets, for the caller:
#   P_DIR        the product's directory ("." for the desktop app)
#   P_PKG        its package.json — the version source AND the workflow trigger
#   P_PREFIX     its tag prefix ("v", "ext-v", "cli-v", "mcp-v")
#   P_CHANGELOG  the changelog that must carry an entry for the new version
#   P_NOTES      an extra file that must mention the version, or "" if none
#   P_LABEL      how to name the product to a human
#   P_WORKFLOW   the workflow that will pick the push up
#   P_VERIFY     what must pass before releasing, run from inside P_DIR
product_meta() {
  case "${1:-}" in
    app)
      P_DIR="."
      P_PREFIX="v"
      P_CHANGELOG="CHANGELOG.md"
      P_VERIFY="npm test"
      # Feeds the app's own "What's new" tab, shown on first launch after an
      # update. It is separate from CHANGELOG.md and easy to forget, so a
      # release without an entry here fails instead of shipping a blank tab.
      P_NOTES="src/main/release-notes.ts"
      P_LABEL="desktop app"
      P_WORKFLOW="release.yml"
      ;;
    ext)
      P_DIR="vscode-extension"
      P_PREFIX="ext-v"
      P_CHANGELOG="vscode-extension/CHANGELOG.md"
      P_NOTES=""
      P_LABEL="VS Code extension"
      P_WORKFLOW="publish-extension.yml"
      # Not `npm test`: that one launches a real VS Code, which a headless
      # runner cannot do. But "compile only" let the host-parity test sit red
      # through two releases — getDefaultBranch shipped answering
      # not-implemented in the panel. test:nodisplay runs every test whose
      # source never imports `vscode`, which includes that guard.
      P_VERIFY="npm run compile && npm run test:nodisplay"
      ;;
    cli)
      P_DIR="cli"
      P_PREFIX="cli-v"
      P_CHANGELOG="cli/CHANGELOG.md"
      P_NOTES=""
      P_LABEL="CLI"
      P_WORKFLOW="publish-cli.yml"
      P_VERIFY="npm run typecheck"   # no test suite under cli/ yet
      ;;
    mcp)
      P_DIR="mcp"
      P_PREFIX="mcp-v"
      P_CHANGELOG="mcp/CHANGELOG.md"
      P_NOTES=""
      P_LABEL="MCP server"
      P_WORKFLOW="publish-mcp.yml"
      P_VERIFY="npm test"
      ;;
    "")
      echo "product_meta: no product given (expected one of: $PRODUCTS)" >&2
      return 1
      ;;
    *)
      echo "product_meta: unknown product '$1' (expected one of: $PRODUCTS)" >&2
      return 1
      ;;
  esac

  # "./package.json" would work everywhere a path is opened, but it does NOT
  # match a workflow `paths:` filter and reads wrong in an error message.
  # Normalise it once here rather than in every caller.
  if [ "$P_DIR" = "." ]; then P_PKG="package.json"; else P_PKG="$P_DIR/package.json"; fi
}

# product_version <product> — the version currently in its package.json.
product_version() {
  product_meta "$1" || return 1
  node -p "require('./$P_PKG').version"
}
