import { act, fireEvent } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'
import { LanguageProvider } from '../../../i18n/LanguageContext'
import { SettingsProvider } from '../../../contexts/SettingsContext'

// `/` opens a type-ahead over the graph (#252): the graph goes to the best
// match as it is typed, ↑↓ walk the others, Enter takes it — loading the
// history down to it when its tip is not on the page.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const H = (c: string) => c.repeat(40)
const commits = [
  { hash: H('a'), refs: ['HEAD -> main', 'origin/main'] },
  { hash: H('b'), refs: ['feature/login'] },
  { hash: H('c'), refs: ['tag: v1.0.0'] },
  { hash: H('d'), refs: ['feature/logout'] },
].map((c, i, all) => ({
  ...c, shortHash: c.hash.slice(0, 7), message: `commit ${i}`,
  author: 'Alice', authorEmail: 'alice@test.local', date: '2026-08-01T10:00:00',
  parents: i < all.length - 1 ? [all[i + 1].hash] : [],
}))
const branch = (name: string, over: Record<string, unknown> = {}) =>
  ({ name, current: false, remote: false, commit: name.slice(0, 7), label: '', ...over })
const branches = [
  branch('main', { current: true, commit: 'same' }),
  branch('remotes/origin/main', { remote: true, commit: 'same' }),
  branch('feature/login'), branch('feature/logout'),
  // On no loaded row: three pages down.
  branch('feature/ancient', { date: 100 }),
]

function draw(over: Record<string, any> = {}) {
  installMockGitAPI({ listWorktrees: jest.fn().mockResolvedValue({ worktrees: [] }) } as any)
  const props = {
    commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
    branches, tags: [{ name: 'v1.0.0' }], onRevealRef: jest.fn(),
    ...over,
  }
  const view = renderWithProviders(<CommitGraph {...(props as any)} />)
  return { props, ...view }
}
const finder = () => document.querySelector('.cg-reffind') as HTMLElement
const input = () => document.querySelector('.cg-reffind-input') as HTMLInputElement
const isOpen = () => !finder().classList.contains('cg-reffind--closed')
const type = async (text: string) => { await act(async () => { fireEvent.change(input(), { target: { value: text } }) }) }
const open = async () => { await act(async () => { fireEvent.keyDown(window, { key: '/' }) }) }
const hit = () => document.querySelector('.cg-row--find-hit')?.textContent ?? null

describe('the `/` finder', () => {
  test('`/` opens it with the focus in its field — also where `/` is a shifted key', async () => {
    draw()
    expect(isOpen()).toBe(false)
    await act(async () => { fireEvent.keyDown(window, { key: '/', shiftKey: true }) })
    expect(isOpen()).toBe(true)
    expect(document.activeElement).toBe(input())
  })

  test('the key is ignored while typing in a field, and under a chord', async () => {
    draw()
    const field = document.createElement('input')
    document.body.appendChild(field)
    field.focus()
    await open()
    expect(isOpen()).toBe(false)
    field.remove()
    await act(async () => { fireEvent.keyDown(window, { key: '/', ctrlKey: true }) })
    expect(isOpen()).toBe(false)
  })

  test('typing takes the graph to the best match, without selecting it', async () => {
    const { props } = draw()
    await open()
    await type('logi')
    expect(hit()).toContain('commit 1')
    expect(document.querySelector('.cg-reffind-hit')?.textContent).toBe('feature/login')
    expect(props.onSelectCommit).not.toHaveBeenCalled()
  })

  test('↓ and ↑ walk the matches in the graph\'s order, and wrap', async () => {
    draw()
    await open()
    await type('feature/log')
    expect(document.querySelector('.cg-reffind-nav')?.textContent).toBe('↑↓ 1 of 2')
    await act(async () => { fireEvent.keyDown(input(), { key: 'ArrowDown' }) })
    expect(hit()).toContain('commit 3')
    expect(document.querySelector('.cg-reffind-nav')?.textContent).toBe('↑↓ 2 of 2')
    await act(async () => { fireEvent.keyDown(input(), { key: 'ArrowDown' }) })
    expect(hit()).toContain('commit 1')
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true }) })
    expect(hit()).toContain('commit 3')
  })

  test('Enter takes the match as the selection and closes the finder', async () => {
    const { props } = draw()
    await open()
    await type('v1')
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    expect(props.onSelectCommit).toHaveBeenCalledTimes(1)
    expect(props.onSelectCommit.mock.calls[0][0].hash).toBe(H('c'))
    expect(isOpen()).toBe(false)
    expect(hit()).toBeNull()
  })

  test('a tip beyond the page is asked of the host, and the finder waits for it', async () => {
    const { props, rerender } = draw()
    await open()
    await type('ancient')
    const shown = document.querySelector('.cg-reffind-hit') as HTMLElement
    expect(shown.className).toContain('cg-reffind-hit--unloaded')
    expect(shown.title).toContain('not loaded, press Enter to fetch it')
    expect(hit()).toBeNull()

    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    expect(props.onRevealRef).toHaveBeenCalledWith('feature/ancient')
    expect(props.onSelectCommit).not.toHaveBeenCalled()
    expect(isOpen()).toBe(true)
    // Enter again while it loads asks nothing more.
    await act(async () => { fireEvent.keyDown(input(), { key: 'Enter' }) })
    expect(props.onRevealRef).toHaveBeenCalledTimes(1)

    // The page grew and the tip is on it: the host selected it, the finder is done.
    const grown = [...commits.slice(0, 3), { ...commits[3], parents: [H('e')] }, {
      ...commits[3], hash: H('e'), shortHash: 'eeeeeee', message: 'commit 4', refs: ['feature/ancient'], parents: [],
    }]
    await act(async () => {
      rerender(<LanguageProvider><SettingsProvider><CommitGraph {...({ ...props, commits: grown } as any)} /></SettingsProvider></LanguageProvider>)
    })
    expect(isOpen()).toBe(false)
  })

  test('nothing matches: the text says so, and nothing is lit', async () => {
    draw()
    await open()
    await type('zzz')
    expect(input().className).toContain('cg-reffind-input--empty')
    expect(document.querySelector('.cg-reffind-result')).toBeNull()
    expect(hit()).toBeNull()
  })

  test('Escape closes it, keeps what was typed for the next time, and leaves the selection alone', async () => {
    const { props } = draw({ selectedHash: H('b') })
    await open()
    await type('main')
    await act(async () => { fireEvent.keyDown(input(), { key: 'Escape' }) })
    expect(isOpen()).toBe(false)
    expect(props.onSelectCommit).not.toHaveBeenCalled()
    await open()
    expect(input().value).toBe('main')
  })

  test('open but not holding the focus, Escape still closes it first', async () => {
    const { props } = draw({ selectedHash: H('b') })
    await open()
    input().blur()
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(isOpen()).toBe(false)
    expect(props.onSelectCommit).not.toHaveBeenCalled()
  })

  test('the header menu offers it to a hand that is on the mouse', async () => {
    draw()
    await act(async () => { fireEvent.contextMenu(document.querySelector('.cg-header')!) })
    const entry = Array.from(document.querySelectorAll('.ctx-menu *')).find(el => el.textContent === 'Find a Branch, Tag, or Worktree…')
    expect(entry).toBeTruthy()
  })
})
