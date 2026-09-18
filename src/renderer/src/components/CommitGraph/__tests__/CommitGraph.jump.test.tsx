import { fireEvent } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The keyboard reaches the rows that matter without a mouse: `h` is HEAD,
// `u` its upstream, `w` the working changes, Home and End the ends of the
// page. And one Escape closes one thing — a menu anyone opened over the
// graph owns the key before the selection does.

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const HASHES = [
  'aaaa111aaaa111aaaa111aaaa111aaaa111aaaa1',
  'bbbb222bbbb222bbbb222bbbb222bbbb222bbbb2',
  'cccc333cccc333cccc333cccc333cccc333cccc3',
]
const commits = HASHES.map((hash, i) => ({
  hash,
  shortHash: hash.slice(0, 7),
  message: `commit ${i}`,
  author: 'Alice', authorEmail: 'alice@test.local',
  date: '2026-08-01T10:00:00',
  parents: i < HASHES.length - 1 ? [HASHES[i + 1]] : [],
  refs: i === 0 ? ['HEAD -> main'] : i === 1 ? ['origin/main'] : [],
}))

function draw(over: Record<string, any> = {}) {
  installMockGitAPI()
  const props = {
    commits, selectedHash: null,
    onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
    onCheckoutBranch: jest.fn(),
    upstreamRef: 'origin/main',
    ...over,
  }
  renderWithProviders(<CommitGraph {...(props as any)} />)
  return props
}
const press = (key: string) => fireEvent.keyDown(window, { key })
const selected = (p: { onSelectCommit: jest.Mock }) => p.onSelectCommit.mock.calls.map(c => c[0].hash)

describe('jumping with the keyboard', () => {
  test('h goes to HEAD, u to its upstream', () => {
    const p = draw()
    press('h'); press('u')
    expect(selected(p)).toEqual([HASHES[0], HASHES[1]])
  })

  test('Home and End reach the ends of the page', () => {
    const p = draw()
    press('End'); press('Home')
    expect(selected(p)).toEqual([HASHES[2], HASHES[0]])
  })

  test('w is the working changes when the graph shows them, HEAD otherwise', () => {
    const p = draw({ alwaysShowWip: true })
    press('w')
    expect(selected(p)).toEqual(['__WIP__'])
    const q = draw()
    press('w')
    expect(selected(q)).toEqual([HASHES[0]])
  })

  test('a chord is not a jump, and typing is not either', () => {
    const p = draw()
    fireEvent.keyDown(window, { key: 'h', ctrlKey: true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    press('h')
    expect(p.onSelectCommit).not.toHaveBeenCalled()
    input.remove()
  })

  test('without an upstream, u does nothing', () => {
    const p = draw({ upstreamRef: null })
    press('u')
    expect(p.onSelectCommit).not.toHaveBeenCalled()
  })
})

describe('one Escape closes one thing', () => {
  test('with a menu open over the graph, Escape leaves the selection alone', () => {
    const p = draw({ selectedHash: HASHES[0] })
    const menu = document.createElement('div')
    menu.className = 'ctx-menu'
    document.body.appendChild(menu)
    press('Escape')
    expect(p.onSelectCommit).not.toHaveBeenCalled()
    menu.remove()
    press('Escape')
    expect(selected(p)).toEqual([HASHES[0]])
  })
})
