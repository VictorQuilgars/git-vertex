# Git Vertex — CLI (TUI)

A terminal UI Git client, in the spirit of the Git Vertex desktop app and VS Code
extension. Commit graph, staging, branches — all from the keyboard.

Built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal) and
reuses the same `GitService` logic (vendored, Node-pure) as the rest of the project.

## Install & run

Published on npm — no clone needed:

```bash
npx git-vertex-cli            # run in the current repo, zero install
npx git-vertex-cli ~/code/x   # a specific repo

npm i -g git-vertex-cli       # then use the `gv` command anywhere
gv
```

### From source (development)

```bash
cd cli
npm install
npm start                # runs the TS sources via tsx (current repo)
npm start -- /path/to/repo
npm run build            # compile to dist/ (what gets published)
```

## Layout

```
❯ Git Vertex · <repo> · ⎇ <branch> ↑a ↓b        <status message>
┌ Fichiers / Branches / Commits (Tab) ─┬─ Diff / détails ───────────┐
│  ○ M src/app.ts                       │  @@ -1,3 +1,4 @@           │
│  + ? new.ts                           │  +added                    │
│  ● A staged.ts                        │  ...                       │
└───────────────────────────────────────┴────────────────────────────┘
<contextual keys> │ Tab · ↑↓/jk · f fetch · p pull · P push · ? aide · q quitter
```

- Left panel switches between **Fichiers**, **Branches**, **Commits** with `Tab`.
- Right panel shows the selected file's diff, the selected commit's diff, or branch info.

## Keys

| Scope | Key | Action |
|-------|-----|--------|
| Global | `Tab` / `⇧Tab` | switch panel |
| Global | `↑ ↓` or `j k` | move selection |
| Global | `f` / `p` / `P` | fetch / pull / push |
| Global | `r` | reload · `?` help · `q` quit |
| Fichiers | `Espace` | stage / unstage the file |
| Fichiers | `a` / `A` | stage all / unstage all |
| Fichiers | `c` | commit staged changes (type message, `Entrée`) |
| Fichiers | `d` | discard file changes (confirm) |
| Branches | `Entrée` | checkout · `n` new · `D` delete |
| Diff | `Ctrl+D` / `Ctrl+U` | scroll the diff pane |

## Status

MVP: graph, file-level staging, commit, branches, remote ops. The unified-diff
parser + `buildPatch` for **hunk/line-level staging** are already ported in
`src/core/diff.ts` — the next step is wiring a diff-pane cursor to stage individual
hunks/lines (same as the desktop `CenterFileDiff`).

## Note

`src/core/{gitService,types,graphLayout}.ts` are vendored copies of the VS Code
extension's Node-pure modules (inline `require()` converted to ESM imports). Keep in
sync with `vscode-extension/src/`.
