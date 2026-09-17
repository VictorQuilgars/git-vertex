import { tokenSeeds, describeElement, readTokenMap, roleOf, createInspector, drawablePlaces, type TokenMap } from '../inspect'

// The inspect mode (#242): a token is followed through the derived table
// until it reaches a seed, and an element answers with the seeds behind the
// tokens its rules paint with.

const MAP: TokenMap = {
  '--accent': 'var(--seed-accent)',
  '--accent-strong': 'var(--seed-accent)',
  '--surface-selected': 'color-mix(in oklab, var(--seed-sunken) 80%, var(--seed-accent))',
  '--surface-hover': 'color-mix(in oklab, var(--surface) 90%, var(--seed-text))',
  '--surface': 'var(--seed-surface)',
  '--loop-a': 'var(--loop-b)',
  '--loop-b': 'var(--loop-a)',
  '--radius-md': '6px',
}

test('a token is followed to its seeds, through a chain, without repeating one', () => {
  expect(tokenSeeds('--seed-canvas', MAP)).toEqual(['canvas'])
  expect(tokenSeeds('--accent', MAP)).toEqual(['accent'])
  expect(tokenSeeds('--surface-selected', MAP)).toEqual(['sunken', 'accent'])
  expect(tokenSeeds('--surface-hover', MAP)).toEqual(['surface', 'text'])
  expect(tokenSeeds('--radius-md', MAP)).toEqual([])
  expect(tokenSeeds('--loop-a', MAP)).toEqual([])
  expect(tokenSeeds('--unknown', MAP)).toEqual([])
})

describe('on a page', () => {
  let style: HTMLStyleElement
  let root: HTMLDivElement
  beforeEach(() => {
    style = document.createElement('style')
    style.textContent = [
      ':root { --seed-accent: #3FD8C2; --seed-sunken: #1C222C; --accent-strong: var(--seed-accent); --surface-selected: color-mix(in oklab, var(--seed-sunken) 80%, var(--seed-accent)); --radius-md: 6px; }',
      '.commit-btn { background-color: var(--accent-strong); border-radius: var(--radius-md); }',
      '.row--selected { background-color: var(--surface-selected); }',
    ].join('\n')
    document.head.appendChild(style)
    root = document.createElement('div')
    root.innerHTML = '<button class="commit-btn" title="Commit"><span class="label">Commit 3 files</span></button><div class="row row--selected"><span>plain</span></div><p class="bare">nothing</p>'
    document.body.appendChild(root)
  })
  afterEach(() => { style.remove(); root.remove() })

  test('the :root table is read off the stylesheet', () => {
    const map = readTokenMap()
    expect(map['--accent-strong']).toBe('var(--seed-accent)')
    expect(map['--radius-md']).toBe('6px')
  })

  test('a click on a label answers with the button around it, its tokens and their seeds', () => {
    const map = readTokenMap()
    const r = describeElement(root.querySelector('.label')!, map)
    expect(r).not.toBeNull()
    expect(r!.name).toBe('Commit')
    expect(r!.id).toBe('.commit-btn')
    expect(r!.tokens.map(t => t.token)).toEqual(['--accent-strong'])
    expect(r!.tokens[0].seeds).toEqual(['accent'])
    expect(r!.tokens[0].property).toBe('background-color')
  })

  test('a derived token names every seed it mixes', () => {
    const r = describeElement(root.querySelector('.row--selected span')!, readTokenMap())
    expect(r!.id).toBe('.row.row--selected')
    expect(r!.tokens[0].seeds).toEqual(['sunken', 'accent'])
  })

  test('unmapped elements still have a selection and an explicit empty palette', () => {
    const bare = root.querySelector('.bare')!
    expect(describeElement(bare, readTokenMap())).toEqual({ name: 'nothing', id: '.bare', el: bare, tokens: [] })
  })

  test('a token declared in a block <html> matches is followed, not only :root', () => {
    // The layout's block redefines --bg-shell; a map that read :root alone
    // answered "text" for the body and never "canvas".
    const layout = document.createElement('style')
    layout.textContent = '[data-layout="blocks"] { --bg-shell: var(--seed-sunken); } [data-layout="flush"] { --bg-shell: var(--seed-accent); }'
    document.head.appendChild(layout)
    document.documentElement.setAttribute('data-layout', 'blocks')
    try {
      const map = readTokenMap()
      expect(map['--bg-shell']).toBe('var(--seed-sunken)')
      expect(tokenSeeds('--bg-shell', map)).toEqual(['sunken'])
    } finally {
      document.documentElement.removeAttribute('data-layout')
      layout.remove()
    }
  })
})

describe('what a seed does on the element', () => {
  let style: HTMLStyleElement
  let root: HTMLDivElement
  beforeEach(() => {
    style = document.createElement('style')
    style.textContent = [
      ':root { --seed-canvas: #0E1116; --seed-surface: #151A21; --seed-border: #2B3341; --seed-text: #E8ECF1; --seed-accent: #3FD8C2; --bg-canvas: var(--seed-canvas); --surface: var(--seed-surface); --border-default: var(--seed-border); --text-primary: var(--seed-text); --accent: var(--seed-accent); }',
      '.page { background: var(--bg-canvas); color: var(--text-primary); }',
      '.panel { background: var(--surface); border: 1px solid var(--border-default); }',
      '.link { color: var(--accent); }',
    ].join('\n')
    document.head.appendChild(style)
    root = document.createElement('div')
    root.innerHTML = '<div class="page"><div class="panel"><div class="wrap"><span class="link">open</span><span class="plain">plain</span></div></div></div>'
    document.body.appendChild(root)
  })
  afterEach(() => { style.remove(); root.remove() })

  test('each token carries its role: a background is a fill, a color is the ink, a border a border', () => {
    expect(roleOf('background')).toBe('fill')
    expect(roleOf('background-color')).toBe('fill')
    expect(roleOf('color')).toBe('ink')
    expect(roleOf('border')).toBe('border')
    expect(roleOf('border-top-color')).toBe('border')
    expect(roleOf('outline')).toBe('outline')
    expect(roleOf('box-shadow')).toBe('shadow')
    expect(roleOf('stroke')).toBe('icon')
    expect(roleOf('border-radius')).toBeNull()
    expect(roleOf('width')).toBeNull()
    const panel = describeElement(root.querySelector('.panel')!, readTokenMap())!
    expect(panel.tokens.filter(t => !t.inherited).map(t => [t.role, t.seeds[0]])).toEqual([['fill', 'surface'], ['border', 'border']])
  })

  test('a click on a transparent wrapper answers with the panel behind it, and the ink it shows through', () => {
    const wrap = root.querySelector('.wrap')!
    const r = describeElement(wrap, readTokenMap())!
    // The outline goes on the panel: that is what paints under the pointer.
    expect(r.el).toBe(root.querySelector('.panel'))
    expect(r.id).toBe('.panel')
    // Its own fill and border first; then the ink it inherits from the page,
    // marked as such, so "text" under a box is not read as its background.
    expect(r.tokens.map(t => [t.role, t.seeds[0], !!t.inherited])).toEqual([
      ['fill', 'surface', false], ['border', 'border', false], ['ink', 'text', true],
    ])
  })

  test('a coloured text answers with its own ink, and the fill behind it from around', () => {
    const r = describeElement(root.querySelector('.link')!, readTokenMap())!
    expect(r.el).toBe(root.querySelector('.link'))
    expect(r.tokens.map(t => [t.role, t.seeds[0], !!t.inherited])).toEqual([['ink', 'accent', false], ['fill', 'surface', true]])
    // The page's ink is NOT listed: the link paints its own, and only the
    // nearest of each role shows through.
    expect(r.tokens.some(t => t.seeds.includes('text'))).toBe(false)
  })

  test('an inspector answers the same element from its cache, and walks the places of a seed', () => {
    const inspector = createInspector()
    const plain = root.querySelector('.plain')!
    expect(inspector.describe(plain)).toBe(inspector.describe(plain))
    expect(inspector.describe(plain).el).toBe(root.querySelector('.panel'))
    const places = inspector.placesOf('border')
    expect(places.map(p => p.el)).toEqual([root.querySelector('.panel')])
    expect(places[0].roles).toEqual(['border'])
    const surface = inspector.placesOf('surface')
    expect(surface).toEqual([{ el: root.querySelector('.panel'), roles: ['fill'] }])
    expect(inspector.placesOf('text').map(p => p.el)).toEqual([root.querySelector('.page')])
    expect(inspector.placesOf('lane-1')).toEqual([])
  })

  test('a rule on a pseudo-element places its host, and a state pseudo-class places nothing at rest', () => {
    const extra = document.createElement('style')
    extra.textContent = '.wrap::before { background: var(--accent); } .plain:hover { color: var(--accent); }'
    document.head.appendChild(extra)
    try {
      const places = createInspector().placesOf('accent')
      expect(places.map(p => [p.el.className, p.roles])).toEqual([['link', ['ink']], ['wrap', ['fill']]])
    } finally { extra.remove() }
  })
})

describe('the boxes drawn for a seed', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height } as DOMRect)
  const el = (className: string, r: DOMRect | null, parent: Element = document.body) => {
    const e = document.createElement('div')
    e.className = className
    parent.appendChild(e)
    jest.spyOn(e, 'getBoundingClientRect').mockReturnValue(r ?? rect(0, 0, 0, 0))
    return e
  }
  const win = { innerWidth: 1000, innerHeight: 800 } as Window

  test('off-screen, empty and builder-owned places are dropped; a place with several roles is drawn as its largest', () => {
    const shown = el('a', rect(10, 10, 100, 20))
    const empty = el('b', null)
    const below = el('c', rect(10, 900, 100, 20))
    const drawer = el('d', rect(10, 10, 100, 20))
    drawer.setAttribute('data-theme-builder', '')
    const inside = el('e', rect(20, 20, 10, 10), drawer)
    const boxes = drawablePlaces([
      { el: shown, roles: ['ink', 'fill'] }, { el: empty, roles: ['fill'] }, { el: below, roles: ['fill'] },
      { el: drawer, roles: ['fill'] }, { el: inside, roles: ['fill'] },
    ], win)
    expect(boxes.map(b => [b.el, b.role])).toEqual([[shown, 'fill']])
    expect(boxes[0].rect.left).toBe(10)
    ;[shown, empty, below, drawer].forEach(e => e.remove())
  })

  test('an ink is boxed on the innermost element only: a body that sets it contains every label that sets it again', () => {
    const page = el('page', rect(0, 0, 1000, 800))
    const label = el('label', rect(10, 10, 50, 20), page)
    const other = el('other', rect(10, 40, 50, 20), page)
    const boxes = drawablePlaces([
      { el: page, roles: ['ink'] }, { el: label, roles: ['ink'] }, { el: other, roles: ['fill', 'ink'] },
    ], win)
    expect(boxes.map(b => [b.el.className, b.role])).toEqual([['label', 'ink'], ['other', 'fill']])
    page.remove()
  })

  test('a cap keeps the overlay finite', () => {
    const page = el('page', rect(0, 0, 1000, 800))
    const many = Array.from({ length: 12 }, (_, i) => el(`x${i}`, rect(i, 0, 10, 10), page))
    expect(drawablePlaces(many.map(e => ({ el: e, roles: ['fill'] as const as ['fill'] })), win, 5)).toHaveLength(5)
    page.remove()
  })
})

 test('selection walks through deeply nested wrappers', () => {
   const style = document.createElement('style')
   style.textContent = '.deep-panel { background: var(--accent); }'
   document.head.appendChild(style)
   const panel = document.createElement('div')
   panel.className = 'deep-panel'
   let target = panel
   for (let i = 0; i < 12; i++) { const child = document.createElement('span'); target.appendChild(child); target = child }
   document.body.appendChild(panel)
   expect(describeElement(target, MAP)?.tokens[0].seeds).toEqual(['accent'])
   panel.remove(); style.remove()
 })

 test('nested CSS rules and SVG presentation attributes expose their seeds', () => {
   const style = document.createElement('style')
   style.textContent = '@media (min-width: 1px) { .nested { color: var(--accent); } }'
   document.head.appendChild(style)
   const el = document.createElement('span'); el.className = 'nested'
   expect(describeElement(el, MAP)?.tokens[0].seeds).toEqual(['accent'])
   const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
   svg.setAttribute('stroke', 'var( --seed-lane-3)')
   expect(describeElement(svg, MAP)?.tokens[0].seeds).toEqual(['lane-3'])
   style.remove()
 })

test('literal graph colours resolve against the current draft', () => {
  document.documentElement.style.setProperty('--seed-lane-3', '#123456')
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  svg.setAttribute('stroke', '#123456')
  expect(describeElement(svg, MAP)?.tokens[0].seeds).toEqual(['lane-3'])
  document.documentElement.style.removeProperty('--seed-lane-3')
})
