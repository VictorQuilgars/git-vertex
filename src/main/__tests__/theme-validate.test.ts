// The server is not trusted, and this is the file that says so.
//
// Every case here is a payload that must NOT reach tokens.css's job. The
// CSS-injection case in particular is the whole reason rule 1 rejects instead
// of sanitising: these values are interpolated into a stylesheet.
import { validateTheme, oklch, contrast, hueGap, SEED_KEYS } from '../theme-validate'

/** A theme that passes every rule — each test breaks exactly one thing. */
function goodTheme(over: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: 'tokyo-night',
    name: 'Tokyo Night',
    dark: true,
    lic: 'MIT',
    src: 'enkia.tokyo-night',
    srcVersion: '1.1.2',
    srcUrl: 'https://open-vsx.org/extension/enkia/tokyo-night',
    notice: 'Tokyo Night — enkia.tokyo-night 1.1.2, MIT',
    seeds: {
      canvas: '#1A1B26', surface: '#16161E', sunken: '#1F2335', border: '#3B4261',
      text: '#C0CAF5', 'text-2': '#9AA5CE', 'text-3': '#9CA3C4',
      accent: '#7AA2F7', agent: '#BB9AF7',
      success: '#5FC98F', warning: '#E0AF68', danger: '#F0645C', conflict: '#E87DB0',
      'on-fill': '#1A1B26',
      'lane-1': '#F7768E', 'lane-2': '#FF9E64', 'lane-3': '#E0AF68', 'lane-4': '#9ECE6A',
      'lane-5': '#73DACA', 'lane-6': '#2AC3DE', 'lane-7': '#7AA2F7', 'lane-8': '#BB9AF7',
      'lane-9': '#C0CAF5', 'lane-10': '#9AA5CE',
    },
    ...over,
  }
}

const seedsWith = (patch: Record<string, string>) =>
  goodTheme({ seeds: { ...goodTheme().seeds, ...patch } })

describe('validateTheme', () => {
  it('accepts a well-formed theme', () => {
    const r = validateTheme(goodTheme(), { builtIns: ['aqua-dark', 'aqua-light'] })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('declares exactly 24 seeds', () => {
    expect(SEED_KEYS).toHaveLength(24)
    expect(new Set(SEED_KEYS).size).toBe(24)
  })

  // ── 1. Shape ───────────────────────────────────────────────────────────────

  it('rejects a missing seed', () => {
    const t = goodTheme()
    delete (t.seeds as Record<string, unknown>)['lane-7']
    const r = validateTheme(t)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('lane-7')
  })

  it('rejects an unexpected seed', () => {
    const r = validateTheme(seedsWith({ 'lane-11': '#FFFFFF' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('lane-11')
  })

  it.each([
    ['3-digit hex', '#FFF'],
    ['8-digit hex', '#FFFFFFFF'],
    ['no hash', 'C0CAF5'],
    ['a keyword', 'red'],
    ['an rgb() function', 'rgb(1,2,3)'],
    ['not a string', 12345 as unknown as string],
  ])('rejects a malformed value: %s', (_label, value) => {
    const r = validateTheme(seedsWith({ accent: value as string }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('hex')
  })

  it('rejects a CSS injection', () => {
    // The reason rule 1 exists. Were this written into a [data-theme] block it
    // would close the rule and add one of its own.
    const r = validateTheme(seedsWith({ canvas: 'red; } body { display: none } .x {' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('hex')
  })

  // ── 2. Id ──────────────────────────────────────────────────────────────────

  it.each([
    ['a path traversal', '../../etc/passwd'],
    ['a slash', 'foo/bar'],
    ['uppercase', 'TokyoNight'],
    ['a leading dash', '-tokyo'],
    ['empty', ''],
    ['too long', 'a'.repeat(65)],
  ])('rejects an invalid id: %s', (_label, id) => {
    const r = validateTheme(goodTheme({ id }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('id')
  })

  it('rejects an id that collides with a built-in', () => {
    const r = validateTheme(goodTheme({ id: 'aqua-dark' }), {
      builtIns: ['aqua-dark', 'aqua-light'],
    })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('collides')
  })

  // ── 3. Contrast ────────────────────────────────────────────────────────────

  it('rejects text that cannot be read on its canvas', () => {
    const r = validateTheme(seedsWith({ text: '#1B1C27' }))   // ~1:1 on #1A1B26
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/text on canvas .* below/)
  })

  it('rejects on-fill that cannot be read on the accent', () => {
    const r = validateTheme(seedsWith({ 'on-fill': '#7BA3F8' }))  // ~1:1 on the accent
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('on-fill on accent')
  })

  // ── 4. Semantic distinctness ───────────────────────────────────────────────

  it('rejects success and danger being the same colour', () => {
    // Exactly what shipped in 13 of the 30 embedded themes: Dark+, Light+,
    // Solarized, Monokai and nine others painted added and removed lines alike.
    const r = validateTheme(seedsWith({ success: '#4EC9B0', danger: '#4EC9B0' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('same colour')
  })

  it('rejects any two semantic seeds collapsing', () => {
    const r = validateTheme(seedsWith({ warning: '#E87DB0' }))   // == conflict
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('same colour')
  })

  it('treats the same colour in different case as the same colour', () => {
    const r = validateTheme(seedsWith({ conflict: '#e0af68' }))  // == warning
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('same colour')
  })

  // ── 5. success / danger plausibility ───────────────────────────────────────

  it('rejects added lines painted red', () => {
    const r = validateTheme(seedsWith({ success: '#F0645C' , danger: '#C0392B' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/success is \d+° from the hue/)
  })

  it('rejects removed lines painted green', () => {
    const r = validateTheme(seedsWith({ danger: '#5FC98F', success: '#3FA86F' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/danger is \d+° from the hue/)
  })

  it('rejects a colourless success', () => {
    // base16-black-metal-dark-funeral shipped #D0DFEE here.
    const r = validateTheme(seedsWith({ success: '#8E9490' }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/success is (almost colourless|\d+°)/)
  })

  it('leaves warning and conflict alone whatever hue they are', () => {
    // GitHub Dark calls "modified" blue; Dark+ resolves conflict to teal.
    // Neither is our business, and blocking on them would reject ~43% and ~34%
    // of the bank respectively.
    const r = validateTheme(seedsWith({ warning: '#79B8FF', conflict: '#4EC9B0' }))
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  // ── Shape of the input itself ──────────────────────────────────────────────

  it.each([[null], [undefined], ['a string'], [42]])(
    'rejects a non-object payload: %p', (payload) => {
      expect(validateTheme(payload).ok).toBe(false)
    },
  )

  it('rejects a payload with no seeds at all', () => {
    const r = validateTheme({ id: 'x', name: 'X' })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toContain('seeds missing')
  })

  it('reports every broken rule, not just the first', () => {
    const r = validateTheme(seedsWith({ success: '#E87DB0', text: '#1B1C27' }))
    expect(r.errors.length).toBeGreaterThan(1)
  })
})

describe('colour maths', () => {
  it('matches the Python reference hues for the built-in semantic seeds', () => {
    // docs-private/themes/colour.py, the same values map_seeds.py aims at.
    expect(oklch('#5FC98F').H).toBeCloseTo(157.2, 1)
    expect(oklch('#F0645C').H).toBeCloseTo(26.0, 1)
    expect(oklch('#E0A25C').H).toBeCloseTo(68.0, 1)
    expect(oklch('#E87DB0').H).toBeCloseTo(351.3, 1)
  })

  it('computes WCAG contrast', () => {
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
  })

  it('measures hue distance the short way round', () => {
    expect(hueGap(350, 10)).toBeCloseTo(20)
    expect(hueGap(10, 350)).toBeCloseTo(20)
    expect(hueGap(0, 180)).toBeCloseTo(180)
  })
})
