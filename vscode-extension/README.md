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

### File Blame
Toggle file blame to see one author label per run of lines from the same commit,
with continuation marks and author avatars (initials when an image is unavailable).
Moving the cursor highlights all lines written by that commit, including separate
runs elsewhere in the file. The age heatmap and hover actions remain available.

### Staging & Commits
- Stage / unstage / discard files individually or all at once
- Write a commit message and commit without leaving VS Code
- Amend the last commit message directly from the commit detail

### Toolbar
- **Fetch / Pull / Push** — sync your repo in one click
- **Branch selector** — list and checkout local branches from a dropdown
- **New branch, Stash, Pop stash, Undo** — common operations always visible
- **Open in Git Vertex Desktop** — hand off to the full desktop app

### Where it lives
Git Vertex opens in the **bottom panel** (alongside Terminal, Output, Debug Console)
and can live in the **side bar** instead — the primary or the secondary one. Drag the
view to the activity bar, or run **Git Vertex: Move to Side Bar** / **Move to Panel**
from the view's title menu. The panel adapts to the space it is given: wide and short
in the bottom panel, narrow and tall in a side bar, where the rail stays, the views it
opens float over the graph, and the details sit under it.

Open it via:
- `Ctrl/Cmd + Shift + P` → **Git Vertex: Show Graph**
- Or click the **GIT VERTEX** tab in the panel, or its icon in the activity bar

## Requirements

- A folder open in VS Code that contains a `.git` repository

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gitVertex.appPath` | _(auto-detect)_ | Path to the Git Vertex Desktop executable |
| `gitVertex.showStatusBar` | `true` | Show branch info in the status bar |
| `gitVertex.blame.file.groupRuns` | `true` | One label per consecutive run of the same commit |
| `gitVertex.blame.file.avatars` | `true` | Author avatars, with initials as fallback |
| `gitVertex.blame.file.highlightCommit` | `true` | Highlight every line from the cursor's commit |

## Links

- [Git Vertex Desktop](https://github.com/VictorQuilgars/git-vertex)
- [Report an issue](https://github.com/VictorQuilgars/git-vertex/issues)
