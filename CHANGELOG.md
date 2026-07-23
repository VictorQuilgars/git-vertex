# Changelog — Git Vertex (desktop)

## 1.14.2

### Fixed
- **Windows: the app name now reads "Git Vertex"** in the title bar, taskbar tooltip and Alt-Tab (the window title was still "Git GUI").
- **Commit graph: the WIP (working-changes) dashed line no longer cuts through another branch's commit** — when the current branch is one commit behind `master`, the WIP node now sits on its own offset lane and only hooks into its branch tip at the bottom.
- **No more `MaxListenersExceededWarning`** — deep-link, updater and GitHub-auth IPC listeners were piling up (notably one per Settings open); subscriptions now return an unsubscribe function that the UI cleans up.

## 1.14.1

### Fixed
- **Windows: the setup wizard no longer reappears on every update** — the NSIS updater now applies the update silently and relaunches the app.
- **Windows: the Git Vertex icon now shows** in the taskbar and title bar — a proper multi-resolution `.ico` is bundled and used as the window icon (an `.icns` is not valid on Windows). The About-screen logo also resolves in packaged builds.
- **The +/− (stats) column is no longer clipped by the window's right edge** (Windows/Linux) — columns are now sized against the width left by the vertical scrollbar, so every column fits by default and the header stays aligned with the rows.

## 1.14.0

### Added
- **Redesigned launchpad (welcome screen)** — a two-column home with a vertical divider: Open / Clone / **Create** (git init), a repository search box, and the recent list (capped, no scroll); plus a **Resources** panel (Release notes, Source code, Documentation).
- **Release notes on demand** — open the (GitKraken-style) release notes anytime from Resources, with an "Open in browser" link.

### Changed
- The home is a named, non-permanent tab (🏠): opening a repository from it closes it; opening a non-repo view (release notes) keeps it, before it in the tab bar (opening order). The repo sidebar and activity bar are hidden on the home.

## 1.13.1

### Fixed
- The "What's new" release-notes view is now a normal, non-blocking tab: you can open a repository without closing it, keep it in the background, and close it by its × (no more "C'est parti" button, and the repo's sidebar/toolbar are no longer reachable behind it).

## 1.13.0

### Changed
- **Unified graph context menu** — right-clicking a local branch chip now opens the same menu as its tip commit (branch actions + commit actions), matching GitKraken; a non-tip commit keeps the commit-only menu.
- **Shorter menu with submenus** — Reset (soft/mixed/hard), Copy (hashes/message) and Move (up/down) are now hover submenus.
- **Clearer branch drag-drop** — dragging branch A onto branch B offers "Merge A into B" / "Rebase A onto B" with real branch names (not the target SHA), in the expected direction; no menu when dragging the checked-out branch.

### Fixed
- The branch chip in the graph now offers Merge/Rebase (they were missing; only the sidebar had them).

## 1.12.0

### Added
- **"What's new" tab** — the first time the app opens after an update, a tab shows the release notes (like VS Code).
- **Settings / profile from the welcome screen** — the settings and profile buttons are now reachable before opening a repository.

## 1.11.0

### Added
- **Conflict warning before an operation** — before a merge, rebase, cherry-pick, revert or pull (and the graph's drag-drop merge/rebase), Git Vertex predicts whether the operation will conflict (a dry run via `git merge-tree`, nothing written to disk) and warns you, with the choice to continue or cancel. Rebase prediction simulates the replay commit by commit, so it catches conflicts a naive tip-merge would miss. A **"Prévenir avant un conflit"** toggle in Settings › Comportement (on by default) controls it, with a "don't ask again" shortcut on the warning.
