import { screen } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// The panel's two shapes, decided on the graph's own width (`listBelow`): a
// list of two-line rows beside the details, and — with the width, the details
// under the graph — a table: one line per commit, the refs before the message,
// the author, the date and the sha in columns.

const C = (hash: string, message: string, parents: string[], refs: string[]) => ({
  hash, shortHash: hash, message, parents, refs,
  author: 'Ada', authorEmail: 'ada@x.dev', date: '2026-09-02',
})
const COMMITS = [
  C('aaa1111', 'tip', ['bbb2222'], ['HEAD -> main', 'tag: v2.0.0']),
  C('bbb2222', 'below the tip', [], []),
]

let width = 0
// jsdom measures nothing: the graph's body says the width the test asks for.
// An own property on HTMLElement's prototype, over the one jsdom keeps on
// Element's — so taking it away again restores jsdom's.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) { return this.classList?.contains('cg-body') ? width : 0 },
  })
})
afterAll(() => { delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth })

function draw(w: number) {
  width = w
  installMockGitAPI()
  return renderWithProviders(
    <CommitGraph commits={COMMITS as any} selectedHash={null} onSelectCommit={() => {}}
      searchQuery="" currentBranch="main" listBelow={520} {...({} as any)} />
  )
}
const row = (message: string) => screen.getByText(message).closest('.cg-row') as HTMLElement

describe('the panel graph, as wide as a table', () => {
  test('one line per commit: the refs before the message, the sha in its column', async () => {
    draw(900)
    await screen.findByText('tip')
    const tip = row('tip')
    expect(tip.classList.contains('cg-row--grouped')).toBe(true)
    expect(tip.classList.contains('cg-row--stacked')).toBe(false)
    expect(tip.querySelector('.cg-row-meta')).toBeNull()
    const line = tip.querySelector('.cg-msg-line')!
    expect(line.firstElementChild!.className).toContain('cg-meta-refs')
    expect(line.querySelector('.mchip')).toHaveTextContent('main')
    expect(tip.querySelector('.cg-col-sha')).toHaveTextContent('aaa1111')
    // no refs column: the refs are with the message
    expect(tip.querySelector('.cg-refs-col')).toBeNull()
  })

  test('its header names the columns, and no refs column', async () => {
    draw(900)
    await screen.findByText('tip')
    expect(document.querySelector('.cg-header')).not.toBeNull()
    expect(document.querySelector('.cg-h-refs')).toBeNull()
    expect(document.querySelector('.cg-h-sha')).not.toBeNull()
  })

  // On one line an inherited name would take its place on every row.
  test('a row whose branch is only inherited carries no ghost', async () => {
    draw(900)
    await screen.findByText('below the tip')
    expect(row('below the tip').querySelector('.cg-meta-refs')).toBeNull()
  })

  test('narrower than the threshold, the same graph is a list', async () => {
    draw(400)
    await screen.findByText('tip')
    const tip = row('tip')
    expect(tip.classList.contains('cg-row--stacked')).toBe(true)
    expect(tip.querySelector('.cg-row-meta')).not.toBeNull()
    expect(document.querySelector('.cg-header')).toBeNull()
  })
})
