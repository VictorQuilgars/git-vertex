import { appendOperator, authorOfQuery, authorQuery, commitMatches, fileTerms, parseDateBound, parseSearchQuery, removeTerm } from '../searchQuery'

// The graph's search field, read: free text and operators that narrow.

const ops = (q: string) => parseSearchQuery(q).terms.map(t => `${t.op}=${t.value}`)

describe('parsing', () => {
  test('operators and free text, in any order', () => {
    const p = parseSearchQuery('author:ana file:src/main after:1m cache')
    expect(ops('author:ana file:src/main after:1m cache')).toEqual(['author=ana', 'file=src/main', 'after=1m'])
    expect(p.text).toBe('cache')
    expect(parseSearchQuery('fix the  cache').text).toBe('fix the cache')
  })

  test('quotes group a value with spaces, and free text too; an open quote takes the rest', () => {
    expect(ops('author:"Ana Maria" x')).toEqual(['author=Ana Maria'])
    expect(parseSearchQuery('"cache key" author:ana').text).toBe('cache key')
    expect(ops('file:"src/my folder/a.ts')).toEqual(['file=src/my folder/a.ts'])
  })

  test('one space after the colon is allowed; the aliases and the case are forgiven', () => {
    expect(ops('author: ana')).toEqual(['author=ana'])
    expect(ops('@:ana ?:src since:2w until:2026-01-01 AUTHOR:Bob')).toEqual(['author=ana', 'file=src', 'after=2w', 'before=2026-01-01', 'author=Bob'])
  })

  test('an unknown word: is text, and so is an operator inside a word or without a value', () => {
    expect(parseSearchQuery('fix: the thing')).toEqual({ text: 'fix: the thing', terms: [] })
    expect(parseSearchQuery('co-author:ana').terms).toEqual([])
    expect(parseSearchQuery('author:').terms).toEqual([])
    expect(parseSearchQuery('author: ').text).toBe('author:')
  })

  test('a term knows where it sits, so it can be taken out — alone', () => {
    const q = 'author:ana  file:"a b" cache'
    const p = parseSearchQuery(q)
    expect(removeTerm(q, p.terms[0])).toBe('file:"a b" cache')
    expect(removeTerm(q, p.terms[1])).toBe('author:ana cache')
    expect(appendOperator('cache ', 'file')).toBe('cache file:')
    expect(appendOperator('', 'after')).toBe('after:')
    expect(fileTerms(p)).toEqual(['a b'])
  })
})

describe('date bounds', () => {
  const now = new Date(2026, 8, 18, 12, 0, 0).getTime()   // 18 September 2026, noon
  const day = 86400e3

  test('spans back from now', () => {
    expect(parseDateBound('2w', 'after', now)).toBe(now - 14 * day)
    expect(parseDateBound('3m', 'before', now)).toBe(now - 90 * day)
    expect(parseDateBound('36h', 'after', now)).toBe(now - 36 * 3600e3)
    expect(parseDateBound('1Y', 'after', now)).toBe(now - 365 * day)
  })

  test('a day starts for after: and ends for before:, so the two together are that day', () => {
    expect(parseDateBound('2026-09-01', 'after', now)).toBe(new Date(2026, 8, 1).getTime())
    expect(parseDateBound('2026-09-01', 'before', now)).toBe(new Date(2026, 8, 2).getTime() - 1)
    expect(parseDateBound('2026-09', 'before', now)).toBe(new Date(2026, 9, 1).getTime() - 1)
    expect(parseDateBound('2026', 'after', now)).toBe(new Date(2026, 0, 1).getTime())
  })

  test('what is neither is no bound at all', () => {
    for (const bad of ['yesterday', '2w3d', '2026-13-01', '2026-02-45', '', '-2w']) expect(parseDateBound(bad, 'after', now)).toBeNull()
  })
})

describe('matching a commit', () => {
  const now = new Date(2026, 8, 18, 12).getTime()
  const c = (over: Record<string, unknown> = {}) => ({
    hash: 'a'.repeat(40), shortHash: 'aaaaaaa', message: 'fix the cache key', author: 'Ana Maria', authorEmail: 'ana@test.local',
    date: new Date(2026, 8, 10).toISOString(), ...over,
  })
  const m = (q: string, commit = c(), required?: Set<string> | null) => commitMatches(parseSearchQuery(q), commit, { now, required })

  test('free text matches message, author and hash, as it always did', () => {
    expect(m('cache')).toBe(true)
    expect(m('maria')).toBe(true)
    expect(m('aaaa')).toBe(true)
    expect(m('nothing')).toBe(false)
    expect(m('')).toBe(true)
  })

  test('author: matches who wrote it — name or address — and nothing else', () => {
    expect(m('author:ana')).toBe(true)
    expect(m('author:test.local')).toBe(true)
    expect(m('author:cache')).toBe(false)
  })

  test('operators combine with each other and with the text', () => {
    expect(m('author:ana after:2w cache')).toBe(true)
    expect(m('author:ana after:2w nothing')).toBe(false)
    expect(m('author:bob after:2w cache')).toBe(false)
    expect(m('after:2026-09-11 cache')).toBe(false)
    expect(m('after:2026-09-10 before:2026-09-10')).toBe(true)
    expect(m('before:1w')).toBe(true)
    expect(m('before:2w')).toBe(false)
  })

  test('a date that cannot be read is ignored, not a filter that matches nothing', () => {
    expect(m('after:someday cache')).toBe(true)
  })

  test('file: is git\'s answer: in the set or out of it — and no answer yet narrows nothing', () => {
    expect(m('file:src cache', c(), new Set(['a'.repeat(40)]))).toBe(true)
    expect(m('file:src cache', c(), new Set(['b'.repeat(40)]))).toBe(false)
    expect(m('file:src cache', c(), null)).toBe(true)
  })
})

describe('the contributors list writes a query, and reads it back', () => {
  test('a name with a space is quoted, so it stays one author', () => {
    expect(authorQuery('Ana Maria')).toBe('author:"Ana Maria"')
    expect(authorQuery('ana')).toBe('author:ana')
    expect(authorQuery(null)).toBe('')
    expect(authorOfQuery(authorQuery('Ana Maria'))).toBe('Ana Maria')
  })
  test('a query that does more than name one author lights no contributor', () => {
    expect(authorOfQuery('author:ana cache')).toBeNull()
    expect(authorOfQuery('author:ana file:src')).toBeNull()
    expect(authorOfQuery('cache')).toBeNull()
  })
})
