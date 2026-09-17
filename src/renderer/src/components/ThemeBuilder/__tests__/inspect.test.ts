import { tokenSeeds, describeElement, readTokenMap, type TokenMap } from '../inspect'

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
    expect(describeElement(root.querySelector('.bare')!, readTokenMap())).toEqual({ name: 'nothing', id: '.bare', tokens: [] })
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
