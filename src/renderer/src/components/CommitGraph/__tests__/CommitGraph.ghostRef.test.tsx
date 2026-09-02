import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #173 — a commit's branch was only readable at the branch's tip. A row with
// no ref of its own now wears the name of the line it belongs to — the owner
// tip's branch — as a GHOST chip: dashed, faded, shown by the stylesheet on
// hover and on the selected row (which jsdom does not apply). What IS
// testable: which name a row wears, that the tip row itself is no ghost, that
// a tag never leads, and that the tip's other refs open behind the ghost.

const C = (hash: string, message: string, parents: string[], refs: string[]) => ({
  hash, shortHash: hash, message, parents, refs,
  author: 'V', authorEmail: 'v@x.dev', date: '2026-09-02',
})
const COMMITS = [
  C('aaa1111', 'tip', ['bbb2222'], ['tag: v2.0.0', 'HEAD -> main']),
  C('bbb2222', 'below the tip', ['ccc3333'], []),
  C('ddd4444', 'a release', ['eee5555'], ['tag: v1.0.0']),
  C('eee5555', 'under a tag', ['ccc3333'], []),
  C('ccc3333', 'root', [], []),
]

function render(selectedHash: string | null = null, extra: Record<string, any> = {}) {
  installMockGitAPI()
  // A selected row is scrolled into view; jsdom has no scrollTo.
  ;(Element.prototype as any).scrollTo = () => {}
  return renderWithProviders(
    <CommitGraph commits={COMMITS as any} selectedHash={selectedHash}
      onSelectCommit={() => {}} searchQuery="" currentBranch="main" {...extra} />
  )
}
const row = (message: string) => screen.getByText(message).closest('.cg-row') as HTMLElement

describe('the ghost ref — which line a commit is on', () => {
  test('a row below a tip wears the tip\'s branch, faded; the tip wears its own', async () => {
    render()
    await screen.findByText('below the tip')
    const ghost = row('below the tip').querySelector('.cg-refs-chips--ghost')!
    expect(ghost).toBeTruthy()
    expect(within(ghost as HTMLElement).getByText('main')).toBeInTheDocument()
    expect(ghost.querySelector('.ref-chip--ghost')).toBeTruthy()
    // the whole line, down to the root, says the same name
    expect(within(row('root').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
    // the tip row's chip is the real thing
    const tip = row('tip').querySelector('.cg-refs-chips')!
    expect(tip.classList.contains('cg-refs-chips--ghost')).toBe(false)
    expect(tip.querySelector('.ref-chip--ghost')).toBeNull()
  })

  test('a tag-only tip names nothing', async () => {
    render()
    await screen.findByText('under a tag')
    expect(row('under a tag').querySelector('.cg-refs-chips--ghost')).toBeNull()
    expect(row('a release').querySelector('.ref-chip--ghost')).toBeNull()
  })

  test('the tip\'s other refs open behind the ghost', async () => {
    render()
    await screen.findByText('below the tip')
    const ghost = row('below the tip').querySelector('.cg-refs-chips--ghost') as HTMLElement
    expect(within(ghost).getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('v2.0.0')).not.toBeInTheDocument()
    await userEvent.hover(ghost)
    expect(await screen.findByText('v2.0.0')).toBeInTheDocument()
  })

  // The working-changes node sits on top of HEAD's line and owns it, and it
  // carries no ref — the first real graph showed 147 rows with nothing to say.
  test('with working changes on top, HEAD\'s line is still named by HEAD\'s branch', async () => {
    render(null, { wipCount: 2, alwaysShowWip: true })
    await screen.findByText('below the tip')
    expect(within(row('below the tip').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
    // the tip itself, now owned by the node above it, wears its own ref and no ghost
    expect(row('tip').querySelector('.ref-chip--ghost')).toBeNull()
  })

  test('the selected row keeps the ghost in the same slot', async () => {
    render('bbb2222')
    await screen.findByText('below the tip')
    const r = row('below the tip')
    expect(r.classList.contains('cg-selected')).toBe(true)
    expect(r.querySelector('.cg-refs-chips--ghost .ref-chip--ghost')).toBeTruthy()
  })
})
