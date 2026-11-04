# Changelog — Git Vertex CLI

## 0.2.0

### Changed
- **The TUI wears the desktop's palette.** It still painted the colours the desktop had before its seeds moved (`#0d1117`, `#3fb950`, `#f85149`, `#58a6ff`). Its table now holds the default theme's 24 seeds, and every other colour is mixed from them the way the desktop mixes it; a test fails the day the two disagree. A panel title at rest is the secondary text and the focused panel wears the accent, because the current success green and accent aqua are too close to tell focus apart. The TUI paints no surface: on a 256-colour terminal the three dark depths become one cell, so the selected row takes a stronger tint there unless `COLORTERM` announces truecolor. (#76)

### Fixed
- **`npm run build` works again.** Four imports of the palette had no `.js` extension, which the typecheck accepts and the published build refuses.
- **Drop, move and the interactive rebase work on Windows.** Git hands the sequence editor to `sh`, and the path to ours arrived with backslashes, which `sh` swallows — the script was looked for as `C:Users…Tempgitvertex-rebase-editor-….sh` and not found. The path is now quoted with forward slashes, and the script runs through `sh` rather than by its execute bit.
- **Continue no longer skips a commit that still has staged changes.** A `--continue` that failed with nothing in conflict was taken for an empty commit and skipped, discarding what a hook or an editor had refused. It now skips only a commit with nothing staged.
- **The `WIP` row counted a file staged and then modified again twice.** It is in both columns of `git status`, and the row added the two lists. It counts files now. (#232)
- **A rebase in a linked worktree is seen as paused, not failed.** The CLI looked for the rebase's state in `<worktree>/.git`, which is a file there; it now follows it, for the merge message and the conflict mode too.
- **A long rewrite is no longer killed after 30 seconds.** The limit is ten minutes, reaching it is reported as such rather than as a conflict, and continue never skips the step git was stopped in.

## 0.1.1

### Fixed
- **The branch tracking counters read zero on a non-English machine.** The CLI reads several of git's messages by their English wording, and git translates them: `[origin/x: gone]` becomes `[origin/x : disparue]` under a French locale, and `ahead 2` becomes `en avance de 2`. So the ahead/behind counts silently came back as nothing at all — not as something visibly wrong, which is worse. git is now invoked with `LC_ALL=C` pinned at every call site.
- **git ran without `$HOME`, and so without `~/.gitconfig`.** simple-git's `.env(name, value)` form replaces the child environment outright rather than merging into it, which took `$HOME` away with it. Handing it a full environment object instead is no better: `@simple-git/argv-parser` refuses the call on sight of `EDITOR`, `PAGER`, `GIT_ASKPASS` or any of ~19 other variables. It now receives an explicit allow-list, so your identity, `core.sshCommand`, `~/.ssh/config` and the credential helper apply again.

### Changed
- **The README now states the git version it needs.** Predicting conflicts before a merge or rebase needs `git merge-tree --merge-base` (git 2.40); below that the operation ran without its warning and nothing said why. macOS still ships 2.39, so that was the default experience there. Everything else works from 2.28 on.

## 0.1.0

### Added
- **First release.** A terminal UI Git client — `npx git-vertex-cli`, or `npm i -g git-vertex-cli && gv`.
