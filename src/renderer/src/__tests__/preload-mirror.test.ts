import * as fs from 'fs'
import * as path from 'path'

// `window.gitAPI` is written twice: once as the real object in
// src/preload/index.ts, once as a type in src/renderer/src/types.ts. They are
// built separately and nothing compared them, so the mirror drifted to half the
// surface — 199 methods exposed, 113 declared. The other 86 were reached through
// `(window.gitAPI as any)`, and a cast is a hole the compiler cannot see
// through: `aiGenerateCommitMessage` had been called for months against a
// declaration that did not have it.
//
// This is the same question hostParity.test.ts asks of the VS Code host, asked
// of the desktop bridge: is every exposed method accounted for?

const PRELOAD = path.resolve(__dirname, '../../../preload/index.ts')
const TYPES = path.resolve(__dirname, '../types.ts')

/** Method names of the object the preload exposes, at its top level. */
function exposed(): string[] {
  const src = fs.readFileSync(PRELOAD, 'utf8')
  const body = src.slice(src.indexOf('const gitAPI = {'))
  return [...body.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*):\s*(?:\(|async)/gm)].map(m => m[1])
}

/** Method names the renderer's `Window['gitAPI']` declares. */
function declared(): string[] {
  const src = fs.readFileSync(TYPES, 'utf8')
  const body = src.slice(src.indexOf('gitAPI: {'))
  return [...body.matchAll(/^ {6}([a-zA-Z][a-zA-Z0-9_]*)\??:\s*\(/gm)].map(m => m[1])
}

describe('the preload and its typed mirror', () => {
  test('every exposed method is declared', () => {
    const missing = exposed().filter(m => !declared().includes(m))
    expect(missing).toEqual([])
  })

  test('nothing is declared that is not exposed', () => {
    // The other direction matters just as much: a declaration with no method
    // behind it type-checks at every call site and throws at the first one.
    const d = declared()
    const phantom = d.filter(m => !exposed().includes(m))
    expect(phantom).toEqual([])
  })

  test('the mirror is not trivially empty', () => {
    // If either regex stops matching — a formatting change, a rename — both
    // checks above pass on two empty lists and guard nothing.
    expect(exposed().length).toBeGreaterThan(150)
    expect(declared().length).toBe(exposed().length)
  })
})
