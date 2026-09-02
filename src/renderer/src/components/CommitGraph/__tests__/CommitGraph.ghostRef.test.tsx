import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #173 — a commit's branch was only readable at the branch's tip. A row with
// no ref of its own now wears the name of the nearest branch that holds it —
// on its own line first, by containment otherwise — as a GHOST chip: dashed,
// faded, shown by the stylesheet on hover and on the selected row (which jsdom
// does not apply). What IS testable: which name a row wears, that the tip row
// itself is no ghost, that a tag never leads, and that the tip's other refs
// open behind the ghost.

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
    // and the ghost stays visible under its open panel, whatever the pointer does
    expect(ghost.classList.contains('cg-refs-chips--open')).toBe(true)
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

// The rule, on the shape the first real graph had: a branch merged into main
// and then deleted — its commits belong to main now, and say so — and a
// branch three rows above main that also holds everything main holds, which
// must not steal main's name from the commits under main's tip.
const MERGED = [
  C('f000000', 'feat tip', ['t000000'], ['HEAD -> feat']),
  C('t000000', 'between', ['m000000'], []),
  C('m000000', 'main tip', ['g000000'], ['main', 'origin/main']),
  C('g000000', 'merge', ['b000000', 'x200000'], []),
  C('x200000', 'branch second', ['x100000'], []),
  C('x100000', 'branch first', ['b000000'], []),
  C('b000000', 'base', [], []),
]

describe('the ghost ref — the nearest branch that holds the commit', () => {
  const draw = () => {
    installMockGitAPI()
    ;(Element.prototype as any).scrollTo = () => {}
    return renderWithProviders(
      <CommitGraph commits={MERGED as any} selectedHash={null}
        onSelectCommit={() => {}} searchQuery="" currentBranch="feat" />
    )
  }

  test('a merged branch whose ref is gone is named after the branch it landed in', async () => {
    draw()
    await screen.findByText('branch first')
    expect(within(row('branch first').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
    expect(within(row('branch second').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
    expect(within(row('merge').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
    expect(within(row('base').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('main')).toBeInTheDocument()
  })

  test('a tip on the same line wins, and the nearest one: between the two tips it is feat, under main it is main', async () => {
    draw()
    await screen.findByText('between')
    expect(within(row('between').querySelector('.cg-refs-chips--ghost') as HTMLElement).getByText('feat')).toBeInTheDocument()
    expect(within(row('base').querySelector('.cg-refs-chips--ghost') as HTMLElement).queryByText('feat')).toBeNull()
  })
})
