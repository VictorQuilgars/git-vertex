# Changelog — Git Vertex MCP

## 0.5.3

### Fixed
- **`git_bisect` never told you it had found the answer** in a way you could rely on. git announces it in prose, and the wording depends on the git you run: 2.39 says `<sha> is the first bad commit`, 2.55 says `<sha> is the first 'bad' commit` — quoted, because bisect terms are configurable. So a client keying on either string works until the day git is upgraded, with no change on its side. The tool now ends its output with a stable `first bad commit: <sha> — <subject>` line, derived from `rev-list --bisect-vars` (shell assignments: never translated, never quoted). The tool's own test suite was the first victim — it looped through every step of a bisect that converged perfectly and concluded it had not converged.
- **A converged session also claimed a "currently checked out" commit** — which is the last commit *tested*, not the culprit, and one line above the answer. It is now one or the other: where to test next, or the answer.
- **The server announced the wrong version to every client.** `VERSION` was a constant kept in step by hand and it had drifted: `serverInfo` and the startup line said `0.4.0` while the package was `0.5.2`. It is read from `package.json` now, and a test compares the two.

## 0.5.2

### Fixed
- **git ran without `$HOME`, so everything needing the global config failed.** A comment claimed simple-git's `.env(name, value)` form merges into the child environment rather than replacing it. It replaces it — so the server's git instance had no `$HOME`, could not read `~/.gitconfig`, and answered a bare `fatal: $HOME not set` on anything that needs it: your identity, the credential helper, `safe.directory`. Handing simple-git a full environment object is no better, since `@simple-git/argv-parser` screens `EDITOR`, `PAGER`, `GIT_ASKPASS` and ~19 other variables and refuses the call outright. It now gets an explicit allow-list with a pinned locale.
- **The clean `Not a git repository` error was unreachable.** Without a pinned locale on that same instance, `checkIsRepo()` rejected with git's own translated message first, so the readable error below it never got a chance to be thrown.

### Changed
- **The README now states the git version it needs** — `git merge-tree --merge-base` (git 2.40) for conflict prediction, 2.28 minimum for the rest. macOS still ships 2.39.

## 0.5.1

### Fixed
- **The npm page described the server as read-only.** It has surgical conflict-resolution writes — `--read-only` is how you turn them off — so its own description undersold the one thing that sets it apart. 0.5.0 is immutable on npm, hence a version bump to correct the published page.

## 0.5.0

First version published to npm: 0.4.0 was tagged but never reached the registry.

### Fixed
- **`find_lost_work` found nothing on a non-English machine.** It filters `git fsck` output for lines beginning with `dangling commit`, and under a French locale git prints `objet commit fantôme` — so the dangling-commits section came back empty, an orphaned amend was invisible, and only the reset showed up, via the reflog. The same root cause leaked raw translated fatals in place of the clean `Not a git repository`. git now runs under `LC_ALL=C` at all three call sites: the cached simple-git instance, `execGit`, and the direct `execFile` in `continue_operation` whose output goes straight to the agent.
- **`open_in_git_vertex` with `view=commit` opened nothing** when handed a tag or a branch name. The app matches the deep-link hash against commit SHAs, so anything else selected no commit and the view silently stayed on the graph. Revisions are now resolved to a SHA first, and an unknown one is a clear error rather than a view that does nothing.
- **`open_in_git_vertex` told you to click a button that was not there.** The "save and resolve" hint was shown for `view=graph` and `view=commit` as well, where no such button exists. It is scoped to `view=resolve` now.
- **`generate_commit_message` implied it had filled the app's commit box.** Its description only suggested pairing it with `propose_commit`, so agents drafted a message, never called `propose_commit`, and told the user it was waiting in the app. The description now says it returns text to the agent and touches nothing, and that reminder sits in its own block so a next-step instruction cannot leak into a message copied verbatim.

### Changed
- **Repository paths are normalized to NFC** as they cross the deep-link boundary. They travel between three processes as plain strings and get compared for equality (tab lookup, simple-git cache), so the same accented directory arriving in two different normalizations would open a second tab or miss the cache. macOS filesystems hand us NFC, so this is hardening rather than a fix for an observed failure — NFD can still reach us from another volume, or from text an agent pasted.

## 0.4.0

### Added
- **First release**, tagged but never published to npm. A local MCP server exposing your Git repositories to AI agents (Claude Code, Cursor, Copilot…) — 18 tools over stdio, read-mostly, no cloud.
