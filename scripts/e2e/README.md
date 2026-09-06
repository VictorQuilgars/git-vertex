# End-to-end suite

The built desktop app, driven over the Chrome DevTools Protocol on a throwaway
profile, through the journeys the September 2026 audit reproduced by hand — and
the ones the sessions per repository added.

```bash
npm run e2e              # every journey; builds if out/ is missing
npm run e2e -- --build   # rebuild first
npm run e2e -- --update  # record the screenshots as references
```

No display is needed: on Linux the runner re-runs itself under `xvfb-run`
(`apt-get install -y xvfb`). On a desktop the window opens, is driven, and
closes; the profile is its own (`--user-data-dir`), so the app you may have
open is neither reused nor touched.

## Journeys

| File | What it walks |
|---|---|
| `01-open-repo` | the welcome, a repository, one answer per IPC domain, a refused `file:` link |
| `02-draft-survives` | a commit message written, a commit selected, the message still there |
| `03-compare-tabs` | two comparisons opened, each tab shows its own |
| `04-confirm-enter` | a destructive confirmation opens on Cancel; Enter deletes nothing |
| `05-window-sizes` | 900×600 and 1300×800: the search, Pull, the Working changes row within the window; the details across the centre; screenshots |
| `06-sessions` | two repositories: a call bound to the hidden one, a commit made while hidden shown at once on return, a closed tab's repository answering nothing |
| `07-stage-commit` | the dirty file staged, the button greyed until a message; a commit refused by a hook keeps the message and the draft; the same click accepted counts one more commit, empties the form and the tree |
| `08-load-more` | a repository twelve hundred commits deep: the status bar says 500 loaded and offers 500 more; two clicks load the rest and the offer goes |
| `09-settings-search` | Ctrl+, opens the settings; a search narrows the sections and the open one is among those that answer; a query nothing answers says so; Delete on the focused tab closes it |
| `10-keyboard` | the tab strip by Left, End and Delete; a commit's menu walked with Down into the rebase editor, the graph's selection still under it; the editor sums up its plan and follows a squash; Cancel leaves HEAD alone |
| `11-amend-disarm` | amend ticked shows HEAD's message; a commit made from a terminal unticks it and the ordinary draft is back; ticked again it is armed for the new HEAD |
| `12-restart` | a draft typed, the app closed and opened again on the same profile, the repository reopened, the draft still there |
| `13-search-reach` | the extended search on the deep repository, a hit 800 commits back: the page grows to a thousand, the status bar says so, the hit is selected and counted |

A journey is `{ name, run({ page, expect, fixture, snapshot, relaunch }) }`. They
run in order, in one window — `relaunch()` closes the app and opens it again on
the same profile, and gives the new page back; a failure is reported and the
next still runs, and a pass on the second go says what the first one tripped on.
Screenshots land in `out/` (ignored); when `references/<name>.png` exists it is
compared with a half-percent tolerance.

## Library

`lib/cdp.js` the protocol client (evaluate, wait, click — which refuses a
disabled element rather than swallow the click — right-click, menu row, type,
key with modifiers, viewport, screenshot), `lib/app.js` the launch on a fresh
profile and a stop that waits for the process, `lib/fixture.js` three scratch
repositories per run — one of them twelve hundred commits deep, written by
fast-import — `lib/png.js` a decoder and a comparison with no dependency,
`lib/assert.js` `expect`.
