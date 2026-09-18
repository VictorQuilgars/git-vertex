import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SettingsProvider, useSettings, DRAFT_THEME_ID } from '../../../contexts/SettingsContext'
import { installMockGitAPI } from '../../../__tests__/test-utils'

// The live draft (#242): while the builder is open, <html> points at a rule
// of the draft's own; every change moves `appliedTheme`, so the graph
// relayouts; closing puts the setting's theme back and takes the rule away.

const SEEDS = { canvas: '#101010', accent: '#3FD8C2' }

function setup() {
  installMockGitAPI({
    settingsGetAll: jest.fn().mockResolvedValue({ theme: 'aqua-dark' }),
    settingsSet: jest.fn(),
    themesInstalled: jest.fn().mockResolvedValue({ themes: [] }),
  })
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>
  return renderHook(() => useSettings(), { wrapper })
}

test('a draft is painted under its own id, and each change moves the applied theme', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.ready).toBe(true))
  act(() => result.current.previewSeeds(SEEDS))
  expect(document.documentElement.dataset.theme).toBe(DRAFT_THEME_ID)
  expect(document.getElementById('gv-theme-draft')?.textContent).toContain('--seed-canvas:#101010')
  const first = result.current.appliedTheme
  expect(first.startsWith(DRAFT_THEME_ID)).toBe(true)
  act(() => result.current.previewSeeds({ ...SEEDS, canvas: '#202020' }))
  expect(result.current.appliedTheme).not.toBe(first)
  expect(document.getElementById('gv-theme-draft')?.textContent).toContain('--seed-canvas:#202020')
})

test('null puts the setting\'s theme back and removes the rule', async () => {
  const { result } = setup()
  await waitFor(() => expect(result.current.ready).toBe(true))
  act(() => result.current.previewSeeds(SEEDS))
  act(() => result.current.previewSeeds(null))
  expect(document.documentElement.dataset.theme).toBe('aqua-dark')
  expect(document.getElementById('gv-theme-draft')).toBeNull()
  expect(result.current.appliedTheme).toBe('aqua-dark')
})
