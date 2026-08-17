# Git Vertex — Context for Claude

## Overview
**Four products live in this repository**, each with its own version, tag prefix and
release channel. Only the first is an Electron app, and it is easy to assume it is the
whole repo — it is not:

| Product | Directory | Tag | Ships to |
|---|---|---|---|
| Desktop app (Electron + React + TS, electron-vite) | `.` / `src/` | `vX.Y.Z` | GitHub release: mac/win/linux installers + auto-update feed |
| VS Code extension | `vscode-extension/` | `ext-vX.Y.Z` | Marketplace + Open VSX |
| MCP server | `mcp/` | `mcp-vX.Y.Z` | npm (`git-vertex-mcp`) |
| CLI | `cli/` | `cli-vX.Y.Z` | npm (`git-vertex-cli`) |

Desktop: `npm run dev`, `npm run package`, tests `npm test` (jest).
Releasing anything: `scripts/release.sh <app|ext|cli|mcp> <patch|minor|major|X.Y.Z>` —
**never tag by hand**, see `RELEASING.md`. Products can be combined for a change
that spans them: `scripts/release.sh app+ext minor`, or `app=1.28.0+ext=patch`
for a different bump each — one commit, one PR, both workflows.

## Architecture

### Process model (desktop)
```
Main process   src/main/index.ts          IPC handlers, settings, AI calls
               src/main/git-service.ts    All git operations (simple-git)
               src/main/git-binary.ts     Which git we run (login-shell PATH, abs path)
               src/main/recent-repos.ts   Recent repos persistence

Preload        src/preload/index.ts       contextBridge — exposes window.gitAPI

Renderer       src/renderer/src/App.tsx   Root component, all state & handlers
               src/renderer/src/components/...
```

### The renderer is shared with the VS Code extension
`src/renderer/**` is compiled into **both** products. In the extension, the webview
installs a shim so `window.gitAPI.<method>` is posted to `GitVertexHost`, which answers
from an explicit `case` or forwards reflectively to `vscode-extension/src/gitService.ts`
— and returns `not-implemented: <method>` for anything it cannot find.

**Consequence to keep in mind:** adding a preload method makes the shared UI offer a
button that does nothing in VS Code. `vscode-extension/src/test/suite/hostParity.test.ts`
fails on any unclassified method; run it with `npm run test:nodisplay` in
`vscode-extension/` (the full `npm test` there needs a real VS Code). A method that
exists on both sides with a *poorer* signature is the worse case — it succeeds while
doing something else. Both classes have shipped.

### IPC pattern
- Main: `ipcMain.handle('namespace:action', async (_event, ...args) => { ... })`
- Preload: `actionName: (...args) => ipcRenderer.invoke('namespace:action', ...args)`
- Renderer: `window.gitAPI.actionName(...args)`

Adding a new IPC endpoint requires changes to **all three files** — plus the extension
host if the caller is shared renderer code.

## Key files

| File | Role |
|------|------|
| `src/main/git-service.ts` | GitService class wrapping simple-git. All git ops live here. |
| `src/main/git-binary.ts` | Resolves the git binary once (login-shell PATH); `gitEnv`/`makeSimpleGit` use it |
| `src/main/index.ts` | IPC handlers wired to GitService + settings + AI providers |
| `src/preload/index.ts` | Typed bridge — every entry here is a callable on `window.gitAPI` |
| `src/renderer/src/App.tsx` | Single root component, holds all app state and handlers |
| `src/renderer/src/types.ts` | Shared types: CommitNode, BranchInfo, FileChange, WorkingChanges |
| `vscode-extension/src/panel/GitVertexHost.ts` | The extension's answer to `window.gitAPI` |
| `scripts/products.sh` | The four products and what a release of each needs — read by both the laptop and CI |

## git invocations
Never spawn a bare `'git'`. Use `gitBinary()` for `execFile`/`spawn` and
`makeSimpleGit(repoPath)` for simple-git, both from `src/main/git-service.ts`: an app
launched from the Finder gets a truncated PATH and would otherwise run Apple's git 2.39
instead of the user's. `gitEnv()` also pins `LC_ALL=C` — **no code may match a
translated git message**, that bug has shipped twice.

## Settings
Stored in `app.getPath('userData')/settings.json` via `readSettings()` / `writeSettings()`.

Key settings:
```
githubToken        GitHub PAT
aiProvider         'anthropic' | 'google' | 'groq' | 'openai'
aiAnthropicKey     API key for Anthropic
aiGoogleKey        API key for Google
aiGroqKey          API key for Groq (also groqApiKey for backward compat)
aiOpenaiKey        API key for OpenAI
aiAnthropicModel   Selected model (e.g. claude-sonnet-4-6)
aiGoogleModel      Selected model (e.g. gemini-2.0-flash)
aiGroqModel        Selected model (e.g. llama-3.3-70b-versatile)
aiOpenaiModel      Selected model (e.g. gpt-4o-mini)
```

## AI commit message generation
Handler: `ai:generate-commit-message` in `src/main/index.ts`
- Reads `aiProvider` + `ai<Provider>Model` + `ai<Provider>Key` from settings
- Builds a prompt from `git diff --cached`
- Retries up to 3 times on empty response (some models are intermittent)
- `max_tokens: 512`
- Prompt forces English output

Supported providers: Anthropic (`@anthropic-ai/sdk`), Google (`@google/generative-ai`),
Groq (`groq-sdk`), OpenAI (`openai`).

Models list fetched live from provider API via `ai:list-provider-models`.
Groq list excludes `whisper*` and `distil-whisper*` (audio-only models).

## Settings page
Component: `src/renderer/src/components/SettingsModal/SettingsModal.tsx`
Rendered as a **full page** (not a modal overlay) — replaces `app-body` when open.
Sections: Git global config | GitHub token | AI provider + model + key.
Triggered by the ⚙ button in Toolbar (toggles `settingsOpen` state in App.tsx).

## Push modal
Component: `src/renderer/src/components/PushModal/PushModal.tsx`
Allows choosing remote + target branch + `--set-upstream`.
Says so and hides the Push button when the repo has no remote.
Errors shown inline in the modal (not a disappearing toast).

## Interactive rebase
Uses `GIT_SEQUENCE_EDITOR` env var to inject pre-built sequence.
Has `--autostash` flag to handle unstaged changes automatically.
When amend mode is active in RightPanel, files from `HEAD` commit are shown
in the staging area with an `amend` badge (fetched via `getCommitFiles('HEAD')`).

## CommitGraph
`src/renderer/src/components/CommitGraph/CommitGraph.tsx`
- `LANE_WIDTH = 18`, `ROW_HEIGHT = 34`
- `svgW = Math.max(SVG_PAD_L + (maxLane + 1) * LANE_WIDTH + SVG_PAD_R, 62)` — minimum 62px to avoid header overlap
- Graph layout computed in `src/renderer/src/components/CommitGraph/graph-layout.ts`

## Icon
**Two** SVG masters, and that is deliberate:

| File | Feeds |
|---|---|
| `resources/icon.svg` | 64px and up — the full mark, dotted iris commits included |
| `resources/icon-small.svg` | 16 and 32px — the reduced cut |

The intermediate commit rings are 9 units of stroke on a 416-unit mark, so below
roughly 72px they go sub-pixel and the node turns to grey mush. Scaling one SVG
to every size, which the old recipe did, produced a 16px icon that was a smear.

Regenerate every artefact — `.icns`, `.ico`, `.png` — with:
```bash
./scripts/gen-icons.sh
```
Needs `rsvg-convert` (`brew install librsvg`), `iconutil` (Xcode) and Pillow.

Neither master is hand-edited: both are written by
`docs-private/logo-piste-g/logo.py`, which reads its colours from `tokens.css`.
**To change the logo's colours, change the seeds in `tokens.css` and re-run it.**

`resources/icon.png` + `resources/icon.ico` are also whitelisted in the
electron-builder `files` array so the runtime `BrowserWindow` icon resolves
inside the packaged asar (macOS takes its icon from the app bundle instead).

The rest of the brand — wordmark, lockups, monochrome and small cuts, the
knockout, the watermark — is in `resources/brand/`, with its own README.

## Colour, themes, style conventions
`src/renderer/src/tokens.css` is split in two, and the split is the point:

- **SEEDS** — fifteen colours plus ten graph lanes, the only values in the file.
  They carry the roles the design board names: `--seed-aqua` is the human act,
  `--seed-iris` is what the model proposes and is **never** a filled button.
- **DERIVED** — everything else, as `color-mix()` of seeds, resolved by the
  browser. Change a seed and every token below it follows. No build step.

A **theme is a block of seeds** and nothing else — see `[data-theme="aqua-light"]`
at the bottom of the file, which is 25 lines rather than 100.
`__tests__/token-discipline.test.ts` fails if a theme misses a seed, defines an
extra one, or overrides a derived token.

Themes are applied by `SettingsContext.applyAppearance` via `data-theme` on
`<html>`, mirrored to `localStorage` so `main.tsx` can set it before React
mounts (otherwise a light theme opens with a black flash). An **installed**
theme has no block in `tokens.css`, so its seeds are mirrored alongside the id
and `main.tsx` injects a real `[data-theme="id"]` rule before mounting — a rule
rather than inline properties on `<html>`, because the picker's chips carry
`data-theme` on a descendant and only a rule reaches them.

Inside VS Code the panel follows the editor by default, watched by a
`MutationObserver` on `body.class`, but that is now the `panelFollowEditorTheme`
setting rather than a law: turn it off and the panel takes its own theme. Any
rewrite of the tokens must call `resetThemeCache()` — the graph resolves lanes
and the canvas to literals once and caches them.

- CSS modules per component, BEM-like class names (`component-element--modifier`)
- No global CSS framework
- A colour literal in a component stylesheet or an inline `style={{}}` is a bug,
  and the test above will say so.

## Themes: where they live and how they are regenerated

**Three tiers, and only the first is in this repository.**

| Tier | Where | How many |
|---|---|---|
| Built-in | `src/renderer/src/tokens.css`, listed in `BUILT_IN_THEMES` | 32 |
| Installed | `userData/themes/` (desktop) · `globalStorageUri` (extension) | up to 200 |
| The bank | `https://gitvertex.vi-lab.fr/themes/v1/` | 3,960 |

The bank is generated from Open VSX by the pipeline in `docs-private/themes/`,
which is **git-ignored** — a fresh clone does not have it, and CI cannot see it.
That is why publishing is a laptop command and not a workflow:

```bash
scripts/publish-themes.sh            # regenerate, verify, rsync to the homelab
scripts/publish-themes.sh --dry-run
```

Regenerating the palettes themselves is upstream of that and rarely needed:
`python3 crawl.py fetch` (two hours, network), then `crawl.py remap` (seconds,
offline, re-maps from the raw cache) and `assemble.py`.

**`catalogue.py` wipes its output tree before writing, and the publish uses
`rsync --delete`.** Both are load-bearing. The tree was once written on top of a
previous generation and kept 491 files that were no longer in the index, 449 of
them carrying a palette bug that had already been fixed; they were absent from
`index.json` so nothing listed them, but they still answered on their own URLs —
and `theme/{id}.json` is served `immutable, max-age=31536000`.

### The rules a theme has to pass, and why they are what they are

`src/main/theme-validate.ts` is the single validator: free of `electron` and
`vscode`, imported by the desktop main process and bundled into the extension
host, so both products enforce the same thing. It runs **on install and on
read** — a file in `userData` can be hand-edited after it was installed, and the
read path is the one that feeds the stylesheet.

It rejects, and never repairs. In order: the 24 seeds exactly, each matching
`/^#[0-9A-Fa-f]{6}$/` (this is the only thing between a served file and the
document's CSS); a valid id that is also a safe filename; the five contrast
pairs at 4.5:1; **all four semantic seeds distinct**; and `success`/`danger`
within 60° of their meaning's OKLCH hue.

Two of those have history worth keeping:

- **Distinctness** is the one that matters. The generator used to fall back to
  the accent when a theme declared no semantic colour, and 13 of the 30 embedded
  themes shipped with `success == danger` — added and removed lines the same
  colour, in Dark+, Light+, Solarized, Monokai and nine others. Contrast was
  checked; distinctness was not.
- **`warning` and `conflict` get no hue rule at all.** Measured over the bank,
  blocking on them would reject 42.9% and 34.2% respectively. GitHub Dark calls
  "modified" blue, which is GitHub's own convention and none of our business.

**Re-measure before changing any threshold.** `crawl.py remap` re-maps the whole
bank offline in seconds, and `map_seeds.py::report()` must agree with the
validator — when it did not, 71 themes were served that the client refused.

### Two lists that must not drift

`BUILT_IN_THEMES` (renderer, a `const` tuple so `BuiltInTheme` is a literal
union) and `BUILT_IN_THEME_IDS` (`src/main/theme-validate.ts`, so the validator
can refuse an id that shadows a built-in) are the same 32 ids in two places,
because the renderer and the main process are built separately. `ThemeId` itself
is `string`: an installed id arrives at runtime and cannot be in a compile-time
union. `token-discipline.test.ts` checks both lists against the `[data-theme]`
blocks in `tokens.css`, which is what makes the duplication safe.

## User
Victor Quilgars (VictorQuilgars on GitHub). French speaker; **the shipped UI is
English-only** since `v1.24.0` / `ext-v1.22.0` — `translations.ts` still carries a French
map, but no product selects it, and any new French string in the UI is a bug.
Commit messages, changelogs and release notes are in English.
