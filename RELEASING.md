# Releasing

Four products live in this repository and they all release the same way:

```bash
scripts/release.sh <app|ext|cli|mcp> <patch|minor|major|X.Y.Z>
```

| Product | Directory | Version file | Tag | Goes to |
|---|---|---|---|---|
| `app` — desktop | `.` | `package.json` | `v1.25.0` | GitHub release: macOS, Windows, Linux installers + the auto-update feed |
| `ext` — VS Code | `vscode-extension/` | `vscode-extension/package.json` | `ext-v1.23.0` | VS Code Marketplace, Open VSX, GitHub release with the `.vsix` |
| `cli` — terminal UI | `cli/` | `cli/package.json` | `cli-v0.1.1` | npm (`git-vertex-cli`) |
| `mcp` — MCP server | `mcp/` | `mcp/package.json` | `mcp-v0.5.2` | npm (`git-vertex-mcp`) |

## How it works

The version in a product's own `package.json` is the only truth. If no tag
matches it, that version has not been released yet — so getting that bump onto
main is what releases it. CI notices, creates the tag, builds and publishes.

`release.sh` prepares the bump on a branch and opens a **pull request**.
**Merging it is what publishes.** Nothing is tagged, built or uploaded before
that, and closing the PR cancels the release with nothing to undo.

It goes through a PR for one reason: a direct push cannot satisfy the required
status checks, because at push time they have not run on that commit. Releases
used to push to main and the branch rules were waived — every one of them
printed `Bypassed rule violations: … 4 of 4 required status checks are
expected`. A release could therefore go out on a tree CI had never seen. Now the
checks bind, on the maintainer as on anyone else.

There is no tag to type. There is no second mechanism for the desktop app, and
no local publish script for the extension; both existed, and both were removed
after a release went out with the wrong tag.

Each product's workflow is triggered by **its own version file and nothing
else**, so releases cannot drag each other along:

```
package.json                   → release.yml
vscode-extension/package.json  → publish-extension.yml
cli/package.json               → publish-cli.yml
mcp/package.json               → publish-mcp.yml
```

A fix under `src/` does not start any of them. When one does start for an
unrelated reason — a dependency bump — the shared gate
(`.github/workflows/_release-gate.yml`) sees the version is already tagged and
stops before doing any work.

## Before you run it

Write the changelog entry first. `release.sh` tells you the version it is about
to release and refuses to go on without it.

- **Every product**: a `## X.Y.Z` heading with content under it, in that
  product's changelog.
- **The desktop app only**: an `'X.Y.Z':` entry in `src/main/release-notes.ts`.
  That feeds the in-app "What's new" tab shown on first launch after an update —
  it is not the changelog, and it is the easiest thing in the repo to forget.

`release.sh` then checks, before touching anything: you are on main and up to
date, nothing is dirty except that changelog, the new version is ahead of the
current one, the tag is free locally *and* on the remote, no unpushed commit
would release another product as a side effect, and the product's own tests
pass. The CI gate repeats those checks — being told on your laptop is cheaper,
because an npm version can never be replaced once published.

## After you run it

You are back on `main`, the bump sits on `release/<product>-<version>`, and a
pull request is open. Its checks run like any other PR:

```bash
gh pr checks --watch     # then merge it — that is what publishes
```

Merging lands the new version on `main`, which is what that product's workflow
watches. Closing the PR instead cancels the release: nothing was tagged, built
or uploaded, and there is nothing to undo.

Approving it is not required of the repository owner — the `review required`
ruleset does not apply to them — but the status checks are, and they are the
reason releases stopped pushing straight to main.

## What CI does

For `ext`, `cli` and `mcp`: test, publish, then create the tag and the GitHub
release in one step (`gh release create --target`, which creates the tag too).

For `app` it is deliberately different, because three platforms have to agree:

1. Tests pass, then a **draft** release is created.
2. macOS, Windows and Linux build in parallel and upload into that draft.
3. A final job checks every installer plus `latest*.yml` actually arrived, then
   publishes the draft — which is what creates the tag.

The draft matters for two reasons. `electron-updater` reads `latest.yml` from
whichever release carries the "Latest" badge, and a draft is invisible to it, so
a build that fails half way can no longer offer users an update whose installer
is missing. And the `release` webhook fires on `published`: the homelab mirror
that serves the download buttons on the site listens to it, and it used to fire
before a single installer existed, leaving the mirror retrying for up to thirty
minutes. It now fires once, with everything in place.

`electron-builder`'s `releaseType` is `"draft"` in `package.json` for the same
reason — at `"release"` it publishes the release itself, from whichever platform
finishes first.

## When something fails

Nothing is lost and nothing partial is public.

- **A build failed** → the release stays a draft, no tag exists, the site and
  the auto-update feed have seen nothing. Fix it and re-run the workflow: the
  draft is reused, and npm publishes that already went through are skipped
  rather than failing on an immutable version.
- **A version is out but its tag is wrong** → the tags are protected against
  being moved or deleted, on purpose: the mirror and `electron-updater` both key
  off them. Release a new patch version instead.
- **The mirror missed a release** → the "Check releases" button in the homelab
  admin re-runs it. GitHub never retries a failed webhook delivery.

## Secrets

Set as repository secrets, and reachable only from a push to main — never from a
pull request, which is what makes CI safe to run on forks.

| Secret | Used by | Where it comes from |
|---|---|---|
| `GH_TOKEN` | `release.yml` | a PAT with `repo`, for the release and the installer uploads |
| `NPM_TOKEN` | `publish-cli.yml`, `publish-mcp.yml` | npm automation token with publish rights |
| `VSCE_PAT` | `publish-extension.yml` | dev.azure.com → Settings → Personal access tokens, scope Marketplace → Manage |
| `OVSX_PAT` | `publish-extension.yml` | open-vsx.org → your profile → Access Tokens |
| `VITE_GITHUB_CLIENT_ID`, `VITE_GITHUB_PROXY_URL` | the app builds | see `.env.example` — neither is really secret |

The extension's two publish steps are skipped when their token is absent, so the
GitHub release still happens if a marketplace credential has expired.
