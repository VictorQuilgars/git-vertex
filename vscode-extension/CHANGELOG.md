# Changelog

## 1.22.0

### Fixed
- **Every message the panel raised after a git action was empty.** "Tag created", "Branch deleted", "Stash popped", "Rebase continued" — forty of them looked up translation keys that had never been defined, so each action ended with a toast containing nothing. The panel is bundled by esbuild, which type-checks nothing, so no build ever complained.
- **The commit-message editor crashed on a squash step**, and the file history crashed on an empty blame pane: both called the translation helper where it was out of scope.
- **French strings in an English panel** — the search box placeholder, the interactive rebase view ("Lancer le rebase", "Abandonner"), the conflict banner, the reword editor, the toolbar tooltips and every confirmation prompt ("Supprimer la branche …?").
- **git's output no longer depends on your system language.** Every git invocation runs with a fixed locale, so errors surface in English rather than in the language of the machine.

### Added
- **A one-time notice when git is too old** for conflict prediction: it needs `git merge-tree --merge-base=…` (git 2.40), and below that the prediction returned nothing, so the warning before a merge or rebase never appeared. Everything else works from git 2.28 on.

## 1.21.0

### Fixed
- **Pull ignored the strategy you picked.** The chevron next to Pull offers Fetch All / fast-forward if possible / fast-forward only / rebase; the panel ran a plain `git pull` whatever you chose, so "fast-forward only" could still leave you with a merge commit.
- **Partial stashes took everything.** The stash **+** menu asked whether to stash the index only, or only what isn't staged, then stashed the lot regardless — including your untracked files.
- **Renaming a stash, pruning a remote, deleting the branches it leaves behind, and marking a default remote** did nothing at all: the menu entries were there, the operations behind them were not.
- **A renamed stash kept its old label** — the list read the commit subject instead of the reflog message.
- **A stash's diff came back empty**, though the code to produce it was there: the panel asked for `stashDiff` while the service called it `getStashDiff`.
- **Push, publishing a branch, setting upstream and pushing or deleting a tag all assumed `origin`**, ignoring the repository's chosen default remote.
- **External diff/merge tools and SSH key browse/generate** did nothing from Settings — they had no implementation on the extension side.

## 1.20.0

### Added
- **Inline blame** — the line the cursor sits on now ends with who last changed it, how long ago, and the start of that commit message. Blame was only reachable through the File History tab until now, never in the editor itself. Hovering the annotation gives the full message, the author's date and the sha, with links to the file's history and to copy the sha.
- **Unsaved edits are blamed too** — lines you have just typed read "You, uncommitted changes" instead of staying attributed to whoever wrote what used to be on that line.
- **File blame annotations** — *Git Vertex: Toggle File Blame Annotations*, also in the editor tab's right-click menu, annotates every line at once and colors the gutter by age: hot for what changed recently, cold for what nobody has touched in months.
- **Git CodeLens** above the file, and above each class, function and method: the most recent commit for that range and how many people wrote it, clicking through to the file history.
- **Toggles and settings** — *Toggle Line Blame*, *Toggle File Blame* and *Toggle Git CodeLens* in the command palette, plus settings for the annotation format, message length, whitespace handling (`git blame -w`), the file-size cutoff, the heatmap threshold and which scopes get a CodeLens.

## 1.19.1

### Added
- **Checkbox staging list** — the panel's file list now uses a single checkbox-per-file list (with tri-state folder checkboxes in tree view) instead of separate Unstaged/Staged sections, matching VS Code's own Source Control view.

### Changed
- **Commit message is a single free-form field** — no more separate summary/description inputs; write your message with your own line breaks, same as `git commit` itself. The conventional-commit type picker and character counter were removed to give the field more room.
- **Amend previous commit** now shares its row with **Generate with AI**, at every panel size, and the commit-form resize handle is no longer capped by short panels.

### Fixed
- The staging file list could render sideways (files next to the header instead of below it) in short, wide panels.
- The commit button could overlap the summary field or spill past the panel edges in short panels.

## 1.19.0

### Added
- **Activity rail** — the panel's left sidebar is now a slim, always-visible icon rail (like VS Code's own activity bar). Each icon opens a single, resizable side-panel view instead of one tall stacked list, leaving the commit graph more room: Overview, Agents, Worktrees, Branches, Remotes, Stash, Tags. Your active view and the panel width are remembered. When the panel is too short to show every icon, the overflow collapses into a "…" menu — icons never shrink.
- **Overview "current work" view** — a home view that summarizes the checked-out branch (ahead/behind, staged and changed file counts, and a badge when AI agents are running in the repo), followed by your local branches. The reflog moves to a collapsed section at the bottom.

### Changed
- **Distinct worktree & branch icons** — the worktree icon is now a framed commit node, clearly different from the branch fork next to it.

## 1.18.1

### Changed
- **Internationalization (i18n) cleanup** — Removed all hardcoded French strings from the extension and fully adopted the English translation system.

## 1.18.0
- **Unified graph context menu** — right-clicking a local branch opens the same menu as its tip commit (branch actions + commit actions); Reset/Copy/Move are now hover submenus for a shorter menu.
- **Clearer branch drag-drop** — "Merge A into B" / "Rebase A onto B" with real branch names, correct direction; no menu when dragging the checked-out branch.

## 1.17.0

### Added
- **"What's new" after an update** — the first time you use the extension after it updates, its changelog opens automatically (like VS Code's own release notes).

## 1.16.0

### Added
- **Conflict prediction warnings** — before a merge, rebase, cherry-pick, revert or pull (and the graph's drag-drop merge/rebase), Git Vertex predicts whether the operation will conflict — a dry run via `git merge-tree`, nothing written to disk — and shows a warning with the choice to continue or cancel. Rebase prediction simulates the replay commit by commit, so it catches conflicts a naive tip-merge would miss (and doesn't cry wolf on changes undone later in the branch). A **"Prévenir avant un conflit"** toggle in Settings › Comportement (on by default) controls it, with a "don't ask again" shortcut on the warning itself.

## 1.15.0

### Added
- **AI features, fully wired in the panel** — the shared UI's AI actions now work inside VS Code: commit-message generation, "Recompose commit with AI" (regenerate a commit's message from its real diff), "Explain this commit" (plain-French summary), AI-assisted conflict resolution with natural-language guidance and an explanation of the AI's choices, and natural-language commit search. Direct REST calls to Anthropic/Google/Groq/OpenAI — no SDK weight.
- **Full settings page** — a gear (⚙) toolbar button opens the same settings surface as the desktop app (identity & profiles, appearance, graph columns, GitHub, AI provider/key/live model list). GitHub uses manual PAT entry in the panel (no OAuth in a webview); explicit `gitVertex.ai*` VS Code settings take precedence when set.
- **Cached commit explanations** — an explanation, once generated, persists per repo+commit; a collapsible "💬 Explication IA disponible" accordion in the commit details re-opens it with no API call, with a ↻ to regenerate.
- **Conflict resolver side labels** — panes now show branch + "hash — subject" for each side (during a rebase, the replayed branch is resolved from `rebase-merge/head-name`) instead of the cryptic "Nôtre (HEAD)" / "Leur (hash)".

### Fixed
- Custom editors no longer hijack files they weren't built for: the rebase editor only accepts `git-rebase-todo`, the commit-message editor only `COMMIT_EDITMSG`/`MERGE_MSG`/`SQUASH_MSG`, and the conflict resolver bounces files without conflict markers back to the normal text editor (a stray `"*"` entry in `workbench.editorAssociations` used to open random files in the rebase UI).
- AI config no longer ignores the in-panel settings: the declared default of `gitVertex.aiProvider` ("groq") was shadowing the store written by the settings page, causing false "no API key" errors.
- Smarter AI retry/backoff: 429/503 answers back off exponentially honoring `Retry-After` (hammering a rate limit every 500ms made it worse), bad keys fail fast, and error toasts explain the situation in French with the provider's own detail instead of a bare "HTTP 503".

## 1.14.0

### Added
- **Commit graph column customization** — right-click the graph's header bar to toggle Author, Date, SHA, avatars, and a new additions/deletions stat bar (green/red ratio, from `git log --numstat`), or switch to a compact layout.
- **Real compact layout** — compact mode now actually shrinks columns (each layout remembers its own widths independently) instead of just swapping header labels for icons: branch/tag and author names are replaced by icons, and the avatar moves off the graph node into a small bullet beside it. The additions/deletions bar is off by default in this panel (narrower than the desktop window).
- **Predictable column resize** — dragging a column border now trades width directly with its nearest visible neighbor, so resizing one column never shifts or hides another.

## 1.13.0

### Added
- **Native commit context menu** — the right-click menu on a commit now renders as a real VS Code native menu (`webview/context`), so it's never clipped by the panel's bounds; every label matches GitLens's clarity, and it gained the actions GitLens has that were missing: reword any commit (not just HEAD), rebase current branch onto commit, push to commit, create/copy patch, create worktree, open commit on remote, compare working tree to here, select for compare / compare with selected. Related actions (interactive rebase, rebase onto commit) are grouped together.
- **Custom squash/reword message** — choose the final commit message yourself when squashing or rewording during an interactive rebase, instead of git's raw concatenation of the originals.
- **Interactive rebase & rebase-in-progress as tabs** — the planner and the "Rebase en cours" tracker both open as editor tabs (not modals), matching GitLens's Interactive Rebase view: branch/onto chips, step counter, a conflict banner with "Show conflicts", relative commit dates, a conflicted-files section with a filter, and drag/keyboard editing (pick/reword/edit/squash/fixup/drop, Alt+↑↓) on the remaining steps. The actually-conflicted commit is highlighted in red. Every Git Vertex tab now shows the app icon.
- **`git-rebase-todo` defaults to Git Vertex for every user** — shipped as an extension-provided default (`workbench.editorAssociations` via `configurationDefaults`), no per-workspace setup needed; the same tab now serves both the pre-launch planner and the paused/conflict tracker for the same file, so there's one tab bound to the real file instead of two disconnected ones.
- **Conflict resolver bound to the real file** — the 3-way resolver opens on the actual conflicted file (via "Reopen Editor With" or automatically when Git Vertex detects a conflict) instead of a floating panel with no file identity of its own.
- **Reword/squash message editing for terminal-started rebases** — *Git Vertex: Toggle Interactive Rebase Editor* now also sets `core.editor`, so reword and squash steps during a `git rebase -i` started in a plain terminal open a Git Vertex form for the commit message, not whatever `$EDITOR` happened to be configured.

### Fixed
- `rebaseOnto` / rebase-current-branch-onto-commit no longer abort the rebase on conflict — they pause it like every other rebase entry point, so you can resolve and continue instead of losing the attempt.
- Fixed a race where the rebase tracker and the `git-rebase-todo` planner could both open at once, and a related bug where the tracker silently stopped reopening after "Lancer" if the rebase immediately re-paused on a new conflict.

## 1.12.0

### Added
- **Rebase tab (GitLens-style)** — a "Rebase en cours" editor tab opens automatically whenever a rebase is detected, even one started from a terminal or an external tool: step timeline (done/current/remaining), conflicted files, Continue / Skip / Abort. Manual open via *Git Vertex: Show Rebase in Progress*; disable auto-open with `gitVertex.autoOpenRebaseTab`.
- **Interactive rebase editor** — `git-rebase-todo` files open in a visual planner (reorder by drag, pick/reword/edit/squash/fixup/drop). Enable with *Git Vertex: Toggle Interactive Rebase Editor* (sets `sequence.editor` to `code --wait`); a one-time suggestion appears on the first detected rebase.
- **3-way conflict resolver tab** — the rich A/B line-picking resolver (with base fallback and manual edit) now opens per conflicted file in its own editor tab; VS Code's native conflict editor remains available.
- **File History & Blame tab** — commit timeline for a file with per-commit diff or blame view (*Git Vertex: File History & Blame*, also in explorer/editor-tab context menus).
- **Compare tab** — compare two branches/tags: ahead/behind commit lists + full diff and changed files (*Git Vertex: Compare References*, or "Comparer" on a sidebar branch).
- **GitHub PRs & Issues tab** — open pull requests and issues of the GitHub remote (*Git Vertex: GitHub PRs & Issues*; token via *Git Vertex: Set GitHub Token*).

### Fixed
- First open now shows the commit graph instead of the branches sidebar; the sidebar toggle is persisted.

## 1.5.0

### Added
- Full embedded Git GUI in the VS Code bottom panel (alongside Terminal/Output)
- Real commit graph with colored lanes, branch/tag chips, author avatars — identical to Git Vertex Desktop
- Staging area: stage/unstage/discard files, commit message, create commits
- Commit detail panel: file list, inline diff, co-author display, amend message
- Compact toolbar: Fetch, Pull, Push, new branch, stash, pop, undo, terminal, branch selector
- Branch selector dropdown for quick checkout
- "Open in Git Vertex Desktop" button — launches the desktop app on the same repo
- Status bar item showing current branch + ahead/behind tracking
- Context menu on commits: cherry-pick, revert, reset, create tag, create branch, copy hash
- Auto-refresh on `.git` changes and working-tree edits
- "Open in Git Vertex" command and explorer context menu entry

## 1.0.0

- Initial release

