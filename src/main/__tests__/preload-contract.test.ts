import * as fs from 'fs'
import * as path from 'path'

// The bridge has three copies of every signature, and only two of them are
// checked against each other by the compiler.
//
//   src/renderer/src/types.ts   what the shared renderer believes it can call
//   src/preload/index.ts        what actually crosses into the main process
//   src/main/index.ts           the handler that receives it
//
// TypeScript checks the renderer against types.ts, and the preload against
// nothing at all: `getWorkingFileDiff(path, staged, context)` was declared with
// three parameters, called with three, and forwarded with two — the third
// silently dropped, and "Full file" a button that changed its own state and
// nothing else. This test holds types.ts and the preload to the same arity, so
// the next parameter added to one side without the other fails here rather
// than in a feature that looks like it works.

const ROOT = path.resolve(__dirname, '..', '..', '..')
const PRELOAD = fs.readFileSync(path.join(ROOT, 'src', 'preload', 'index.ts'), 'utf8')
const TYPES = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'src', 'types.ts'), 'utf8')

/** The balanced content of the parenthesis opening at `open`. */
function parenBody(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i)
  }
  throw new Error('unbalanced parenthesis')
}

/** Top-level parameters — commas inside `{}`, `[]`, `()` and `<>` do not count. */
function paramCount(list: string): number {
  let depth = 0, commas = 0
  for (const ch of list) {
    if ('([{<'.includes(ch)) depth++
    else if (')]}>'.includes(ch)) depth--
    else if (ch === ',' && depth === 0) commas++
  }
  return list.trim() ? commas + 1 : 0
}

/** `name: (params) =>` / `name?: (params) =>` members of the object or interface starting at `from`. */
function arrowMembers(src: string, from: number): Map<string, number> {
  const out = new Map<string, number>()
  const body = src.slice(from)
  const re = /^\s{2,4}([a-zA-Z][A-Za-z0-9_]*)\??\s*:\s*\(/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) out.set(m[1], paramCount(parenBody(body, m.index + m[0].length - 1)))
  return out
}

const preload = arrowMembers(PRELOAD, PRELOAD.indexOf('const gitAPI = {'))
const declared = arrowMembers(TYPES, TYPES.indexOf('interface GitAPI'))
// on*/off* are subscriptions the renderer registers with a callback; they are
// not forwarded as calls and their shape is the callback's business.
const isEvent = (name: string) => /^(on|off)[A-Z]/.test(name)

describe('the bridge: types.ts and the preload agree', () => {
  test('both files were found and parsed', () => {
    expect(preload.size).toBeGreaterThan(150)
    expect(declared.size).toBeGreaterThan(150)
  })

  test('every parameter the renderer is allowed to pass is one the preload forwards', () => {
    const drift = [...declared]
      .filter(([name]) => preload.has(name) && !isEvent(name))
      .filter(([name, n]) => preload.get(name) !== n)
      .map(([name, n]) => `${name}: types.ts declares ${n} parameter(s), the preload forwards ${preload.get(name)}`)
    expect(drift).toEqual([])
  })

  test('every method the preload exposes is declared to the renderer', () => {
    const undeclared = [...preload.keys()].filter(name => !isEvent(name) && !declared.has(name))
    expect(undeclared).toEqual([])
  })

  test('nothing is declared that the preload does not have', () => {
    const phantom = [...declared.keys()].filter(name => !isEvent(name) && !preload.has(name))
    expect(phantom).toEqual([])
  })
})
