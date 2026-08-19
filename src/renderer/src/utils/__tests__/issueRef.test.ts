import { issueRefLabel, migrateIssueRef, issueRefUrl, parseIssueRefInput } from '../issueRef'
import type { Autolink } from '../autolinks'

// A reference used to be a number because GitHub was the only tracker. These
// tests are the two halves of stopping that: what a stored number reads as now,
// and what a reference that never had an API behind it can still do.

const LINKS: Autolink[] = [
  { prefix: 'PROJ-', url: 'https://jira.example.com/browse/PROJ-<num>' },
  { prefix: 'GH-', url: 'https://example.com/gh/<num>' },
  { prefix: 'G-', url: 'https://example.com/g/<num>' },
]

describe('issueRefLabel', () => {
  test('GitHub is written the way GitHub writes it, everything else as typed', () => {
    expect(issueRefLabel({ provider: 'github', key: '123' })).toBe('#123')
    expect(issueRefLabel({ provider: 'other', key: 'PROJ-421' })).toBe('PROJ-421')
  })
})

// The migration is the part that can lose someone's data, so it is the part
// with the most cases. A branch whose issue was linked before this change must
// still show it afterwards.
describe('migrateIssueRef — a stored reference must not be stranded', () => {
  test('the old shape is a GitHub number', () => {
    expect(migrateIssueRef({ number: 123, title: 'Fix it', url: 'https://x/1' }))
      .toEqual({ provider: 'github', key: '123', title: 'Fix it', url: 'https://x/1' })
  })

  test('the old shape without title or url', () => {
    expect(migrateIssueRef({ number: 7 })).toEqual({ provider: 'github', key: '7' })
  })

  // localStorage is text, and it is a file a user can open and edit.
  test('a number that arrived as a string still reads', () => {
    expect(migrateIssueRef({ number: '42' })).toEqual({ provider: 'github', key: '42' })
  })

  test('the new shape passes through, and an unknown provider is not invented', () => {
    expect(migrateIssueRef({ provider: 'other', key: 'PROJ-421' }))
      .toEqual({ provider: 'other', key: 'PROJ-421' })
    expect(migrateIssueRef({ provider: 'jira', key: 'PROJ-421' }))
      .toEqual({ provider: 'github', key: 'PROJ-421' })
  })

  test('empty strings do not become a title or a url', () => {
    expect(migrateIssueRef({ key: '5', title: '', url: '' })).toEqual({ provider: 'github', key: '5' })
  })

  // Unreadable is null, never a throw: one bad entry must not take the branch
  // list down with it.
  test('what it refuses', () => {
    expect(migrateIssueRef(null)).toBeNull()
    expect(migrateIssueRef('123')).toBeNull()
    expect(migrateIssueRef({})).toBeNull()
    expect(migrateIssueRef({ number: 'not a number' })).toBeNull()
    expect(migrateIssueRef({ key: '   ' })).toBeNull()
  })
})

describe('issueRefUrl — linking out with no API behind it', () => {
  test('the URL its tracker gave us wins', () => {
    expect(issueRefUrl({ provider: 'other', key: 'PROJ-421', url: 'https://given/1' }, LINKS))
      .toBe('https://given/1')
  })

  test('an autolink pattern resolves a reference nothing else can', () => {
    expect(issueRefUrl({ provider: 'other', key: 'PROJ-421' }, LINKS))
      .toBe('https://jira.example.com/browse/PROJ-421')
  })

  // Inherited from the autolink matcher rather than written again here.
  test('the longest prefix wins', () => {
    expect(issueRefUrl({ provider: 'other', key: 'GH-4' }, LINKS)).toBe('https://example.com/gh/4')
  })

  test('a partial match is not a match', () => {
    expect(issueRefUrl({ provider: 'other', key: 'PROJ-421-old' }, LINKS)).toBeNull()
    expect(issueRefUrl({ provider: 'other', key: 'NOPE-1' }, LINKS)).toBeNull()
  })

  // Not a gap: building it needs the repository, and this module has no
  // business knowing which one. The caller that has one composes it.
  test('a GitHub reference with no stored url is null, deliberately', () => {
    expect(issueRefUrl({ provider: 'github', key: '123' }, LINKS)).toBeNull()
  })

  test('no patterns configured is not an error', () => {
    expect(issueRefUrl({ provider: 'other', key: 'PROJ-421' }, [])).toBeNull()
  })
})

describe('parseIssueRefInput — the only path for a tracker we cannot list', () => {
  test('a number, with or without the hash, is the repository GitHub', () => {
    expect(parseIssueRefInput('123', LINKS)).toEqual({ provider: 'github', key: '123' })
    expect(parseIssueRefInput('#123', LINKS)).toEqual({ provider: 'github', key: '123' })
  })

  test('a configured pattern brings its URL along', () => {
    expect(parseIssueRefInput('PROJ-421', LINKS))
      .toEqual({ provider: 'other', key: 'PROJ-421', url: 'https://jira.example.com/browse/PROJ-421' })
  })

  test('an unknown reference is kept as typed, with nothing promised about it', () => {
    expect(parseIssueRefInput('ABC-9', LINKS)).toEqual({ provider: 'other', key: 'ABC-9' })
  })

  test('whitespace is what separates a reference from a sentence', () => {
    expect(parseIssueRefInput('', LINKS)).toBeNull()
    expect(parseIssueRefInput('   ', LINKS)).toBeNull()
    expect(parseIssueRefInput('fix the login bug', LINKS)).toBeNull()
  })

  test('surrounding whitespace is trimmed, not refused', () => {
    expect(parseIssueRefInput('  PROJ-421 ', LINKS))
      .toEqual({ provider: 'other', key: 'PROJ-421', url: 'https://jira.example.com/browse/PROJ-421' })
  })
})
