// The TUI's palette, and the only place a colour may be written.
//
// Ink takes real colour values, not CSS variables, so the terminal app cannot
// read `tokens.css` the way both other products do. That is a constraint; what
// was a bug is that the values were then scattered — 63 literals across five
// files, 24 distinct — so nothing could be changed without finding all of them,
// and nothing could tell you when a change had been missed.
//
// It had been missed three times: the splash screen, three surfaces in dfb01d3,
// and this. So the fix is not one more pass by hand, it is this file plus
// `test/colour-table.test.tsx`, which fails on a colour literal written
// anywhere else in `src/`.
//
// ⚠️ The values below are still the pre-migration palette (#0d1117, #3fb950,
// #f85149, #58a6ff — the desktop's before the seeds moved). Bringing them onto
// the current seeds is a VISIBLE change and is deliberately not part of the
// move: it is one edit in one file now, which is the point.
export const THEME = {
  // ── Chrome ──
  bg: '#0d1117',        // the canvas the terminal is painted to
  surface: '#161b22',
  border: '#30363d',
  title: '#3fb950',
  num: '#f85149',       // the panel's hotkey number
  menu: '#6e7681',
  menuKey: '#c9d1d9',   // the brighter first letter of a menu word
  menuOn: '#58a6ff',    // the accent, on what is active
  text: '#c9d1d9',
  dim: '#6e7681',
  muted: '#8b949e',     // dimmer than text, brighter than dim: a fact, not a label
  selBg: '#1f3a5f',
  onSelected: '#ffffff',// text on the selected row, whatever colour it would be

  // ── What a change is ──
  added: '#3fb950',
  removed: '#f85149',
  modified: '#d29922',
  renamed: '#d2a8ff',
  wip: '#d29922',       // the uncommitted node, and its row
  hunk: '#58a6ff',      // a @@ header in a diff

  // ── What a ref is ──
  branch: '#58a6ff',
  branchCurrent: '#3fb950',
  remote: '#6e7681',
  tag: '#d2a8ff',
  head: '#f0e68c',      // detached HEAD, which is neither a branch nor a tag
  stash: '#d29922',
}

/**
 * The graph's lanes, in the order they are handed out.
 *
 * Ten, like the desktop's `--lane-1…10` — the same count on purpose, so a
 * repository that draws eleven branches wraps at the same place in both.
 */
export const LANES = [
  '#2dd4bf', // teal
  '#4d9de0', // blue
  '#9b59b6', // purple
  '#e879f9', // fuchsia
  '#22d3ee', // cyan
  '#818cf8', // indigo
  '#a78bfa', // lavender
  '#34d399', // emerald
  '#60a5fa', // cornflower
  '#f472b6', // pink
]
