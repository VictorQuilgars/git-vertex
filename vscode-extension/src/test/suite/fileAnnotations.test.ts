import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { fileAnnotations, commitLines, authorInitials } from '../../blame/fileAnnotations'
import { BlameAvatars, loadAvatar } from '../../blame/avatars'
import { resolveAvatar } from '../../avatar'
import type { BlameLine } from '../../blame/blame'
import { EXT_ROOT } from './roots'

const line = (n: number, hash = 'a', uncommitted = false): BlameLine => ({
  line: n, hash, shortHash: hash, author: 'Ada Lovelace', authorMail: 'ada@example.com', authorTime: 1, summary: 'Change', uncommitted,
})
const tick = () => new Promise(resolve => setImmediate(resolve))

suite('file blame — runs and cursor commit', () => {
  test('one label per consecutive run, including commits appearing again later', () => {
    const entries = fileAnnotations([line(1), line(2), line(3, 'b'), line(4), line(5)])
    assert.deepStrictEqual(entries.map(e => e.continuation), [false, true, false, false, true])
    assert.strictEqual(fileAnnotations(entries.map(e => e.line), false).filter(e => e.continuation).length, 0)
  })
  test('gaps break runs and partial blame is ordered by buffer line', () => {
    assert.deepStrictEqual(fileAnnotations([line(4), line(1), line(3)]).map(e => [e.line.line, e.continuation]), [[1, false], [3, false], [4, true]])
    assert.deepStrictEqual(fileAnnotations([]), [])
  })
  test('a 2,000-line file keeps only one label for each of its 100 runs', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => line(i + 1, String(Math.floor(i / 20) % 3)))
    assert.strictEqual(fileAnnotations(lines).filter(e => !e.continuation).length, 100)
    assert.deepStrictEqual(commitLines(lines, 1), lines.filter(e => e.hash === '0').map(e => e.line))
  })
  test('highlights all separate runs of a commit, changes with the cursor, clears outside commits', () => {
    const lines = [line(1), line(2), line(3, 'b'), line(4), line(6, '0', true)]
    assert.deepStrictEqual(commitLines(lines, 2), [1, 2, 4])
    assert.deepStrictEqual(commitLines(lines, 3), [3])
    for (const cursor of [undefined, 0, 5, 6, 7]) assert.deepStrictEqual(commitLines(lines, cursor), [])
  })
  test('initials are usable without an email or multiple name parts', () => {
    assert.strictEqual(authorInitials(' Ada  Lovelace '), 'AL')
    assert.strictEqual(authorInitials('Ada'), 'AD')
    assert.strictEqual(authorInitials(''), '?')
  })
  test('each feature is independently configured and on by default', () => {
    const props = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8')).contributes.configuration.properties
    for (const key of ['groupRuns', 'avatars', 'highlightCommit']) {
      assert.strictEqual(props[`gitVertex.blame.file.${key}`].type, 'boolean')
      assert.strictEqual(props[`gitVertex.blame.file.${key}`].default, true)
    }
  })
})

suite('file blame — avatar cache', () => {
  test('uses the graph resolver, deduplicates requests, and retains failed fallbacks', async () => {
    const urls: string[] = []
    let changed = 0
    const cache = new BlameAvatars(() => changed++, async url => { urls.push(url); return url.includes('/u/42') ? 'data:image/png;base64,ok' : null })
    assert.strictEqual(cache.get('42+Ada@users.noreply.github.com'), null)
    cache.get('42+ada@users.noreply.github.com')
    cache.get('no-photo@example.com')
    await tick()
    assert.strictEqual(cache.get('42+ada@users.noreply.github.com'), 'data:image/png;base64,ok')
    assert.strictEqual(cache.get('no-photo@example.com'), null)
    assert.deepStrictEqual(urls, [resolveAvatar('42+ada@users.noreply.github.com'), resolveAvatar('no-photo@example.com')])
    assert.strictEqual(changed, 1)
    cache.dispose()
  })
  test('limits parallel requests and stops queued work and callbacks after disposal', async () => {
    const finish: ((image: string | null) => void)[] = []
    let changes = 0
    const cache = new BlameAvatars(() => changes++, () => new Promise(resolve => finish.push(resolve)))
    for (let i = 0; i < 2000; i++) cache.get(`author${i}@example.com`)
    assert.strictEqual(finish.length, 4)
    finish[0]('image')
    await tick()
    assert.strictEqual(finish.length, 5)
    assert.strictEqual(changes, 1)
    cache.dispose()
    for (const done of finish) done('image')
    await tick()
    assert.strictEqual(changes, 1)
    assert.strictEqual(finish.length, 5)
  })
  test('missing, invalid or oversized responses fall back rather than becoming image URLs', async () => {
    const original = globalThis.fetch
    try {
      globalThis.fetch = async () => new Response('missing', { status: 404 })
      assert.strictEqual(await loadAvatar('https://example.com/a'), null)
      globalThis.fetch = async () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } })
      assert.strictEqual(await loadAvatar('https://example.com/a'), null)
      globalThis.fetch = async () => new Response(new Uint8Array(256 * 1024 + 1), { headers: { 'content-type': 'image/png' } })
      assert.strictEqual(await loadAvatar('https://example.com/a'), null)
      globalThis.fetch = async () => { throw new Error('offline') }
      assert.strictEqual(await loadAvatar('https://example.com/a'), null)
    } finally { globalThis.fetch = original }
  })
})
