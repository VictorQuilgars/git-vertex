import { act, fireEvent, render } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { SettingsProvider } from '../../../contexts/SettingsContext'

// A click on a branch or tag chip opens its card (#258); the double-click
// still switches, and takes the card back. The card is the chip's, not the
// row's: a click on the row still just selects the commit.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })
beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const H = (c: string) => c.repeat(40)
const commits = [
  { hash: H('a'), refs: ['HEAD -> main'] },
  { hash: H('b'), refs: ['origin/feature'] },
  { hash: H('c'), refs: ['tag: v1.0.0'] },
  { hash: H('d'), refs: [] },
].map((c, i, all) => ({
  ...c, shortHash: c.hash.slice(0, 7), message: `commit ${i}`,
  author: 'Alice', authorEmail: 'alice@test.local', date: '2026-08-01T10:00:00',
  parents: i < all.length - 1 ? [all[i + 1].hash] : [],
}))

function draw(over: Record<string, any> = {}) {
  installMockGitAPI()
  const props = {
    commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
    onCheckoutBranch: jest.fn(), onOpenRef: jest.fn(), ...over,
  }
  renderWithProviders(<CommitGraph {...(props as any)} />)
  return props
}
const chip = (name: string) => Array.from(document.querySelectorAll('.ref-chip')).find(c => c.textContent?.includes(name)) as HTMLElement
const settle = () => act(() => { jest.advanceTimersByTime(300) })

describe('a click on a chip', () => {
  test('selects the chip\'s row at once, and opens its card a moment later', () => {
    const p = draw()
    fireEvent.click(chip('main'))
    expect(p.onSelectCommit).toHaveBeenCalledTimes(1)
    expect(p.onSelectCommit.mock.calls[0][0].hash).toBe(H('a'))
    expect(p.onOpenRef).not.toHaveBeenCalled()
    settle()
    expect(p.onOpenRef).toHaveBeenCalledWith({ kind: 'head', name: 'main', hash: H('a') })
  })

  test('a remote branch and a tag are named as git names them', () => {
    const p = draw()
    fireEvent.click(chip('feature')); settle()
    fireEvent.click(chip('v1.0.0')); settle()
    expect(p.onOpenRef.mock.calls.map((c: any[]) => c[0])).toEqual([
      { kind: 'remote', name: 'origin/feature', hash: H('b') },
      { kind: 'tag', name: 'v1.0.0', hash: H('c') },
    ])
  })

  test('a row already selected is not toggled off on the way to its card', () => {
    const p = draw({ selectedHash: H('a') })
    fireEvent.click(chip('main')); settle()
    expect(p.onSelectCommit).not.toHaveBeenCalled()
    expect(p.onOpenRef).toHaveBeenCalledTimes(1)
  })

  test('the double-click still switches — and no card opens behind it', () => {
    const p = draw()
    const c = chip('main')
    fireEvent.click(c); fireEvent.click(c); fireEvent.doubleClick(c)
    settle()
    expect(p.onCheckoutBranch).toHaveBeenCalledWith('main')
    expect(p.onOpenRef).not.toHaveBeenCalled()
  })

  test('the graph became another one before the card opened: nothing opens', () => {
    installMockGitAPI()
    const props = { commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main', onOpenRef: jest.fn() }
    const tree = (list: typeof commits) => (
      <LanguageProvider><SettingsProvider><CommitGraph {...({ ...props, commits: list } as any)} /></SettingsProvider></LanguageProvider>
    )
    const { rerender } = render(tree(commits))
    fireEvent.click(chip('main'))
    // Another repository's history takes the graph's place inside the quarter second.
    const other = commits.map((c, i) => ({ ...c, hash: H('e').slice(0, 39) + i, parents: [] }))
    act(() => { rerender(tree(other)) })
    settle()
    expect(props.onOpenRef).not.toHaveBeenCalled()
  })

  test('a click on the row is the row\'s: the commit, and no card', () => {
    const p = draw()
    fireEvent.click(document.querySelectorAll('.cg-row')[3].querySelector('.cg-col-msg')!)
    settle()
    expect(p.onSelectCommit.mock.calls[0][0].hash).toBe(H('d'))
    expect(p.onOpenRef).not.toHaveBeenCalled()
  })

  test('a ghost chip stands for its branch: the TIP is selected, and the card is the branch\'s', () => {
    const p = draw()
    // Row 3 has no ref of its own and wears the ghost of the line's nearest tip.
    const ghost = document.querySelectorAll('.cg-row')[3].querySelector('.ref-chip--ghost') as HTMLElement
    expect(ghost).toBeTruthy()
    fireEvent.click(ghost); settle()
    const opened = p.onOpenRef.mock.calls[0][0]
    expect(p.onSelectCommit.mock.calls[0][0].hash).toBe(opened.hash)
    expect(opened.hash).not.toBe(H('d'))
  })

  test('the chip whose card is open reads as pressed', () => {
    draw({ openRef: { kind: 'tag', name: 'v1.0.0' } })
    expect(chip('v1.0.0').className).toContain('ref-chip--open')
    expect(chip('v1.0.0').getAttribute('aria-pressed')).toBe('true')
    expect(chip('main').className).not.toContain('ref-chip--open')
  })

  test('a host that opens no card: a click on a chip does nothing, as before', () => {
    const p = draw({ onOpenRef: undefined })
    fireEvent.click(chip('main')); settle()
    expect(p.onSelectCommit).not.toHaveBeenCalled()
    expect(chip('main').getAttribute('aria-pressed')).toBeNull()
  })
})
