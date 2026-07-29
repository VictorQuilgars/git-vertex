# Changelog — Git Vertex CLI

## 0.1.1

### Fixed
- **The branch tracking counters read zero on a non-English machine.** The CLI reads several of git's messages by their English wording, and git translates them: `[origin/x: gone]` becomes `[origin/x : disparue]` under a French locale, and `ahead 2` becomes `en avance de 2`. So the ahead/behind counts silently came back as nothing at all — not as something visibly wrong, which is worse. git is now invoked with `LC_ALL=C` pinned at every call site.
- **git ran without `$HOME`, and so without `~/.gitconfig`.** simple-git's `.env(name, value)` form replaces the child environment outright rather than merging into it, which took `$HOME` away with it. Handing it a full environment object instead is no better: `@simple-git/argv-parser` refuses the call on sight of `EDITOR`, `PAGER`, `GIT_ASKPASS` or any of ~19 other variables. It now receives an explicit allow-list, so your identity, `core.sshCommand`, `~/.ssh/config` and the credential helper apply again.

### Changed
- **The README now states the git version it needs.** Predicting conflicts before a merge or rebase needs `git merge-tree --merge-base` (git 2.40); below that the operation ran without its warning and nothing said why. macOS still ships 2.39, so that was the default experience there. Everything else works from 2.28 on.

## 0.1.0

### Added
- **First release.** A terminal UI Git client — `npx git-vertex-cli`, or `npm i -g git-vertex-cli && gv`.
