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

A journey is `{ name, run({ page, expect, fixture, snapshot }) }`. They run in
order, in one window; a failure is reported and the next still runs. Screenshots
land in `out/` (ignored); when `references/<name>.png` exists it is compared
with a half-percent tolerance.

## Library

`lib/cdp.js` the protocol client (evaluate, wait, click, right-click, menu row,
type, key, viewport, screenshot), `lib/app.js` the launch on a fresh profile,
`lib/fixture.js` two scratch repositories per run, `lib/png.js` a decoder and a
comparison with no dependency, `lib/assert.js` `expect`.
