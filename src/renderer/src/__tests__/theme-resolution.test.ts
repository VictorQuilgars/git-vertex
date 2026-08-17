import fs from 'fs'
import path from 'path'
// Which theme gets painted, and whether an installed one survives a restart.
//
// The bug these guard against is the quiet one: a downloaded theme that reverts
// to aqua-dark on every launch, which reads as "my choice does not stick"
// rather than as anything to do with themes.
import {
  resolveTheme, cssRuleFor, setInstalledThemes,
  BUILT_IN_THEMES, SETTING_DEFAULTS, THEME_STORAGE_KEY, THEME_SEEDS_KEY,
  type InstalledThemeInfo,
} from '../contexts/SettingsContext'

const SEEDS = {
  canvas: '#1A1B26', surface: '#16161E', sunken: '#1F2335', border: '#3B4261',
  text: '#C0CAF5', 'text-2': '#9AA5CE', 'text-3': '#9CA3C4',
  accent: '#7AA2F7', agent: '#BB9AF7',
  success: '#5FC98F', warning: '#E0AF68', danger: '#F0645C', conflict: '#E87DB0',
  'on-fill': '#1A1B26',
  'lane-1': '#F7768E', 'lane-2': '#FF9E64', 'lane-3': '#E0AF68', 'lane-4': '#9ECE6A',
  'lane-5': '#73DACA', 'lane-6': '#2AC3DE', 'lane-7': '#7AA2F7', 'lane-8': '#BB9AF7',
  'lane-9': '#C0CAF5', 'lane-10': '#9AA5CE',
}

const installed: InstalledThemeInfo = {
  id: 'gruvbox-material', name: 'Gruvbox Material', dark: true, lic: 'MIT',
  src: 'sainnhe.gruvbox-material', srcUrl: 'https://open-vsx.org/extension/sainnhe/gruvbox-material',
  notice: 'Gruvbox Material — MIT', seeds: SEEDS,
}

afterEach(() => { setInstalledThemes([]) })

describe('resolveTheme', () => {
  it('accepts a built-in id', () => {
    expect(resolveTheme({ theme: 'tokyo-night' })).toBe('tokyo-night')
  })

  it('accepts an INSTALLED id once the store has reported it', () => {
    setInstalledThemes([installed])
    expect(resolveTheme({ theme: 'gruvbox-material' })).toBe('gruvbox-material')
  })

  it('falls back for an id that is neither built-in nor installed', () => {
    // A theme dropped from the bank, or one whose file failed validation and
    // was discarded, leaves a settings value pointing at nothing.
    expect(resolveTheme({ theme: 'was-installed-yesterday' })).toBe(SETTING_DEFAULTS.theme)
  })

  it('falls back when nothing is stored at all', () => {
    expect(resolveTheme({})).toBe(SETTING_DEFAULTS.theme)
  })

  it('stops accepting an installed id after it is removed', () => {
    setInstalledThemes([installed])
    expect(resolveTheme({ theme: 'gruvbox-material' })).toBe('gruvbox-material')
    setInstalledThemes([])
    expect(resolveTheme({ theme: 'gruvbox-material' })).toBe(SETTING_DEFAULTS.theme)
  })

  it('knows about all 32 built-ins', () => {
    expect(BUILT_IN_THEMES).toHaveLength(32)
    for (const id of BUILT_IN_THEMES) expect(resolveTheme({ theme: id })).toBe(id)
  })
})

describe('the rule injected before React mounts', () => {
  it('produces a rule that matches the stored id', () => {
    // This is the restart path: main.tsx reads both keys out of localStorage
    // and rebuilds the rule synchronously. If the selector and the stored id
    // disagree, the first frame paints unstyled.
    localStorage.setItem(THEME_STORAGE_KEY, installed.id)
    localStorage.setItem(THEME_SEEDS_KEY, JSON.stringify(installed.seeds))

    const rule = cssRuleFor(
      localStorage.getItem(THEME_STORAGE_KEY)!,
      JSON.parse(localStorage.getItem(THEME_SEEDS_KEY)!),
    )
    expect(rule).toContain(`[data-theme="${installed.id}"]`)
    expect(rule).toContain('--seed-canvas:#1A1B26')
    expect(rule).toContain('--seed-lane-10:#9AA5CE')
  })

  it('declares all 24 seeds, so no token falls back to the default theme', () => {
    const rule = cssRuleFor(installed.id, installed.seeds)
    expect(rule.match(/--seed-/g)).toHaveLength(24)
  })

  // The mirror is in localStorage, which a user can edit. It builds a
  // stylesheet, so it gets the same treatment as anything off the network.
  it('refuses a value that is not a colour', () => {
    const rule = cssRuleFor(installed.id, { ...SEEDS, canvas: 'red; } body { display: none } .x {' })
    expect(rule).not.toContain('display: none')
    expect(rule).not.toContain('--seed-canvas')
    expect(rule).toContain('--seed-accent:#7AA2F7')
  })

  it('refuses an id that is not an id', () => {
    expect(cssRuleFor('"] * { display: none } [x="', SEEDS)).toBe('')
    expect(cssRuleFor('../../evil', SEEDS)).toBe('')
  })

  it('refuses a seed name that is not a seed name', () => {
    const rule = cssRuleFor(installed.id, { 'canvas: red; --x': '#FFFFFF' })
    expect(rule).toBe('')
  })
})

// Setting `data-theme` to an installed id only paints if a rule for that id
// exists in the document, and setInstalledThemes() is the only thing that
// writes one. Every place that learns what is installed therefore has to go
// through it, not just keep a local list.
//
// This is a source check rather than a DOM one because the failure is not in
// what the component renders — it is in what it forgets to call. The gallery
// shipped with its own refresh that fetched the list and skipped the
// injection: installing a theme selected it, and the colours never arrived.
describe('every reader of the installed list injects its rules', () => {
  const files = [
    'components/ThemeGallery/ThemeGallery.tsx',
    'components/SettingsModal/SettingsModal.tsx',
    'contexts/SettingsContext.tsx',
  ]

  it.each(files)('%s calls setInstalledThemes where it reads themesInstalled', file => {
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
    if (!src.includes('themesInstalled')) return          // does not read it: nothing to check
    // A CALL, not the identifier: the import line alone satisfies `includes`,
    // which is how the first version of this guard passed with the call
    // deleted. Strip the imports, then look for an invocation.
    const body = src.replace(/^import[\s\S]*?from '[^']*'$/gm, '')
    expect(body).toMatch(/setInstalledThemes\s*\(/)
  })
})

// `themes:installed` answers { themes, discarded } — an OBJECT. Reading it as
// an array is silent: `Array.isArray(r) ? r : []` yields nothing, so no theme
// looks installed and setInstalledThemes([]) drops the injected rules on top.
// That shipped. The shape is the contract; assert both ends of it.
describe('the installed-list response is unwrapped, not assumed to be an array', () => {
  it('the handler answers an object with `themes`', () => {
    const main = fs.readFileSync(
      path.resolve(__dirname, '../../../main/index.ts'), 'utf8')
    const handler = main.slice(main.indexOf("ipcMain.handle('themes:installed'"))
    expect(handler.slice(0, 400)).toMatch(/return\s*\{[^}]*themes/)
  })

  it.each([
    'components/ThemeGallery/ThemeGallery.tsx',
    'components/SettingsModal/SettingsModal.tsx',
  ])('%s reads .themes off the response', file => {
    // Comments stripped first: a long note explaining the shape is not the
    // code reading it, and it pushed the actual unwrap out of any window.
    const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const call = src.indexOf('themesInstalled')
    if (call < 0) return
    const after = src.slice(call, call + 400)
    expect(after).toMatch(/\.themes/)
    expect(after).not.toMatch(/Array\.isArray\(\s*(list|r)\s*\)/)
  })
})
