import {
  SEED_KEYS, BUILT_IN_THEME_IDS, validateTheme, hexToRgb, luminance,
  type SeedKey, type ValidationResult,
} from '../../../../main/theme-validate'

// The builder's model (#242): a draft is a name, a licence and the 24 seeds,
// and everything the app draws derives from those — there is no "colour of
// the commit button" to set, only the accent it derives from. The pure parts
// live here so they can be tested without a DOM.

export type Seeds = Record<SeedKey, string>
export const HEX = /^#[0-9A-Fa-f]{6}$/

/** The seeds by role, in the order the builder lists them. */
export const SEED_GROUPS: ReadonlyArray<{ id: 'surfaces' | 'text' | 'identity' | 'meaning' | 'lanes'; seeds: readonly SeedKey[] }> = [
  { id: 'surfaces', seeds: ['canvas', 'surface', 'sunken', 'border'] },
  { id: 'text', seeds: ['text', 'text-2', 'text-3'] },
  { id: 'identity', seeds: ['accent', 'agent', 'on-fill'] },
  { id: 'meaning', seeds: ['success', 'warning', 'danger', 'conflict'] },
  { id: 'lanes', seeds: SEED_KEYS.filter(k => k.startsWith('lane-')) },
]

export const LICENCES = ['MIT', 'CC0-1.0'] as const
export type Licence = typeof LICENCES[number]

export interface Draft { id: string; name: string; lic: Licence; seeds: Seeds }

/** The shape the bank serves, and the store installs — a draft becomes one of these. */
export interface DraftPayload {
  version: 1
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

/**
 * Read a theme's seeds off the stylesheet. A built-in lives in tokens.css and
 * an installed one in the rule SettingsContext injects; both are a
 * `[data-theme="id"]` rule, and the default's selector also names its id.
 */
export function seedsOfTheme(id: string, doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): Partial<Seeds> | null {
  if (!doc) return null
  const wanted = `[data-theme="${id}"]`
  const out: Partial<Seeds> = {}
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of Array.from(rules)) {
      if (!('selectorText' in rule) || !('style' in rule)) continue
      const r = rule as CSSStyleRule
      if (!r.selectorText.split(',').some(s => s.trim() === wanted)) continue
      for (const k of SEED_KEYS) {
        const v = r.style.getPropertyValue(`--seed-${k}`).trim()
        if (HEX.test(v)) out[k] = v.toUpperCase()
      }
    }
  }
  return Object.keys(out).length ? out : null
}

/** A theme is dark when its canvas is: the same reading the bank's index uses. */
export function isDarkCanvas(hex: string): boolean {
  return luminance(hexToRgb(hex)) < 0.5
}

/**
 * An id from a name: `mine-` and the name's letters. The prefix keeps it
 * clear of every built-in and, in practice, of the bank; the validator still
 * has the last word.
 */
export function slugId(name: string): string {
  const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
  return `mine-${slug || 'theme'}`
}

export function payloadFromDraft(d: Draft): DraftPayload {
  return {
    version: 1,
    id: d.id,
    name: d.name.trim() || 'My theme',
    dark: isDarkCanvas(d.seeds.canvas),
    lic: d.lic,
    src: 'local',
    srcVersion: '1',
    srcUrl: '',
    notice: `${d.name.trim() || 'My theme'} — made in Git Vertex, ${d.lic}`,
    seeds: d.seeds,
  }
}

/** The validator, with the built-in ids: a draft may not shadow one. */
export function validateDraft(payload: DraftPayload): ValidationResult {
  return validateTheme(payload, { builtIns: BUILT_IN_THEME_IDS })
}

// Longest names first, so `text-2` is not read as `text`.
const SEED_MENTION = new RegExp(`\\b(${[...SEED_KEYS].sort((a, b) => b.length - a.length).join('|')})\\b`, 'g')

/** Which seeds each of the validator's sentences is about, so the row can say so. */
export function errorsBySeed(errors: string[]): Partial<Record<SeedKey, string[]>> {
  const out: Partial<Record<SeedKey, string[]>> = {}
  for (const e of errors) {
    for (const m of e.matchAll(SEED_MENTION)) {
      const k = m[1] as SeedKey
      ;(out[k] ??= []).push(e)
    }
  }
  return out
}

export function serialize(payload: DraftPayload): string {
  return JSON.stringify(payload, null, 2)
}

/** A pasted theme file: the bank's shape, or at least its seeds. */
export function parseImport(text: string): { ok: true; name?: string; lic?: Licence; seeds: Partial<Seeds> } | { ok: false; why: string } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { ok: false, why: 'not JSON' } }
  if (typeof raw !== 'object' || raw === null) return { ok: false, why: 'not an object' }
  const o = raw as Record<string, unknown>
  const seedsIn = (typeof o.seeds === 'object' && o.seeds !== null ? o.seeds : o) as Record<string, unknown>
  const seeds: Partial<Seeds> = {}
  for (const k of SEED_KEYS) {
    const v = seedsIn[k]
    if (typeof v === 'string' && HEX.test(v)) seeds[k] = v.toUpperCase()
  }
  if (!Object.keys(seeds).length) return { ok: false, why: 'no seeds in it' }
  const name = typeof o.name === 'string' ? o.name : undefined
  const lic = (LICENCES as readonly string[]).includes(String(o.lic)) ? (o.lic as Licence) : undefined
  return { ok: true, name, lic, seeds }
}
