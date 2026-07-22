# Changelog — Git Vertex (desktop)

## 1.12.0

### Added
- **"What's new" tab** — the first time the app opens after an update, a tab shows the release notes (like VS Code).
- **Settings / profile from the welcome screen** — the settings and profile buttons are now reachable before opening a repository.

## 1.11.0

### Added
- **Conflict warning before an operation** — before a merge, rebase, cherry-pick, revert or pull (and the graph's drag-drop merge/rebase), Git Vertex predicts whether the operation will conflict (a dry run via `git merge-tree`, nothing written to disk) and warns you, with the choice to continue or cancel. Rebase prediction simulates the replay commit by commit, so it catches conflicts a naive tip-merge would miss. A **"Prévenir avant un conflit"** toggle in Settings › Comportement (on by default) controls it, with a "don't ask again" shortcut on the warning.
