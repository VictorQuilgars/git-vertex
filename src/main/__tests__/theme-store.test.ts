// The store: what happens on install, on read, and when the network is gone.
//
// The three behaviours worth guarding are all failure paths — the happy path is
// a fetch and a writeFile. What matters is that a bad payload never lands, a
// corrupted file never gets applied, and a dead server never blocks the
// settings page.
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ThemeStore, MAX_INSTALLED } from '../theme-store'

const GOOD_SEEDS = {
  canvas: '#1A1B26', surface: '#16161E', sunken: '#1F2335', border: '#3B4261',
  text: '#C0CAF5', 'text-2': '#9AA5CE', 'text-3': '#9CA3C4',
  accent: '#7AA2F7', agent: '#BB9AF7',
  success: '#5FC98F', warning: '#E0AF68', danger: '#F0645C', conflict: '#E87DB0',
  'on-fill': '#1A1B26',
  'lane-1': '#F7768E', 'lane-2': '#FF9E64', 'lane-3': '#E0AF68', 'lane-4': '#9ECE6A',
  'lane-5': '#73DACA', 'lane-6': '#2AC3DE', 'lane-7': '#7AA2F7', 'lane-8': '#BB9AF7',
  'lane-9': '#C0CAF5', 'lane-10': '#9AA5CE',
}

function payload(over: Record<string, unknown> = {}) {
  return {
    version: 1, id: 'tokyo-night', name: 'Tokyo Night', dark: true, lic: 'MIT',
    src: 'enkia.tokyo-night', srcVersion: '1.1.2',
    srcUrl: 'https://open-vsx.org/extension/enkia/tokyo-night',
    notice: 'Tokyo Night — enkia.tokyo-night 1.1.2, MIT',
    seeds: GOOD_SEEDS,
    ...over,
  }
}

/** A fetch that answers with whatever it is given, once per URL suffix. */
function fakeFetch(routes: Record<string, unknown>, opts: { status?: number } = {}) {
  return jest.fn(async (url: string) => {
    const key = Object.keys(routes).find(k => String(url).endsWith(k))
    if (!key) return { ok: false, status: 404, json: async () => ({}), headers: new Map() } as any
    return {
      ok: (opts.status ?? 200) < 400,
      status: opts.status ?? 200,
      json: async () => routes[key],
      headers: { get: () => null },
    } as any
  }) as unknown as typeof fetch
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gv-themes-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const store = (fetchImpl?: typeof fetch) =>
  new ThemeStore({ baseDir: dir, builtIns: ['aqua-dark', 'tokyo-night-builtin'], fetchImpl })

describe('install', () => {
  it('writes a theme that validates', async () => {
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload() }))
    const t = await s.install('tokyo-night')
    expect(t.id).toBe('tokyo-night')
    expect(t.notice).toContain('MIT')
    expect(existsSync(join(dir, 'themes', 'tokyo-night.json'))).toBe(true)
  })

  it('refuses a payload that fails validation, and writes nothing', async () => {
    const bad = payload({ seeds: { ...GOOD_SEEDS, success: '#F0645C' } })  // == danger hue
    const s = store(fakeFetch({ '/theme/tokyo-night.json': bad }))
    await expect(s.install('tokyo-night')).rejects.toThrow(/rejected/)
    expect(existsSync(join(dir, 'themes', 'tokyo-night.json'))).toBe(false)
  })

  it('refuses a CSS injection, and writes nothing', async () => {
    const bad = payload({ seeds: { ...GOOD_SEEDS, canvas: 'red; } body { display: none } .x {' } })
    const s = store(fakeFetch({ '/theme/tokyo-night.json': bad }))
    await expect(s.install('tokyo-night')).rejects.toThrow()
    expect(existsSync(join(dir, 'themes', 'tokyo-night.json'))).toBe(false)
  })

  it('refuses a payload whose id is not the one asked for', async () => {
    // Otherwise a server could answer /theme/a.json with b and shadow b.
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload({ id: 'something-else' }) }))
    await expect(s.install('tokyo-night')).rejects.toThrow(/different id/)
  })

  it('refuses an id that would escape the themes directory', async () => {
    const s = store(fakeFetch({}))
    await expect(s.install('../../evil')).rejects.toThrow(/id/)
  })

  it('refuses an id that collides with a built-in', async () => {
    const s = store(fakeFetch({}))
    await expect(s.install('aqua-dark')).rejects.toThrow(/collides|id/)
  })

  it('reports a server that will not answer', async () => {
    const s = store(fakeFetch({}, { status: 503 }))
    await expect(s.install('tokyo-night')).rejects.toThrow(/Could not download/)
  })

  it('caps how many can be installed', async () => {
    mkdirSync(join(dir, 'themes'), { recursive: true })
    for (let i = 0; i < MAX_INSTALLED; i++) {
      writeFileSync(join(dir, 'themes', `t${i}.json`),
        JSON.stringify(payload({ id: `t${i}`, name: `T${i}` })))
    }
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload() }))
    await expect(s.install('tokyo-night')).rejects.toThrow(/limit/)
  })
})

describe('reading what is installed', () => {
  it('validates on READ, not only on install', async () => {
    // The file is on disk and was fine when it was written. Corrupt it the way
    // a hand-edit or a bad sector would, and it must not reach the stylesheet.
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload() }))
    await s.install('tokyo-night')
    writeFileSync(join(dir, 'themes', 'tokyo-night.json'),
      JSON.stringify(payload({ seeds: { ...GOOD_SEEDS, accent: 'javascript:alert(1)' } })))

    const fresh = store()
    expect(fresh.installed()).toHaveLength(0)
    const discarded = fresh.takeDiscarded()
    expect(discarded).toHaveLength(1)
    expect(discarded[0].id).toBe('tokyo-night')
    // Removed, not left to be retried on every launch.
    expect(existsSync(join(dir, 'themes', 'tokyo-night.json'))).toBe(false)
  })

  it('discards a file that is not JSON at all', () => {
    mkdirSync(join(dir, 'themes'), { recursive: true })
    writeFileSync(join(dir, 'themes', 'broken.json'), 'not json {{{')
    const s = store()
    expect(s.installed()).toHaveLength(0)
    expect(s.takeDiscarded()[0].id).toBe('broken')
  })

  it('never mistakes its own bookkeeping for a theme', async () => {
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload() }))
    await s.install('tokyo-night')
    const names = readdirSync(join(dir, 'themes'))
    expect(names).toContain('installed.json')
    const fresh = store()
    expect(fresh.installed().map(t => t.id)).toEqual(['tokyo-night'])
    expect(fresh.takeDiscarded()).toHaveLength(0)
  })

  it('survives a directory that does not exist yet', () => {
    expect(store().installed()).toEqual([])
  })

  it('removes on request', async () => {
    const s = store(fakeFetch({ '/theme/tokyo-night.json': payload() }))
    await s.install('tokyo-night')
    s.remove('tokyo-night')
    expect(store().installed()).toHaveLength(0)
  })
})

describe('catalogue', () => {
  const CAT = { version: 1, generatedAt: '2026-08-17T00:00:00Z', count: 1, themes: [{ id: 'a', name: 'A' }] }

  it('returns the list the server sends', async () => {
    const s = store(fakeFetch({ '/index.json': CAT }))
    const c = await s.catalogue()
    expect(c.count).toBe(1)
    expect(c.error).toBeUndefined()
  })

  it('falls back to the cached list when the network is gone', async () => {
    const online = store(fakeFetch({ '/index.json': CAT }))
    await online.catalogue()

    const offline = store((() => { throw new Error('offline') }) as unknown as typeof fetch)
    const c = await offline.catalogue({ refresh: true })
    expect(c.count).toBe(1)
    expect(c.stale).toBe(true)
  })

  // The settings page must open with no network. It never throws, so the
  // caller has nothing to catch and the built-in themes stay usable.
  it('reports rather than throws when there is no list at all', async () => {
    const s = store((() => { throw new Error('offline') }) as unknown as typeof fetch)
    const c = await s.catalogue()
    expect(c.themes).toEqual([])
    expect(c.error).toMatch(/Could not reach/)
  })

  it('does not treat a non-catalogue as a catalogue', async () => {
    const s = store(fakeFetch({ '/index.json': { nope: true } }))
    const c = await s.catalogue()
    expect(c.error).toBeDefined()
  })
})
