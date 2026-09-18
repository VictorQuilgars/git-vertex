import { SEED_KEYS } from '../../../../../main/theme-validate'
import {
  SEED_GROUPS, slugId, isDarkCanvas, payloadFromDraft, validateDraft, errorsBySeed,
  parseImport, serialize, seedsOfTheme, type Seeds,
} from '../seeds'

// The builder's model (#242): pure, so it is tested without a drawer.

const GOOD: Seeds = {
  canvas: '#1A1B26', surface: '#16161E', sunken: '#1F2335', border: '#3B4261',
  text: '#C0CAF5', 'text-2': '#9AA5CE', 'text-3': '#9CA3C4',
  accent: '#7AA2F7', agent: '#BB9AF7',
  success: '#5FC98F', warning: '#E0AF68', danger: '#F0645C', conflict: '#E87DB0',
  'on-fill': '#1A1B26',
  'lane-1': '#F7768E', 'lane-2': '#FF9E64', 'lane-3': '#E0AF68', 'lane-4': '#9ECE6A',
  'lane-5': '#73DACA', 'lane-6': '#2AC3DE', 'lane-7': '#7AA2F7', 'lane-8': '#BB9AF7',
  'lane-9': '#C0CAF5', 'lane-10': '#9AA5CE',
}

test('the groups list every seed once, and nothing else', () => {
  const listed = SEED_GROUPS.flatMap(g => g.seeds)
  expect([...listed].sort()).toEqual([...SEED_KEYS].sort())
  expect(new Set(listed).size).toBe(listed.length)
})

test('an id is mine- and the name, and never empty', () => {
  expect(slugId('Ink Rosé!')).toBe('mine-ink-rose')
  expect(slugId('   ')).toBe('mine-theme')
  expect(slugId('a'.repeat(80)).length).toBeLessThanOrEqual(55)
  expect(slugId('Dracula')).not.toBe('dracula-theme')
})

test('dark is read off the canvas', () => {
  expect(isDarkCanvas('#1A1B26')).toBe(true)
  expect(isDarkCanvas('#FFFFFF')).toBe(false)
})

test('a draft becomes the payload the bank serves, and validates', () => {
  const p = payloadFromDraft({ id: 'mine-x', name: 'X', lic: 'MIT', seeds: GOOD })
  expect(p).toMatchObject({ version: 1, id: 'mine-x', name: 'X', dark: true, lic: 'MIT', src: 'local' })
  expect(p.notice).toContain('MIT')
  expect(validateDraft(p).errors).toEqual([])
  // The built-ins may not be shadowed: the validator's rule, reachable from here.
  expect(validateDraft({ ...p, id: 'aqua-dark' }).ok).toBe(false)
})

test('each of the validator\'s sentences is filed under the seeds it names', () => {
  const by = errorsBySeed([
    'text on canvas is 2.10:1, below 4.5:1',
    'these mean different things but are the same colour: success, danger',
    'text-2 on canvas is 3.00:1, below 4.5:1',
  ])
  expect(by.text).toHaveLength(1)
  expect(by.canvas).toHaveLength(2)
  expect(by['text-2']).toHaveLength(1)
  expect(by.success).toHaveLength(1)
  expect(by.danger).toHaveLength(1)
  expect(by.accent).toBeUndefined()
})

test('a pasted file loads from the bank\'s shape, from bare seeds, and refuses junk', () => {
  const p = payloadFromDraft({ id: 'mine-x', name: 'X', lic: 'CC0-1.0', seeds: GOOD })
  const full = parseImport(serialize(p))
  expect(full).toMatchObject({ ok: true, name: 'X', lic: 'CC0-1.0' })
  expect(full.ok && Object.keys(full.seeds)).toHaveLength(24)
  const bare = parseImport(JSON.stringify({ canvas: '#000000', accent: 'nope' }))
  expect(bare).toMatchObject({ ok: true, seeds: { canvas: '#000000' } })
  expect(parseImport('{not json')).toMatchObject({ ok: false, why: 'not JSON' })
  expect(parseImport('{"name":"x"}')).toMatchObject({ ok: false })
})

test('a theme\'s seeds are read off its [data-theme] rule', () => {
  const style = document.createElement('style')
  style.textContent = `:root, [data-theme="aqua-dark"] { --seed-canvas: #0E1116; --seed-accent: #3FD8C2; }\n[data-theme="mine-x"] { --seed-canvas: #101010; }`
  document.head.appendChild(style)
  try {
    expect(seedsOfTheme('aqua-dark')).toMatchObject({ canvas: '#0E1116', accent: '#3FD8C2' })
    expect(seedsOfTheme('mine-x')).toEqual({ canvas: '#101010' })
    expect(seedsOfTheme('nope')).toBeNull()
  } finally { style.remove() }
})
