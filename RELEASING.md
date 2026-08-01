# Releasing

Four products live in this repository and they all release the same way:

```bash
scripts/release.sh <app|ext|cli|mcp> <patch|minor|major|X.Y.Z>
```

| Product | Directory | Version file | Tag | Goes to |
|---|---|---|---|---|
| `app` — desktop | `.` | `package.json` | `v1.27.0` | GitHub release: macOS, Windows, Linux installers + the auto-update feed |
| `ext` — VS Code | `vscode-extension/` | `vscode-extension/package.json` | `ext-v1.25.0` | VS Code Marketplace, Open VSX, GitHub release with the `.vsix` |
| `cli` — terminal UI | `cli/` | `cli/package.json` | `cli-v0.1.1` | npm (`git-vertex-cli`) |
| `mcp` — MCP server | `mcp/` | `mcp/package.json` | `mcp-v0.5.3` | npm (`git-vertex-mcp`) |

## Two products at once

A change that spans the shared renderer usually has to go out in both the app
and the extension. Join them with `+` and it is one command, one commit, one
pull request:

```bash
scripts/release.sh app+ext minor            # both, each bumped from its own version
scripts/release.sh app=1.28.0+ext=patch     # a different bump per product
```

A bare keyword is resolved against each product's own current version, so
`app+ext minor` takes the app 1.27.0 → 1.28.0 and the extension 1.25.0 → 1.26.0.
An explicit `X.Y.Z` cannot mean two different numbers, so it is only accepted
per product, after `=`.

Nothing new happens on the CI side. The merge lands both version files in one
commit; each product's workflow watches its own file, so both start in parallel
and each gate compares its own version to its own tags. The branch is named
after what it releases — `release/app+ext-1.28.0+1.26.0`.

Every release note is checked before anything is touched, and they are reported
together rather than one at a time:

```
✗ missing release notes:
    CHANGELOG.md                  no '## 1.28.0' section
    src/main/release-notes.ts     no '1.28.0': entry
    vscode-extension/CHANGELOG.md ✓
```

That check is strict on purpose. A merge is all-or-nothing — it lands both
bumps — so a pair whose second changelog is empty would publish the first
product and leave the other's gate red, with the first already on npm, where a
version can never be replaced.

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

Write the release notes first. `release.sh` refuses to go on without them.

- **Every product**: a heading with content under it, in that product's
  changelog.
- **The desktop app only**: an entry in `src/main/release-notes.ts`. That feeds
  the in-app "What's new" tab shown on first launch after an update — it is not
  the changelog, and it is the easiest thing in the repo to forget.

**Write them under `Unreleased`, not under a version number.** Notes are written
when the work lands, and the number is only known when the release goes out —
often several lots later. `release.sh` accepts either form and **promotes
`Unreleased` to the real number** in the release commit itself:

```
## Unreleased          →   ## 1.28.0            (changelog)
'Unreleased': `## What's new in Unreleased …`
                       →   '1.28.0': `## What's new in 1.28.0 …`
```

The number is written by the only thing that knows it. Guessing it in advance is
what produced four numbering slips already — a reserved number gets consumed by
whatever ships first.

A numbered heading still works, for a release prepared in one go. What the script
refuses is **both at once**: an `## Unreleased` *and* a `## 1.28.0` give two
candidate sections with no way to tell which is this release, so it stops and
asks you to merge them.

The CI gate is untouched by any of this. It runs on `main` after the merge, where
the heading has already been promoted, so it still finds `## X.Y.Z` and nothing
else — `scripts/changelog-section.sh` stays strict on purpose, since it also
builds the GitHub release body.

Covered by `scripts/__tests__/promote-unreleased.test.sh` (fixtures only — it
never runs a release and never touches git).

`release.sh` then checks, before touching anything: you are on main and up to
date, nothing is dirty except that changelog, the new version is ahead of the
current one, the tag is free locally *and* on the remote, no unpushed commit
would release a product you did **not** name as a side effect, and the product's
own tests pass. The CI gate repeats those checks — being told on your laptop is
cheaper, because an npm version can never be replaced once published.

That side-effect check is the one thing the combined mode relaxes, and only
that: an unpushed bump of a product you named is the point of the release, while
an unpushed bump of one you did not is still refused. When it fires it now tells
you the third option — add that product to the release.

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

`main` also requires a pull request to be **up to date** with it before merging.
A release branch is cut from a `main` the script has just checked you are level
with, so it opens up to date. It only goes stale if something else is merged
while it is open; then GitHub's "Update branch" pulls `main` in and the checks
re-run on the result. That is a rebase and a wait, never a block.

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
