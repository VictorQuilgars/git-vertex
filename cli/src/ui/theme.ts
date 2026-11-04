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
// The palette is now the desktop's (#76): `SEEDS` is a copy of the 24 seeds of
// the default theme's block in `src/renderer/src/tokens.css`, and the test
// fails the day the two differ — the copy is the constraint, the test is what
// makes it safe. Every role below is a seed, or the same `color-mix(in oklab, …)`
// the desktop derives for that role, computed here because a terminal has no
// `color-mix()`.

/** The default theme's seeds — `:root` in `tokens.css`, key for key. */
export const SEEDS = {
  canvas: '#0E1116',
  surface: '#151A21',
  sunken: '#1C222C',
  border: '#2B3341',
  text: '#E8ECF1',
  'text-2': '#A5AEBD',
  'text-3': '#808B9B',
  accent: '#3FD8C2',
  agent: '#9B8FF5',
  success: '#5FC98F',
  warning: '#E0A25C',
  danger: '#F0645C',
  conflict: '#E87DB0',
  'on-fill': '#0E1116',
  'lane-1': '#3FD8C2',
  'lane-2': '#54C8E8',
  'lane-3': '#7FB4F5',
  'lane-4': '#A99FF0',
  'lane-5': '#D189D9',
  'lane-6': '#EE7FAE',
  'lane-7': '#F0937A',
  'lane-8': '#D9A85C',
  'lane-9': '#AEBE5E',
  'lane-10': '#6FCE8C',
} as const

// ── color-mix(in oklab, a p%, b), as the browser resolves it ─────────────────
// Oklab with the matrices CSS Color 4 uses. Opaque colours only:
// every seed is one, and a terminal cell has no alpha.

type Lab = [number, number, number]

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

function hexToOklab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => toLinear(v / 255))
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}

function oklabToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ]
  return '#' + rgb
    .map(c => Math.round(Math.min(1, Math.max(0, fromLinear(c))) * 255))
    .map(v => v.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

/** `color-mix(in oklab, a p%, b)` — `p` is a's share, from 0 to 100. */
export function mixOklab(a: string, p: number, b: string): string {
  const [x, y] = [hexToOklab(a), hexToOklab(b)]
  const t = p / 100
  return oklabToHex([0, 1, 2].map(i => x[i] * t + y[i] * (1 - t)) as Lab)
}

/**
 * Whether the terminal takes 24-bit colour. Ink downsamples a hex to whatever
 * the terminal accepts — truecolor when `COLORTERM` says so, 256 colours most
 * often, 16 on a bare one — and the dark end of these themes does not survive
 * that: `canvas → surface → sunken` spans a few percent of luminance and lands
 * on one cell at 256 colours. So the TUI paints no surface and no well — only
 * the canvas — and widens the one background it does paint, the selected row,
 * where the depth cannot be trusted.
 */
export function isTruecolor(env: Record<string, string | undefined> = process.env): boolean {
  return /^(truecolor|24bit)$/i.test(env.COLORTERM ?? '')
}

const S = SEEDS

export const THEME = {
  // ── Chrome ──
  bg: S.canvas,          // the canvas the terminal is painted to
  border: S.border,
  // A panel's title at rest. It was the old palette's green, beside a blue
  // for the focused panel; the current success and accent are both
  // aqua-greens, so rest is the secondary text and focus alone wears the
  // accent — as the desktop's own tabs do.
  title: S['text-2'],
  num: S.danger,         // the panel's hotkey number
  menu: S['text-3'],
  menuKey: S.text,       // the brighter first letter of a menu word
  menuOn: S.accent,      // the accent, on what is active
  text: S.text,
  dim: S['text-3'],
  muted: S['text-2'],    // dimmer than text, brighter than dim: a fact, not a label
  // --surface-selected; twice the accent where the terminal will round it.
  selBg: mixOklab(S.sunken, isTruecolor() ? 80 : 60, S.accent),
  onSelected: S.text,    // text on the selected row, whatever colour it would be

  // ── What a change is ──
  added: S.success,
  removed: S.danger,
  modified: S.warning,
  renamed: mixOklab(S.agent, 80, S.text),   // --purple-text
  wip: S.warning,        // the uncommitted node, and its row
  hunk: S.accent,        // a @@ header in a diff

  // ── What a ref is ──
  branch: S.accent,
  branchCurrent: S.success,
  remote: S['text-3'],
  tag: mixOklab(S.agent, 80, S.text),       // --purple-text, as the graph's tag chip
  head: mixOklab(S.warning, 74, S.text),    // --ref-head: detached HEAD, neither a branch nor a tag
  stash: S.warning,
}

/**
 * The graph's lanes, in the order they are handed out — the desktop's
 * `--seed-lane-1…10`, the same ten in the same order, so a repository that
 * draws eleven branches wraps at the same place, in the same colours, in both.
 */
export const LANES = [
  S['lane-1'], S['lane-2'], S['lane-3'], S['lane-4'], S['lane-5'],
  S['lane-6'], S['lane-7'], S['lane-8'], S['lane-9'], S['lane-10'],
]
