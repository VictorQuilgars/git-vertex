// Validation for a downloaded theme — and the colour maths it needs.
//
// This file is deliberately free of `electron` and of `vscode`: it is imported
// by the desktop main process AND bundled into the extension host by esbuild,
// because a rule that only one of the two products enforces is not a rule.
// It is also why the maths is here rather than in the renderer — the renderer
// is sandboxed, shared between both products, and must never be the thing
// deciding whether a served payload is safe.
//
// The governing assumption: THE SERVER IS NOT TRUSTED. These seeds end up in a
// stylesheet, so a value like `red; } body { display: none` is a CSS injection
// into the app's own document. Rule 1 is the only thing standing between the
// two, which is why it rejects rather than sanitises — there is no safe repair
// of a value that was never a colour.
//
// Reference implementation of the conversions: docs-private/themes/colour.py.

/** The 24 seeds `tokens.css` declares. Authoritative list: its `:root` block. */
export const SEED_KEYS = [
  'canvas', 'surface', 'sunken', 'border',
  'text', 'text-2', 'text-3',
  'accent', 'agent', 'success', 'warning', 'danger', 'conflict', 'on-fill',
  'lane-1', 'lane-2', 'lane-3', 'lane-4', 'lane-5',
  'lane-6', 'lane-7', 'lane-8', 'lane-9', 'lane-10',
] as const

export type SeedKey = (typeof SEED_KEYS)[number]
export type Seeds = Record<SeedKey, string>

/**
 * The 32 themes that live in `tokens.css`, by id.
 *
 * Duplicated from `BUILT_IN_THEMES` in the renderer's SettingsContext, and
 * deliberately: that one has to be a `const` tuple for `BuiltInTheme` to be a
 * literal union, and the renderer is built separately from the main process, so
 * neither can import the other without fighting electron-vite. The duplication
 * is safe because `token-discipline.test.ts` fails when this list, that one and
 * the `[data-theme]` blocks in tokens.css stop agreeing — which is the same
 * mechanism that already guards the other two against each other.
 *
 * Used for one thing: an installed theme may not take a built-in's id, or it
 * would shadow a theme the user cannot then get back.
 */
export const BUILT_IN_THEME_IDS: readonly string[] = [
  'aqua-dark', 'aqua-light',
  'one-dark-pro', 'catppuccin-frappe', 'gitpod-dark', 'dracula-theme',
  'github-dark', 'monokai-dimmed', 'monokai', 'vscode-dark',
  'vscode-red', 'kimbie-dark', 'solarized-dark', 'abyss',
  'tomorrow-night-blue', 'gruvbox-dark-hard', 'ayu-dark', 'atom-one-dark',
  'tokyo-night', 'rose-pine', 'night-owl', 'community-material-theme',
  'powershell-ise', 'catppuccin-latte', 'gitpod-light', 'github-light',
  'quiet-light', 'vscode-light', 'solarized-light', 'gruvbox-light-hard',
  'ayu-light', 'tokyo-night-light',
]

export interface ThemePayload {
  version: number
  id: string
  name: string
  dark: boolean
  lic: string
  src: string
  srcVersion: string
  srcUrl: string
  notice: string
  seeds: Seeds
}

/** Six-digit hex only. Not 3-digit, not 8-digit, not `rgb()`, not a keyword. */
const HEX = /^#[0-9A-Fa-f]{6}$/
const THEME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

// ── Colour ───────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

/** WCAG relative luminance. */
export function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two hex colours, 1..21. */
export function contrast(aHex: string, bHex: string): number {
  let x = luminance(hexToRgb(aHex))
  let y = luminance(hexToRgb(bHex))
  if (x < y) [x, y] = [y, x]
  return (x + 0.05) / (y + 0.05)
}

export interface Oklch { L: number; C: number; H: number }

/** sRGB hex → OKLCH. H in degrees, 0..360. */
export function oklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

/** Shortest angular distance between two hues, 0..180. */
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

// ── The rules ────────────────────────────────────────────────────────────────

/** Contrast pairs, and the ratio each must clear. Mirrors map_seeds.py::report(). */
const CONTRAST_CHECKS: Array<[SeedKey, SeedKey]> = [
  ['text', 'canvas'],
  ['text-2', 'canvas'],
  ['text-3', 'sunken'],
  ['accent', 'canvas'],
  ['on-fill', 'accent'],
]
const MIN_CONTRAST = 4.5

const SEMANTIC_KEYS: SeedKey[] = ['success', 'warning', 'danger', 'conflict']

// Only success and danger are policed on hue, and the numbers are why. Measured
// over the bank, blocking on `warning` would reject 42.9% of it and `conflict`
// 34.2% — GitHub Dark calls "modified" blue, which is GitHub's own convention
// and none of our business. Green-added and red-removed, by contrast, are close
// to universal, and getting them wrong is a correctness defect: a diff where
// the addition and the deletion read the same way is unusable.
const PLAUSIBLE_HUE: Partial<Record<SeedKey, number>> = { success: 157.2, danger: 26.0 }
const MAX_HUE_GAP = 60
const MIN_CHROMA = 0.05

export interface ValidationResult {
  ok: boolean
  /** Human-readable, one per broken rule. Shown to the user, so keep them plain. */
  errors: string[]
}

/**
 * Checks a payload that claims to be a theme. Rejects; never repairs.
 *
 * Run on install AND on read — a file in `userData` can be edited by hand or
 * corrupted on disk after it was installed, and the read path is the one that
 * feeds the stylesheet.
 */
export function validateTheme(
  payload: unknown,
  opts: { builtIns: readonly string[] } = { builtIns: [] },
): ValidationResult {
  const errors: string[] = []
  const fail = (m: string): number => errors.push(m)

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, errors: ['not an object'] }
  }
  const t = payload as Partial<ThemePayload>

  // ── 2. Id ─────────────────────────────────────────────────────────────────
  // Checked before the seeds because the id is also a FILENAME: it is what the
  // store writes to `userData/themes/{id}.json`. A `..` or a `/` in it is a
  // path traversal, so this regex is doing two jobs.
  if (typeof t.id !== 'string' || !THEME_ID.test(t.id)) {
    fail(`invalid theme id: ${JSON.stringify(t.id)}`)
  } else if (opts.builtIns.includes(t.id)) {
    fail(`id "${t.id}" collides with a built-in theme`)
  }

  // ── 1. Shape ──────────────────────────────────────────────────────────────
  const seeds = t.seeds
  if (typeof seeds !== 'object' || seeds === null) {
    fail('seeds missing')
    return { ok: false, errors }
  }
  const got = Object.keys(seeds)
  const missing = SEED_KEYS.filter(k => !got.includes(k))
  const extra = got.filter(k => !(SEED_KEYS as readonly string[]).includes(k))
  if (missing.length) fail(`seeds missing: ${missing.join(', ')}`)
  if (extra.length) fail(`unexpected seeds: ${extra.join(', ')}`)
  const malformed = SEED_KEYS.filter(k => {
    const v = (seeds as Record<string, unknown>)[k]
    return v !== undefined && (typeof v !== 'string' || !HEX.test(v))
  })
  if (malformed.length) {
    fail(`not a 6-digit hex colour: ${malformed.map(k => `${k}=${JSON.stringify((seeds as Record<string, unknown>)[k])}`).join(', ')}`)
  }
  // Everything below reads colours, so stop if any of them is not one.
  if (missing.length || malformed.length) return { ok: false, errors }

  const s = seeds as Seeds

  // ── 3. Contrast ───────────────────────────────────────────────────────────
  for (const [fg, bg] of CONTRAST_CHECKS) {
    const ratio = contrast(s[fg], s[bg])
    if (ratio < MIN_CONTRAST) {
      fail(`${fg} on ${bg} is ${ratio.toFixed(2)}:1, below ${MIN_CONTRAST}:1`)
    }
  }

  // ── 4. Semantic distinctness ──────────────────────────────────────────────
  // The rule that matters, and the one that was missing. The first version of
  // the generator fell back to the accent when a theme declared no semantic
  // key, and 13 of the 30 embedded themes shipped with success == danger —
  // added and removed lines the same colour, in Dark+, Light+, Solarized,
  // Monokai and nine others. Contrast was checked; distinctness was not.
  const sem = SEMANTIC_KEYS.map(k => s[k].toUpperCase())
  if (new Set(sem).size < SEMANTIC_KEYS.length) {
    const dup = SEMANTIC_KEYS.filter(
      (_, i) => sem.indexOf(sem[i]) !== sem.lastIndexOf(sem[i]),
    )
    fail(`these mean different things but are the same colour: ${dup.join(', ')}`)
  }

  // ── 5. success and danger must be plausible ───────────────────────────────
  for (const k of SEMANTIC_KEYS) {
    const want = PLAUSIBLE_HUE[k]
    if (want === undefined) continue
    const { C, H } = oklch(s[k])
    const gap = hueGap(H, want)
    if (gap > MAX_HUE_GAP) {
      fail(`${k} is ${Math.round(gap)}° from the hue it has to mean`)
    } else if (C < MIN_CHROMA) {
      fail(`${k} is almost colourless (chroma ${C.toFixed(3)})`)
    }
  }

  return { ok: errors.length === 0, errors }
}
