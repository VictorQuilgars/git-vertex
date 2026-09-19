import { act, renderHook } from '@testing-library/react'
import { useRefCard } from '../useRefCard'

// The host's side of a chip's card: the same chip again closes it, another
// takes its place, and a selection that leaves the tip closes it on its own.

const main = { kind: 'head' as const, name: 'main', hash: 'aaa' }
const tag = { kind: 'tag' as const, name: 'main', hash: 'aaa' }

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
