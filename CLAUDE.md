# Git GUI — Context for Claude

## Overview
Electron + React + TypeScript desktop Git client, inspired by GitKraken.
Build system: **electron-vite**. Run with `npm run dev`, package with `npm run package`.

## Architecture

### Process model
```
Main process   src/main/index.ts          IPC handlers, settings, AI calls
               src/main/git-service.ts    All git operations (simple-git)
               src/main/recent-repos.ts   Recent repos persistence

Preload        src/preload/index.ts       contextBridge — exposes window.gitAPI

Renderer       src/renderer/src/App.tsx   Root component, all state & handlers
               src/renderer/src/components/...
```

### IPC pattern
- Main: `ipcMain.handle('namespace:action', async (_event, ...args) => { ... })`
- Preload: `actionName: (...args) => ipcRenderer.invoke('namespace:action', ...args)`
- Renderer: `window.gitAPI.actionName(...args)`

Adding a new IPC endpoint requires changes to **all three files**.

## Key files

| File | Role |
|------|------|
| `src/main/git-service.ts` | GitService class wrapping simple-git. All git ops live here. |
| `src/main/index.ts` | IPC handlers wired to GitService + settings + AI providers |
| `src/preload/index.ts` | Typed bridge — every entry here is a callable on `window.gitAPI` |
| `src/renderer/src/App.tsx` | Single root component, holds all app state and handlers |
| `src/renderer/src/types.ts` | Shared types: CommitNode, BranchInfo, FileChange, WorkingChanges |

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
Shows "Aucun remote configuré" and hides Push button when repo has no remote.
Errors shown inline in the modal (not disappearing toast).

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
Source: `resources/icon.svg` — V-shaped git graph (Victor's initial), green + blue.
Built: `resources/icon.icns` — generated with `rsvg-convert` + `iconutil`.
To regenerate after editing the SVG:
```bash
rm -rf resources/icon.iconset && mkdir resources/icon.iconset
for size in 16 32 64 128 256 512 1024; do
  rsvg-convert -w $size -h $size resources/icon.svg -o resources/icon.iconset/icon_${size}x${size}.png
done
cp resources/icon.iconset/icon_32x32.png   resources/icon.iconset/icon_16x16@2x.png
cp resources/icon.iconset/icon_64x64.png   resources/icon.iconset/icon_32x32@2x.png
cp resources/icon.iconset/icon_256x256.png resources/icon.iconset/icon_128x128@2x.png
cp resources/icon.iconset/icon_512x512.png resources/icon.iconset/icon_256x256@2x.png
cp resources/icon.iconset/icon_1024x1024.png resources/icon.iconset/icon_512x512@2x.png
iconutil -c icns resources/icon.iconset -o resources/icon.icns
```

## Style conventions
- Dark theme: background `#0d1117`, surface `#161b22`, border `#21262d` / `#30363d`
- Accent colors: green `#3fb950`, blue `#58a6ff`, red `#f85149`
- CSS modules per component, BEM-like class names (`component-element--modifier`)
- No global CSS framework

## User
Victor Quilgars (VictorQuilgars on GitHub). French speaker, app UI is in French.
Commit messages must be in English (enforced in the AI prompt).
