import { act, renderHook } from '@testing-library/react'
import { useRefCard } from '../useRefCard'

// The host's side of a chip's card: the same chip again closes it, another
// takes its place, and a selection that leaves the tip — or a delete that ends
// the reference — closes it on its own.

const main = { kind: 'head' as const, name: 'main', hash: 'aaa' }
const tag = { kind: 'tag' as const, name: 'main', hash: 'aaa' }
const BRANCHES = [{ name: 'main', remote: false }, { name: 'feature/x', remote: false }] as any[]
const TAGS = [{ name: 'main' }]

test('the same chip closes its card, another chip replaces it — a tag and a branch of one name are two', () => {
  const { result } = renderHook(() => useRefCard('aaa'))
  act(() => result.current.toggle(main))
  expect(result.current.card).toEqual(main)
  act(() => result.current.toggle(tag))
  expect(result.current.card).toEqual(tag)
  act(() => result.current.toggle(tag))
  expect(result.current.card).toBeNull()
})

test('a selection that leaves the reference\'s tip closes the card', () => {
  const { result, rerender } = renderHook(({ hash }) => useRefCard(hash), { initialProps: { hash: 'aaa' as string | null } })
  act(() => result.current.toggle(main))
  rerender({ hash: 'aaa' })
  expect(result.current.card).toEqual(main)
  rerender({ hash: 'bbb' })
  expect(result.current.card).toBeNull()
  act(() => result.current.toggle({ ...main, hash: 'bbb' }))
  rerender({ hash: null })
  expect(result.current.card).toBeNull()
})

describe('a card whose reference is deleted', () => {
  // The bug: Delete Branch on the card leaves the selection exactly where it
  // was, so the hash still agrees and nothing closed the card — Switch, Merge,
  // Rebase and Delete stayed live on a branch git no longer had.
  const feature = { kind: 'head' as const, name: 'feature/x', hash: 'aaa' }

  test('closes when the branch it names is deleted, the selection standing still', () => {
    const { result, rerender } = renderHook(
      ({ branches }) => useRefCard('aaa', branches, TAGS),
      { initialProps: { branches: BRANCHES } })
    act(() => result.current.toggle(feature))
    expect(result.current.card).toEqual(feature)
    rerender({ branches: BRANCHES.filter(b => b.name !== 'feature/x') })
    expect(result.current.card).toBeNull()
  })

  test('closes when the tag it names is deleted, and a branch of that name does not save it', () => {
    const { result, rerender } = renderHook(
      ({ tags }) => useRefCard('aaa', BRANCHES, tags),
      { initialProps: { tags: TAGS } })
    act(() => result.current.toggle(tag))
    rerender({ tags: [] })
    expect(result.current.card).toBeNull()
  })

  test('survives the refresh that follows the delete, which empties the lists first', () => {
    const { result, rerender } = renderHook(
      ({ branches }) => useRefCard('aaa', branches, TAGS),
      { initialProps: { branches: BRANCHES } })
    act(() => result.current.toggle(feature))
    rerender({ branches: [] })
    expect(result.current.card).toEqual(feature)
    rerender({ branches: BRANCHES })
    expect(result.current.card).toEqual(feature)
  })
})
