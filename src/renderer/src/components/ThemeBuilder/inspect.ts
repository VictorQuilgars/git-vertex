import { SEED_KEYS } from '../../../../main/theme-validate'

// The inspect mode (#242): click anything in the window and learn which seed
// colours it. Generic on purpose — no component is annotated. The rules that
// apply to the element are read off the stylesheets, the `var(--…)` they use
// on colour properties are collected, and each token is followed through the
// derived table in :root until it reaches a `--seed-*`.

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

/** The custom properties `:root` declares, off the live stylesheet. */
export function readTokenMap(doc: Document = document): TokenMap {
  const map: TokenMap = {}
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of styleRules(rules, doc)) {
      if (!('selectorText' in rule) || !('style' in rule)) continue
      const r = rule as CSSStyleRule
      if (!r.selectorText.split(',').some(s => s.trim() === ':root')) continue
      for (let i = 0; i < r.style.length; i++) {
        const name = r.style[i]
        if (name.startsWith('--')) map[name] = r.style.getPropertyValue(name).trim()
      }
    }
  }
  return map
}

/** The seeds a token comes from — itself, when it is one. */
export function tokenSeeds(token: string, map: TokenMap, seen: Set<string> = new Set()): string[] {
  if (token.startsWith('--seed-')) {
    const seed = token.slice('--seed-'.length)
    return (SEED_KEYS as readonly string[]).includes(seed) ? [seed] : []
  }
  if (seen.has(token)) return []
  seen.add(token)
  const value = map[token]
  if (!value) return []
  const out: string[] = []
  for (const m of value.matchAll(VAR_REF)) {
    for (const s of tokenSeeds(m[1], map, seen)) if (!out.includes(s)) out.push(s)
  }
  return out
}

export interface InspectedToken { token: string; property: string; seeds: string[] }
export interface Inspection {
  /** What the element says it is: its label, its title, its text, or its tag. */
  name: string
  /** Its classes, which is how a stylesheet names it. */
  id: string
  tokens: InspectedToken[]
}

// The properties that paint. `border` shorthands carry a colour; radii and widths do not.
const PAINTS = /^(background|background-color|color|border|border-(top|right|bottom|left|inline|block)|border(-[a-z]+)?-color|outline|outline-color|box-shadow|fill|stroke|caret-color|text-decoration-color)$/

function tokensOf(el: Element, map: TokenMap, doc: Document): InspectedToken[] {
  const out = new Map<string, InspectedToken>()
  const take = (style: CSSStyleDeclaration): void => {
    for (let i = 0; i < style.length; i++) {
      const prop = style[i]
      if (!PAINTS.test(prop)) continue
      const value = style.getPropertyValue(prop)
      for (const m of value.matchAll(VAR_REF)) {
        const token = m[1]
        if (out.has(token)) continue
        const seeds = tokenSeeds(token, map)
        if (seeds.length) out.set(token, { token, property: prop, seeds })
      }
    }
  }
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of styleRules(rules, doc)) {
      if (!('selectorText' in rule) || !('style' in rule)) continue
      const r = rule as CSSStyleRule
      let hit = false
      try { hit = el.matches(r.selectorText) } catch { continue }
      if (hit) take(r.style)
    }
  }
  if (el instanceof HTMLElement || el instanceof SVGElement) take(el.style)
  // The graph caches seed colours as literal SVG attributes. Recover those
  // exact matches against the live draft, not the original stylesheet seeds.
  const computedRoot = doc.defaultView?.getComputedStyle(doc.documentElement)
  const normalize = (value: string) => value.trim().toLowerCase()
  for (const prop of ['fill', 'stroke', 'color']) {
    const literal = normalize(el.getAttribute(prop) ?? (el as SVGElement).style?.getPropertyValue(prop) ?? '')
    if (/^#[0-9a-f]{6}$/.test(literal)) {
      const seeds = SEED_KEYS.filter(k => normalize(computedRoot?.getPropertyValue(`--seed-${k}`) || map[`--seed-${k}`] || '') === literal)
      if (seeds.length) out.set(`${prop}:${literal}`, { token: `${prop}:${literal}`, property: prop, seeds })
    }
    for (const m of (el.getAttribute(prop) ?? '').matchAll(VAR_REF)) {
      const seeds = tokenSeeds(m[1], map)
      if (seeds.length) out.set(m[1], { token: m[1], property: prop, seeds })
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

/**
 * What colours the element under the pointer — or, when it paints nothing of
 * its own, the nearest ancestor that does: a label inside a button is the
 * button's colours.
 */
export function describeElement(el: Element, map: TokenMap, doc: Document = document): Inspection | null {
  let cur: Element | null = el
  while (cur) {
    const tokens = tokensOf(cur, map, doc)
    if (tokens.length) return { name: labelOf(cur), id: idOf(cur), tokens }
    cur = cur.parentElement
  }
  return { name: labelOf(el), id: idOf(el), tokens: [] }
}
