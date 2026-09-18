import { SEED_KEYS } from '../../../../main/theme-validate'

// The inspect mode (#242): click anything in the window and learn which seed
// colours it — and the other way round, hover a seed and see every place in
// the window it paints. Generic on purpose — no component is annotated. The
// rules that apply to an element are read off the stylesheets, the `var(--…)`
// they use on colour properties are collected, and each token is followed
// through the derived table on <html> until it reaches a `--seed-*`.

/** Derived token → its raw value, as tokens.css wrote it. Read once per inspection. */
export type TokenMap = Record<string, string>

const VAR_REF = /var\(\s*(--[a-z0-9-]+)/g

/** Traverse active grouping rules (media, supports, layers), not just the top level. */
function styleRules(rules: CSSRuleList, doc: Document): CSSStyleRule[] {
  const out: CSSStyleRule[] = []
  for (const rule of Array.from(rules)) {
    if ('selectorText' in rule && 'style' in rule) out.push(rule as CSSStyleRule)
    else if ('cssRules' in rule) {
      if (rule.type === 4 && doc.defaultView?.matchMedia &&
          !doc.defaultView.matchMedia((rule as CSSMediaRule).conditionText).matches) continue
      if (rule.type === 12 && doc.defaultView?.CSS?.supports &&
          !doc.defaultView.CSS.supports((rule as CSSSupportsRule).conditionText)) continue
      out.push(...styleRules((rule as CSSGroupingRule).cssRules, doc))
    }
  }
  return out
}

/** Every style rule of every readable sheet, flattened. */
function allRules(doc: Document): CSSStyleRule[] {
  const out: CSSStyleRule[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    out.push(...styleRules(rules, doc))
  }
  return out
}

/**
 * The declarations of a rule, as authored. Off `cssText` rather than
 * `item(i)`: a shorthand written with a variable — `background:
 * var(--surface)`, `border: 1px solid var(--border-default)` — is enumerated
 * as its longhands, and those serialise EMPTY until the variable is
 * substituted. Read that way, every shorthand in the app was invisible, and
 * the body answered "text" and never "canvas".
 */
function declarations(style: CSSStyleDeclaration): [string, string][] {
  const out: [string, string][] = []
  for (const m of style.cssText.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) out.push([m[1], m[2]])
  return out
}

/**
 * The custom properties <html> resolves right now: `:root`'s, and every
 * block whose selector the element matches — the layout's
 * `[data-layout="blocks"]` redefines `--bg-shell`, and a map that read
 * `:root` alone never followed it.
 */
export function readTokenMap(doc: Document = document): TokenMap {
  const map: TokenMap = {}
  const html = doc.documentElement
  for (const r of allRules(doc)) {
    let hit = false
    try { hit = html.matches(r.selectorText) } catch { continue }
    if (!hit) continue
    for (const [name, value] of declarations(r.style)) if (name.startsWith('--')) map[name] = value.trim()
  }
  return map
}

/**
 * The least part of a colour a seed must make to be said to paint it: a
 * third. A derived token is often one seed tinted toward another —
 * `--bg-frame` is the canvas and the surface with a tenth of the text,
 * `--accent-emphasis` the accent with a seventh of it — and naming every seed
 * in the mix made "text" answer for the whole window's frame, every branch
 * chip and every pressed button. Measured over tokens.css, the tints sit at
 * 26% and below; the mixes whose second colour shows — a danger block's red
 * border (38%), the agent's accent (38%), a merged PR (34%) — above.
 */
export const MIN_SHARE = 1 / 3

type Shares = Record<string, number>
/** The part of a mix no seed makes: a literal colour. `transparent` makes none at all. */
const LITERAL = '#'

/** `a, b, c` → [a, b, c], at the top level only. */
function splitTop(text: string, sep: ',' | ' '): string[] {
  const out: string[] = []
  let depth = 0, from = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === sep && depth === 0) { out.push(text.slice(from, i)); from = i + 1 }
  }
  out.push(text.slice(from))
  return out.map(p => p.trim()).filter(Boolean)
}

/** A percentage, written or behind a token (`var(--alpha-faint)` is `8%`). */
function percentOf(text: string, map: TokenMap, depth = 0): number | null {
  const lit = text.match(/^(\d+(?:\.\d+)?)%$/)
  if (lit) return Number(lit[1]) / 100
  const ref = text.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/)
  return ref && depth < 8 && map[ref[1]] ? percentOf(map[ref[1]].trim(), map, depth + 1) : null
}

/**
 * How much of a colour each seed makes: a seed is all of itself, a token is
 * what it is written as, and `color-mix()` weighs its two stops the way CSS
 * does — a missing percentage is the rest, two that do not add up are scaled.
 * `transparent` weighs nothing: `color-mix(X 8%, transparent)` is X, fainter.
 */
function colourShares(expr: string, map: TokenMap, seen: Set<string>): Shares | null {
  const text = expr.trim()
  const ref = text.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,.*)?\)$/)
  if (ref) return seedShares(ref[1], map, seen)
  const mix = text.match(/^color-mix\((.*)\)$/s)
  if (mix) {
    const [, ...stops] = splitTop(mix[1], ',')
    if (stops.length !== 2) return null
    const parsed = stops.map(stop => {
      const words = splitTop(stop, ' ')
      const pct = words.length > 1 ? percentOf(words[words.length - 1], map) : null
      const colour = pct === null ? stop : words.slice(0, -1).join(' ')
      return { pct, shares: colourShares(colour, map, seen) }
    })
    let [a, b] = parsed.map(p => p.pct)
    if (a === null && b === null) { a = 0.5; b = 0.5 } else if (a === null) { a = 1 - b! } else if (b === null) { b = 1 - a }
    const weights = [a, b].map((w, i) => (parsed[i].shares ? Math.max(0, w!) : 0))
    const total = weights[0] + weights[1]
    if (total <= 0) return {}
    const out: Shares = {}
    parsed.forEach((p, i) => {
      for (const [k, v] of Object.entries(p.shares ?? {})) out[k] = (out[k] ?? 0) + v * weights[i] / total
    })
    return out
  }
  if (/^transparent$/i.test(text)) return null
  if (/^(#[0-9a-f]{3,8}|(rgb|hsl|oklab|oklch|lab|lch)a?\(.*\)|[a-z]+)$/i.test(text) && !/^(inherit|initial|unset|currentcolor)$/i.test(text)) return { [LITERAL]: 1 }
  return {}
}

/** How much of a token's colour each seed makes — itself, when it is one. */
export function seedShares(token: string, map: TokenMap, seen: Set<string> = new Set()): Shares {
  if (token.startsWith('--seed-')) {
    const seed = token.slice('--seed-'.length)
    return (SEED_KEYS as readonly string[]).includes(seed) ? { [seed]: 1 } : {}
  }
  if (seen.has(token)) return {}
  const value = map[token]
  if (!value) return {}
  return colourShares(value, map, new Set(seen).add(token)) ?? {}
}

/** The seeds that paint a share of a colour worth naming, the largest first. */
function paintingSeeds(shares: Shares): string[] {
  return Object.entries(shares)
    .filter(([k, v]) => k !== LITERAL && v >= MIN_SHARE - 1e-9)
    .sort((x, y) => y[1] - x[1])
    .map(([k]) => k)
}

/** The seeds a token is made of — itself, when it is one — leaving out the ones it is only tinted with. */
export function tokenSeeds(token: string, map: TokenMap): string[] {
  return paintingSeeds(seedShares(token, map))
}

/**
 * The tokens a colour value names, each with its weight in the colour: a
 * `var()` standing alone is all of it, one inside a component's own
 * `color-mix()` its stop's part. A percentage behind a token is not a colour.
 */
function tokenWeights(value: string, map: TokenMap): [string, number][] {
  const out: [string, number][] = []
  const walk = (expr: string, weight: number) => {
    const text = expr.trim()
    const mix = text.match(/^color-mix\((.*)\)$/s)
    if (mix) {
      const [, ...stops] = splitTop(mix[1], ',')
      if (stops.length !== 2) return
      const parsed = stops.map(stop => {
        const words = splitTop(stop, ' ')
        const pct = words.length > 1 ? percentOf(words[words.length - 1], map) : null
        const colour = pct === null ? stop : words.slice(0, -1).join(' ')
        return { pct, colour, weightless: /^transparent$/i.test(colour.trim()) }
      })
      let [a, b] = parsed.map(p => p.pct)
      if (a === null && b === null) { a = 0.5; b = 0.5 } else if (a === null) { a = 1 - b! } else if (b === null) { b = 1 - a }
      const weights = [a, b].map((w, i) => (parsed[i].weightless ? 0 : Math.max(0, w!)))
      const total = weights[0] + weights[1]
      if (total > 0) parsed.forEach((p, i) => walk(p.colour, weight * weights[i] / total))
      return
    }
    const ref = text.match(/^var\(\s*(--[a-z0-9-]+)/)
    if (ref && /^var\(.*\)$/s.test(text)) { out.push([ref[1], weight]); return }
    // A list or a shorthand — `1px solid var(--border)`, two shadows — is
    // several colours side by side: each counts whole.
    const parts = splitTop(text, ',').flatMap(p => splitTop(p, ' '))
    if (parts.length > 1) for (const p of parts) walk(p, weight)
  }
  walk(value, 1)
  return out
}

/** What a colour does on an element. A `background` is a fill; a `color` is its ink. */
export type PaintRole = 'fill' | 'ink' | 'border' | 'outline' | 'shadow' | 'icon'

// The properties that paint, by role. Radii and widths do not.
const ROLES: [RegExp, PaintRole][] = [
  [/^background(-color)?$/, 'fill'],
  [/^(color|caret-color|text-decoration(-color)?)$/, 'ink'],
  [/^border(-(top|right|bottom|left|inline|block)(-(start|end))?)?(-color)?$/, 'border'],
  [/^outline(-color)?$/, 'outline'],
  [/^box-shadow$/, 'shadow'],
  [/^(fill|stroke)$/, 'icon'],
]
export function roleOf(property: string): PaintRole | null {
  for (const [re, role] of ROLES) if (re.test(property)) return role
  return null
}

export interface InspectedToken {
  token: string
  property: string
  role: PaintRole
  seeds: string[]
  /** Read off an ancestor: the ink a text inherits, the fill behind a box that paints none. */
  inherited?: boolean
}
export interface Inspection {
  /** What the element says it is: its label, its title, its text, or its tag. */
  name: string
  /** Its classes, which is how a stylesheet names it. */
  id: string
  /** The element that answers — the one to outline. The nearest that paints, or the one clicked. */
  el: Element
  tokens: InspectedToken[]
}

/**
 * The tokens a declaration block paints with, one entry per token and role,
 * each naming the seeds that make a real share of the colour where it is
 * used: its own mix, weighed by the stop it fills in the rule's.
 */
function paintTokens(style: CSSStyleDeclaration, map: TokenMap): InspectedToken[] {
  const out = new Map<string, InspectedToken>()
  for (const [prop, value] of declarations(style)) {
    const role = roleOf(prop)
    if (!role) continue
    for (const [token, weight] of tokenWeights(value, map)) {
      const key = `${token}@${role}`
      if (out.has(key)) continue
      const shares = seedShares(token, map)
      for (const k of Object.keys(shares)) shares[k] *= weight
      const seeds = paintingSeeds(shares)
      if (seeds.length) out.set(key, { token, property: prop, role, seeds })
    }
  }
  return Array.from(out.values())
}

function labelOf(el: Element): string {
  const own = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim()
  if (own) return own
  // The element's OWN text, not everything under it: a panel clicked on its
  // padding would otherwise be named by the whole list it contains.
  const text = Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
  if (text) return text.length > 40 ? `${text.slice(0, 40)}…` : text
  const childLabel = el.matches('button, a, [role=button]') ? el.textContent?.replace(/\s+/g, ' ').trim() : ''
  return childLabel ? childLabel.slice(0, 40) : el.tagName.toLowerCase()
}

function idOf(el: Element): string {
  const classes = Array.from(el.classList).slice(0, 3)
  return classes.length ? `.${classes.join('.')}` : el.tagName.toLowerCase()
}

// Pseudo-elements paint inside their host, so the host is the place; a
// selector that keeps one matches nothing in querySelectorAll.
const PSEUDO_ELEMENT = /::?(before|after|placeholder|selection|marker|first-line|first-letter|backdrop|-webkit-[a-z-]+|-moz-[a-z-]+)\b/g

/** An element a seed paints, and how. */
export interface Place { el: Element; roles: PaintRole[] }

export interface Inspector {
  /** What colours the element — its own rules, and the ink and fill it shows through from around. */
  describe(el: Element): Inspection
  /** Every element in the document whose rules paint with the seed, at rest. */
  placesOf(seed: string): Place[]
}

/**
 * One inspection session: the stylesheets are read once, and each rule that
 * paints with a seed is kept with its tokens. `describe` then matches an
 * element against those rules only, and `placesOf` runs their selectors.
 */
export function createInspector(doc: Document = document, map: TokenMap = readTokenMap(doc)): Inspector {
  const rules = allRules(doc)
    .map(rule => ({ rule, tokens: paintTokens(rule.style, map) }))
    .filter(r => r.tokens.length)
  const described = new WeakMap<Element, Inspection>()
  const selectable = new Map<string, string | null>()

  const normalize = (value: string) => value.trim().toLowerCase()
  const seedLiteral = (seed: string): string => {
    const live = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue(`--seed-${seed}`)
    return normalize(live || map[`--seed-${seed}`] || '')
  }

  const ownTokens = (el: Element): InspectedToken[] => {
    const out = new Map<string, InspectedToken>()
    const take = (tokens: InspectedToken[]) => {
      for (const t of tokens) {
        const key = `${t.token}@${t.role}`
        if (!out.has(key)) out.set(key, t)
      }
    }
    for (const r of rules) {
      let hit = false
      try { hit = el.matches(r.rule.selectorText) } catch { continue }
      if (hit) take(r.tokens)
    }
    if (el instanceof HTMLElement || el instanceof SVGElement) take(paintTokens(el.style, map))
    // The graph caches seed colours as literal SVG attributes. Recover those
    // exact matches against the live draft, not the original stylesheet seeds.
    for (const prop of ['fill', 'stroke', 'color'] as const) {
      const role = roleOf(prop)!
      const attr = el.getAttribute(prop) ?? ''
      const literal = normalize(attr || (el as SVGElement).style?.getPropertyValue(prop) || '')
      if (/^#[0-9a-f]{6}$/.test(literal)) {
        const seeds = SEED_KEYS.filter(k => seedLiteral(k) === literal)
        if (seeds.length) out.set(`${prop}:${literal}`, { token: `${prop}:${literal}`, property: prop, role, seeds })
      }
      for (const m of attr.matchAll(VAR_REF)) {
        const seeds = tokenSeeds(m[1], map)
        if (seeds.length) out.set(`${m[1]}@${role}`, { token: m[1], property: prop, role, seeds })
      }
    }
    return Array.from(out.values())
  }

  const describe = (el: Element): Inspection => {
    const hit = described.get(el)
    if (hit) return hit
    let answer: Inspection | null = null
    const seen = new Set<PaintRole>()
    for (let cur: Element | null = el; cur; cur = cur.parentElement) {
      const tokens = ownTokens(cur)
      if (!tokens.length) continue
      if (!answer) answer = { name: labelOf(cur), id: idOf(cur), el: cur, tokens: [...tokens] }
      else {
        // Two roles show through: the ink a text inherits, and the fill
        // behind a box that paints none of its own. A border does not.
        for (const t of tokens) {
          if ((t.role === 'ink' || t.role === 'fill') && !seen.has(t.role)) answer.tokens.push({ ...t, inherited: true })
        }
      }
      for (const t of tokens) seen.add(t.role)
      if (seen.has('ink') && seen.has('fill')) break
    }
    const result = answer ?? { name: labelOf(el), id: idOf(el), el, tokens: [] }
    described.set(el, result)
    return result
  }

  const selectorOf = (rule: CSSStyleRule): string | null => {
    const text = rule.selectorText
    const known = selectable.get(text)
    if (known !== undefined) return known
    const stripped = text.replace(PSEUDO_ELEMENT, '').trim()
    let ok = stripped.length > 0
    if (ok) { try { doc.querySelector(stripped) } catch { ok = false } }
    const result = ok ? stripped : null
    selectable.set(text, result)
    return result
  }

  const placesOf = (seed: string): Place[] => {
    // Selectors grouped by the roles they give the seed, so the document is
    // walked once per role set rather than once per rule.
    const byRoles = new Map<string, string[]>()
    for (const r of rules) {
      const roles = Array.from(new Set(r.tokens.filter(t => t.seeds.includes(seed)).map(t => t.role))).sort()
      if (!roles.length) continue
      const sel = selectorOf(r.rule)
      if (!sel) continue
      const key = roles.join(',')
      const list = byRoles.get(key) ?? []
      if (!list.includes(sel)) list.push(sel)
      byRoles.set(key, list)
    }
    const literal = seedLiteral(seed)
    if (/^#[0-9a-f]{6}$/.test(literal)) {
      const list = byRoles.get('icon') ?? []
      list.push(`[fill="${literal}" i], [stroke="${literal}" i]`)
      byRoles.set('icon', list)
    }
    const places = new Map<Element, Set<PaintRole>>()
    for (const [key, selectors] of byRoles) {
      const roles = key.split(',') as PaintRole[]
      let found: Element[] = []
      try { found = Array.from(doc.querySelectorAll(selectors.join(', '))) } catch {
        // One selector the engine refuses spoils the list: fall back to one query each.
        for (const sel of selectors) { try { found.push(...Array.from(doc.querySelectorAll(sel))) } catch { /* skipped */ } }
      }
      for (const el of found) {
        const set = places.get(el) ?? new Set<PaintRole>()
        for (const role of roles) set.add(role)
        places.set(el, set)
      }
    }
    return Array.from(places, ([el, roles]) => ({ el, roles: Array.from(roles) }))
  }

  return { describe, placesOf }
}

/**
 * What colours the element under the pointer — or, when it paints nothing of
 * its own, the nearest ancestor that does: a label inside a button is the
 * button's colours.
 */
export function describeElement(el: Element, map: TokenMap, doc: Document = document): Inspection | null {
  return createInspector(doc, map).describe(el)
}

export interface Box { el: Element; role: PaintRole; rect: DOMRect }

// Which role a box is drawn as when a place has several: the largest thing first.
const DRAW_ORDER: PaintRole[] = ['fill', 'border', 'ink', 'outline', 'shadow', 'icon']

/**
 * The places worth a box: on screen, not the builder's own, and for an ink
 * only the innermost — a body that sets the text colour contains every
 * label that sets it again, and boxing both says nothing. Fills stack for
 * real (the canvas behind, the panel on it), so every fill is drawn.
 */
export function drawablePlaces(places: Place[], win: Window, limit = 400): Box[] {
  const inkOnly = new Set(places.filter(p => p.roles.length === 1 && p.roles[0] === 'ink').map(p => p.el))
  const covered = new Set<Element>()
  for (const el of inkOnly) {
    for (let a = el.parentElement; a; a = a.parentElement) if (inkOnly.has(a)) covered.add(a)
  }
  const out: Box[] = []
  for (const p of places) {
    if (covered.has(p.el) || p.el.closest('[data-theme-builder]')) continue
    const rect = p.el.getBoundingClientRect()
    if (!(rect.width > 0 && rect.height > 0)) continue
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= win.innerHeight || rect.left >= win.innerWidth) continue
    out.push({ el: p.el, role: DRAW_ORDER.find(r => p.roles.includes(r)) ?? p.roles[0], rect })
    if (out.length >= limit) break
  }
  return out
}
