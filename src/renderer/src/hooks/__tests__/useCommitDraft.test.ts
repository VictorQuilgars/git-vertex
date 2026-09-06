import { act, renderHook } from '@testing-library/react'
import { useCommitDraft } from '../useCommitDraft'

beforeEach(() => localStorage.clear())

test('a draft survives leaving the form and stays isolated per repository', () => {
  const first = renderHook(() => useCommitDraft('/repos/one'))
  act(() => first.result.current.setMessage('Fix the navigation'))
  first.unmount()
  const other = renderHook(() => useCommitDraft('/repos/two'))
  expect(other.result.current.message).toBe('')
  act(() => other.result.current.setMessage('Other work'))
  other.unmount()
  const restored = renderHook(() => useCommitDraft('/repos/one'))
  expect(restored.result.current.message).toBe('Fix the navigation')
  act(() => restored.result.current.clear())
  restored.unmount()
  const cleared = renderHook(() => useCommitDraft('/repos/one'))
  expect(cleared.result.current.message).toBe('')
})

test('amending does not overwrite the normal commit draft', () => {
  const view = renderHook(() => useCommitDraft('/repo'))
  act(() => view.result.current.setMessage('Next commit'))
  act(() => view.result.current.update(prev => ({ ...prev, amend: true, amendMessage: 'Previous commit' })))
  act(() => view.result.current.setMessage('Reworded previous commit'))
  act(() => view.result.current.update(prev => ({ ...prev, amend: false })))
  expect(view.result.current.message).toBe('Next commit')
  expect(view.result.current.draft.amendMessage).toBe('Reworded previous commit')
})

test('invalid stored content does not break the commit form', () => {
  localStorage.setItem('gv-commit-draft:/repo', '{broken')
  const view = renderHook(() => useCommitDraft('/repo'))
  expect(view.result.current.message).toBe('')
})
