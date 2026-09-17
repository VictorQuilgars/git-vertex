// The inspect mode (#242): click anything in the window and learn which seed
// colours it. Generic on purpose — no component is annotated. The rules that
// apply to the element are read off the stylesheets, the `var(--…)` they use
// on colour properties are collected, and each token is followed through the
// derived table in :root until it reaches a `--seed-*`.

/** Derived token → its raw value, as tokens.css wrote it. Read once per inspection. */
export type TokenMap = Record<string, string>

const VAR_REF = /var\((--[a-z0-9-]+)/g

/** The custom properties `:root` declares, off the live stylesheet. */
export function readTokenMap(doc: Document = document): TokenMap {
  const map: TokenMap = {}
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of Array.from(rules)) {
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
  if (token.startsWith('--seed-')) return [token.slice('--seed-'.length)]
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
    for (const rule of Array.from(rules)) {
      if (!('selectorText' in rule) || !('style' in rule)) continue
      const r = rule as CSSStyleRule
      let hit = false
      try { hit = el.matches(r.selectorText) } catch { continue }
      if (hit) take(r.style)
    }
  }
  if (el instanceof HTMLElement || el instanceof SVGElement) take(el.style)
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
  return el.tagName.toLowerCase()
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
  for (let depth = 0; cur && depth < 6; depth++) {
    const tokens = tokensOf(cur, map, doc)
    if (tokens.length) return { name: labelOf(cur), id: idOf(cur), tokens }
    cur = cur.parentElement
  }
  return null
}
