import * as fs from 'fs'
import * as path from 'path'

// The other half of the bridge. preload-contract.test.ts holds the renderer's
// declaration and the preload to one signature; this holds the preload and the
// main process to one set of channels. A preload that invokes a channel nobody
// handles gets a rejected promise at runtime and nothing at build time — and
// with the handlers spread over src/main/ipc/ by domain, "somewhere" is what
// has to be checked, not one file.

const ROOT = path.resolve(__dirname, '..', '..', '..')
const MAIN = path.join(ROOT, 'src', 'main')

function tsFilesUnder(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : tsFilesUnder(p)
    return e.name.endsWith('.ts') ? [p] : []
  })
}

const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'index.ts'), 'utf8')
// The preload calls through invoke() (which adds the repository envelope) and
// the main process registers through handle() (which takes it off) — both
// forms, and the bare Electron ones, count.
const invoked = [...preload.matchAll(/\binvoke\('([a-zA-Z:-]+)'/g)].map(m => m[1])
const handled = tsFilesUnder(MAIN).flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/\bhandle\('([a-zA-Z:-]+)'/g)].map(m => m[1]))

describe('the bridge: the preload and the main process agree on the channels', () => {
  test('both sides were found', () => {
    expect(invoked.length).toBeGreaterThan(150)
    expect(handled.length).toBeGreaterThan(150)
  })

  test('every channel the preload invokes is handled somewhere in the main process', () => {
    const orphans = [...new Set(invoked)].filter(c => !handled.includes(c))
    expect(orphans).toEqual([])
  })

  test('no channel is handled twice — the second registration would throw at boot', () => {
    const seen = new Map<string, number>()
    for (const c of handled) seen.set(c, (seen.get(c) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([c]) => c)).toEqual([])
  })
})
