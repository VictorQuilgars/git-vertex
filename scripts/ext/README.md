# Driving the extension

A real VS Code, the extension loaded from source, the panel open — and a way to
read its DOM, click in it and photograph it. The counterpart of `scripts/e2e`,
which does the same for the desktop app.

```bash
node scripts/ext/drive.js --demo                      # a demo repository, built for the occasion
node scripts/ext/drive.js --repo /path/to/repo        # your own
node scripts/ext/drive.js --repo … --shot panel.png --maximize
node scripts/ext/drive.js --repo … --eval 'document.querySelectorAll(".cg-row").length'
node scripts/ext/drive.js --repo … --scenario scripts/ext/scenarios/branch-rows.js
node scripts/ext/drive.js --repo … --keep             # leave it open to poke at by hand
```

`--eval` runs in the **extension's own frame**, not in the editor's.

## What it is for

Three things could be checked before it, and none of them was the product:

| | what it runs | what it cannot see |
|---|---|---|
| `npm test` | the shared renderer, jsdom | VS Code, the host, git |
| `vscode-extension/ npm run test:nodisplay` | the extension's suites with `vscode` stubbed | everything that touches the real API — most of `GitVertexHost` |
| `scripts/e2e/compact-panel.cjs` | the webview bundle in plain Electron | the host: `window.gitAPI` is a fixture |

So the half of the product that only exists inside VS Code — the host's `case`
arms, the commands, the editor decorations, the panel talking to git in a real
repository — was checked by hand or not at all. `Sidebar.rowActions.test.tsx`
passed while a branch three commits behind offered no *Pull* at all: the unit
test renders the component, and the wiring that fills it lives elsewhere.

## Nothing of yours is touched

The editor is launched on a **throwaway profile and an empty extensions
directory**, both deleted afterwards (`--keep` keeps them and says where). The
VS Code you have open is neither reused nor disturbed, and no extension of
yours runs beside ours.

## Four things that make it work, and each cost an hour

- **A webview is two iframes.** The debugger lists the editor's
  `vscode-webview://…` container; the extension's HTML is one frame further in,
  reached through an isolated world. Read the container's document and you will
  conclude, wrongly, that the panel did not load.
- **The profile path must be short.** VS Code opens a Unix socket inside the
  user-data directory, and a Unix socket path is capped at 103 characters. A
  profile under a deep scratchpad makes the editor exit at startup with
  `EINVAL` on a `listen()` nobody is watching.
- **A letter needs its key code.** `Page.press` in the desktop harness sends
  `windowsVirtualKeyCode: 0` for anything outside its table of named keys. VS
  Code resolves a keybinding from the code, so `Cmd+Shift+P` with a code of 0
  is not a chord: the palette never opens, silently, and every command after it
  does nothing. `shortcut()` here builds the event properly.
- **The palette needs the workbench to have the focus.** Once the panel is
  open the focus is inside the webview's iframe and a keystroke aimed at the
  workbench never arrives. Every command this harness runs goes first;
  maximising, which has to happen after, goes through the editor's own button.

## Scenarios

A scenario is a module exporting `async ({ workbench, panel, port, stop })`.
`panel` is the extension's frame: `eval`, `until`, `click`, `text`.

| File | What it reads |
|---|---|
| `branch-rows.js` | every branch row's state and the acts it offers, checked against the rules |
