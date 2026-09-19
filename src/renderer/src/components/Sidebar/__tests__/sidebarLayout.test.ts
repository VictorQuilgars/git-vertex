// The list/tree choice and the one filter rule (#276).
import { readLayout, writeLayout, hasPaths, matchesFilter } from '../sidebarLayout'

beforeEach(() => localStorage.clear())

describe('the shape a view is drawn in', () => {
  test('defaults to what the view already did, so nothing moved the day it arrived', () => {
    expect(readLayout('local')).toBe('tree')
    expect(readLayout('remote')).toBe('tree')
    expect(readLayout('tags')).toBe('list')
  })

  test('is kept per view, and survives a reload', () => {
    writeLayout('tags', 'tree')
    expect(readLayout('tags')).toBe('tree')
    // The others are untouched: one key each.
    expect(readLayout('local')).toBe('tree')
    writeLayout('local', 'list')
    expect(readLayout('local')).toBe('list')
    expect(readLayout('tags')).toBe('tree')
  })

  test('a value that is not one of the two reads as the default', () => {
    localStorage.setItem('gv:sb-layout:tags', 'sideways')
    expect(readLayout('tags')).toBe('list')
  })
})

test('a tree is offered only where a name is a path', () => {
  expect(hasPaths(['main', 'develop', 'wip'])).toBe(false)
  expect(hasPaths(['main', 'feat/ui'])).toBe(true)
  expect(hasPaths([])).toBe(false)
})

describe('the filter', () => {
  test('is a case-insensitive substring of the whole name', () => {
    expect(matchesFilter('feat/ui-cards', 'UI')).toBe(true)
    expect(matchesFilter('feat/ui-cards', 'feat/ui')).toBe(true)
    expect(matchesFilter('feat/ui-cards', 'cards')).toBe(true)
    expect(matchesFilter('feat/ui-cards', 'fuc')).toBe(false)
  })

  test('an empty query — or one that is only spaces — keeps everything', () => {
    expect(matchesFilter('anything', '')).toBe(true)
    expect(matchesFilter('anything', '   ')).toBe(true)
  })
})
