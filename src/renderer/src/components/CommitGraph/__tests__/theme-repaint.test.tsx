import { render, screen, act, waitFor } from '@testing-library/react'
import { useMemo } from 'react'
import { computeGraphLayout, resetThemeCache } from '../graph-layout'
import { SettingsProvider, useSettings } from '../../../contexts/SettingsContext'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { installMockGitAPI } from '../../../__tests__/test-utils'
import type { CommitNode } from '../../../types'

// The graph repaints when the theme does — #160, "the branch color takes too
// long to change".
//
// It was not slow. computeGraphLayout resolves the ten lane colours ONCE (a
// var() cannot be added to anything, and the graph does arithmetic on them to
// dim an edge) and bakes one into every commit it returns. CommitGraph memoises
// that layout on the commits, so a theme change repainted everything the CSS
// owns and left the graph's branches on the old palette — until a fetch, a
// commit or a reload moved the layout for another reason. Which, on a quiet
// repository, is a long time.
//
// The fix is one dependency. What is held here is the two halves of why that
// dependency is the right one: it changes when the theme does, and it does NOT
// change when an unrelated setting does — a graph of five hundred commits is
// not something to lay out again because an API key was typed.

const root = () => document.documentElement

function commits(): CommitNode[] {
  const c = (hash: string, parents: string[]): CommitNode => ({
    hash, shortHash: hash.slice(0, 7), message: hash, author: 'a', authorEmail: 'a@a',
    date: '2026-01-01', parents, refs: [],
  })
  return [c('c3', ['c2']), c('c2', ['c1']), c('c1', [])]
}

/** Paint the lanes of a theme onto <html>, the way a [data-theme] block does. */
function paintLanes(prefix: string) {
  for (let i = 1; i <= 10; i++) root().style.setProperty(`--lane-${i}`, `#${prefix}${i}${i}${i}${i}`)
}

afterEach(() => {
  for (let i = 1; i <= 10; i++) root().style.removeProperty(`--lane-${i}`)
  root().removeAttribute('data-theme')
  resetThemeCache()
})

describe('the colours the layout bakes in', () => {
  it('follow the tokens on <html>, once the cache is dropped', () => {
    paintLanes('aa')
    resetThemeCache()
    const before = computeGraphLayout(commits()).map(c => c.color)
    expect(before[0]).toMatch(/^#aa/)

    paintLanes('bb')
    resetThemeCache()
    const after = computeGraphLayout(commits()).map(c => c.color)
    expect(after[0]).toMatch(/^#bb/)
    expect(after).not.toEqual(before)
  })

  it('do NOT follow them while the cache stands — which is the whole bug', () => {
    // Dropping the cache is SettingsContext's job and it does it. What this
    // pins is that recomputing the layout is a second, separate requirement:
    // a fresh cache changes nothing on its own if nobody lays out again.
    paintLanes('aa')
    resetThemeCache()
    const before = computeGraphLayout(commits()).map(c => c.color)
    paintLanes('bb')                       // the theme changed…
    const stale = computeGraphLayout(commits()).map(c => c.color)
    expect(stale).toEqual(before)          // …and the layout did not notice
  })
})

/** Reads the context the way CommitGraph does, and says what it saw. */
function Probe() {
  const { appliedTheme, set, ready } = useSettings()
  // The same shape as CommitGraph's layout memo: expensive, and keyed on the
  // applied theme rather than on every setting.
  const laidOutFor = useMemo(() => appliedTheme, [appliedTheme])
  return (
    <div>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="applied">{appliedTheme}</span>
      <span data-testid="laid-out-for">{laidOutFor}</span>
      <button onClick={() => set('theme', 'one-dark-pro')}>change the theme</button>
      <button onClick={() => set('aiOpenaiKey', 'sk-something')}>change something else</button>
    </div>
  )
}

/**
 * Mounted AND settled. The provider reads settings.json asynchronously and
 * applies the appearance when the answer lands — click before that and the
 * load overwrites the click, which is a race in the test and not in the app,
 * where nobody can press a button during the first frame.
 */
async function draw() {
  installMockGitAPI()
  const r = render(<LanguageProvider><SettingsProvider><Probe /></SettingsProvider></LanguageProvider>)
  await waitFor(() => expect(screen.getByTestId('ready').textContent).toBe('true'))
  return r
}

const read = (id: string) => screen.getByTestId(id).textContent

describe('what the graph keys its layout on', () => {
  it('changes when the theme is changed', async () => {
    await draw()
    const before = read('laid-out-for')
    await act(async () => { screen.getByText('change the theme').click() })
    expect(read('applied')).toBe('one-dark-pro')
    expect(read('laid-out-for')).not.toBe(before)
  })

  it('does not change when a setting that is not about appearance is', async () => {
    await draw()
    await act(async () => { screen.getByText('change the theme').click() })
    const after = read('laid-out-for')
    await act(async () => { screen.getByText('change something else').click() })
    // React bails out when the value has not moved, so the memo holds and the
    // five-hundred-commit layout is not recomputed for an API key.
    expect(read('laid-out-for')).toBe(after)
  })

  it('is the RESOLVED theme, so it also moves where no setting does', async () => {
    // The panel follows the editor: <body>'s class changes, applyAppearance
    // runs, and no setting moves at all. Keying on the `theme` SETTING would
    // have left the panel's graph stale for good.
    await draw()
    await act(async () => { screen.getByText('change the theme').click() })
    expect(read('applied')).toBe(root().dataset.theme)
  })
})
