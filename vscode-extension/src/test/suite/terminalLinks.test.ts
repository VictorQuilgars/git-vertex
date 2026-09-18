import * as assert from 'assert'
import { findRefLinks } from '../../terminalLinks'

// The spans of a terminal line that name a commit. Pure, so it runs without
// a display; the VS Code half only draws what this returns.

const refs = new Set(['main', 'feature/login', 'origin/main', 'v1.2.0'])
const isRef = (n: string) => refs.has(n)
const find = (line: string) => findRefLinks(line, isRef)

suite('terminal links', () => {
  test('a short or full SHA is a link, a run of digits is not', () => {
    const links = find('commit abc1234 fixed it; see also 12345678 and deadbeefdeadbeefdeadbeefdeadbeefdeadbeef')
    assert.deepStrictEqual(links.map(l => [l.kind, l.text, l.start]), [
      ['sha', 'abc1234', 7],
      ['sha', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 47],
    ])
  })

  test('a word is a link only when the repository has a ref of that name', () => {
    const links = find('Switched to branch feature/login from main, not develop')
    assert.deepStrictEqual(links.map(l => l.text), ['feature/login', 'main'])
    assert.strictEqual(links[0].kind, 'ref')
  })

  test('a range is one link with both ends, not two or none', () => {
    const [link] = find('git log main..feature/login')
    assert.strictEqual(link.kind, 'range')
    assert.strictEqual(link.from, 'main')
    assert.strictEqual(link.to, 'feature/login')
    const [three] = find('abc1234...v1.2.0')
    assert.strictEqual(three.text, 'abc1234...v1.2.0')
    // Half a range is not a link: a SHA glued to `..` and a word that is no
    // ref reads as a path or a placeholder more often than as a commit.
    assert.strictEqual(find('abc1234..unknown').length, 0, 'a range with an unknown end is text')
  })

  test('paths, versions and words that contain a name are text', () => {
    assert.deepStrictEqual(find('cd ../main/src && cat deadbeef.txt v1.0-deadbeef main.ts'), [])
  })

  test('links come back left to right and never overlap', () => {
    const links = find('main abc1234 origin/main..v1.2.0 abc1234')
    assert.deepStrictEqual(links.map(l => l.text), ['main', 'abc1234', 'origin/main..v1.2.0', 'abc1234'])
    for (let i = 1; i < links.length; i++) assert.ok(links[i].start >= links[i - 1].start + links[i - 1].length)
  })
})
