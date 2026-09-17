import { foldThemes, THEMES_FOLDED } from '../shared'

// The folded wall (#242): two rows of five, installed first, the built-ins
// filling what is left, the theme in use never hidden.

const presets = Array.from({ length: 32 }, (_, i) => ({ id: `p${i}` }))
const inst = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }))

test('nothing installed: ten built-ins', () => {
  const f = foldThemes(presets, [], 'p0')
  expect(f.presets.map(t => t.id)).toEqual(presets.slice(0, 10).map(t => t.id))
  expect(f.installed).toEqual([])
})

test('two installed: eight built-ins and the two, ten in all', () => {
  const f = foldThemes(presets, inst(2), 'p0')
  expect(f.presets).toHaveLength(8)
  expect(f.installed).toHaveLength(2)
  expect(f.presets.length + f.installed.length).toBe(THEMES_FOLDED)
})

test('many installed: the two hand-drawn built-ins stay, the installed fill the rest', () => {
  const f = foldThemes(presets, inst(20), 'i3')
  expect(f.presets.map(t => t.id)).toEqual(['p0', 'p1'])
  expect(f.installed).toHaveLength(8)
  expect(f.installed.map(t => t.id)).toContain('i3')
})

test('the theme in use is always shown, built-in or installed', () => {
  expect(foldThemes(presets, inst(2), 'p20').presets.map(t => t.id)).toContain('p20')
  expect(foldThemes(presets, inst(2), 'p20').presets).toHaveLength(8)
  expect(foldThemes(presets, inst(20), 'i15').installed.map(t => t.id)).toContain('i15')
  expect(foldThemes(presets, inst(20), 'i15').installed).toHaveLength(8)
})
