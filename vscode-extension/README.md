# Git Vertex

**A full Git GUI embedded directly in VS Code** — same visual design as Git Vertex Desktop, inspired by the best Git clients.

## Requirements

**git 2.40 or newer is recommended** (2.28 minimum). Everything works from 2.28
on, except predicting conflicts before a merge, rebase, cherry-pick or revert:
that uses `git merge-tree --merge-base=…`, added in git 2.40. On an older git the
operation still runs, just without the warning — the extension says so once. Worth
knowing on macOS, whose bundled git is still 2.39.

## Features

### Commit Graph
- Colored branch lanes with branch/tag chips, exactly like the desktop app
- Author avatars on commit nodes
- Click any commit to see its full detail (files, diff, author, co-authors)
- Context menu: cherry-pick, revert, reset, create branch, create tag, copy hash

### Staging & Commits
- Stage / unstage / discard files individually or all at once
- Write a commit message and commit without leaving VS Code
- Amend the last commit message directly from the commit detail

### Toolbar
- **Fetch / Pull / Push** — sync your repo in one click
- **Branch selector** — list and checkout local branches from a dropdown
- **New branch, Stash, Pop stash, Undo** — common operations always visible
- **Open in Git Vertex Desktop** — hand off to the full desktop app

### Panel integration
Git Vertex lives in the **bottom panel** (alongside Terminal, Output, Debug Console).
Open it via:
- `Ctrl/Cmd + Shift + P` → **Git Vertex: Show Graph**
- Or click the **GIT VERTEX** tab in the panel

## Requirements

- A folder open in VS Code that contains a `.git` repository

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gitVertex.appPath` | _(auto-detect)_ | Path to the Git Vertex Desktop executable |
| `gitVertex.showStatusBar` | `true` | Show branch info in the status bar |

## Links

- [Git Vertex Desktop](https://github.com/VictorQuilgars/git-vertex)
- [Report an issue](https://github.com/VictorQuilgars/git-vertex/issues)
