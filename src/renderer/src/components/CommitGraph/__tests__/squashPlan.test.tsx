import { fireEvent, screen } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { squashPlanFor, headLine, type PlanCommit } from '../squashPlan'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #69 P2 — the selection folded into one commit. Nothing is rewritten from the
// graph: the interactive rebase opens with the plan made, the oldest picked
// and the rest squashed into it. The plan is refused, with its reason, where
// `git rebase -i` would do something else than "these, as one".

beforeAll(() => { (Element.prototype as any).scrollTo = jest.fn() })

const h = (c: string) => c.repeat(40)
// main: E (HEAD) ← D ← C ← B ← A (root); M is a merge on another line.
const LINE: PlanCommit[] = [
  { hash: h('e'), parents: [h('d')], message: 'e', refs: ['HEAD -> main'] },
  { hash: h('d'), parents: [h('c')], message: 'd' },
  { hash: h('c'), parents: [h('b')], message: 'c' },
  { hash: h('b'), parents: [h('a')], message: 'b' },
  { hash: h('a'), parents: [], message: 'a' },
  { hash: h('f'), parents: [h('b')], message: 'elsewhere', refs: ['topic'] },
]

describe('the plan', () => {
  test('HEAD\'s line is followed by first parents', () => {
    expect(headLine(LINE)).toEqual([h('e'), h('d'), h('c'), h('b'), h('a')])
  })

  test('a run folds into its oldest, rebased onto that one\'s parent', () => {
    const r = squashPlanFor(new Set([h('d'), h('b'), h('c')]), LINE)
    expect(r).toEqual({
      ok: true, base: h('a'),
      plan: [{ hash: h('b'), action: 'pick' }, { hash: h('c'), action: 'squash' }, { hash: h('d'), action: 'squash' }],
    })
  })

  test('refused, with a reason, where the rebase would not mean "these, as one"', () => {
    expect(squashPlanFor(new Set([h('e')]), LINE)).toEqual({ ok: false, reason: 'tooFew' })
    // A gap: C between them would take B's squash.
    expect(squashPlanFor(new Set([h('d'), h('b')]), LINE)).toEqual({ ok: false, reason: 'gap' })
    // Not on the checked-out line: a rebase rewrites HEAD's branch only.
    expect(squashPlanFor(new Set([h('f'), h('b')]), LINE)).toEqual({ ok: false, reason: 'notOnHead' })
    // Down to the root: nothing to rebase onto.
    expect(squashPlanFor(new Set([h('b'), h('a')]), LINE)).toEqual({ ok: false, reason: 'root' })
  })

  test('a merge anywhere the rebase replays is refused — above the run too', () => {
    const merged: PlanCommit[] = [
      { hash: h('e'), parents: [h('d'), h('f')], message: 'merge', refs: ['HEAD -> main'] },
      ...LINE.slice(1),
    ]
    expect(squashPlanFor(new Set([h('c'), h('b')]), merged)).toEqual({ ok: false, reason: 'merge' })
  })
})

describe('in the batch menu', () => {
  const commits = LINE.slice(0, 5).map(c => ({
    ...c, shortHash: c.hash.slice(0, 7), author: 'A', authorEmail: 'a@t', date: '2026-08-01T10:00:00', refs: c.refs ?? [],
  }))
  const draw = (over: Record<string, any> = {}) => {
    installMockGitAPI()
    const props = {
      commits, selectedHash: null, onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
      onCheckoutBranch: jest.fn(), onCherryPickMany: jest.fn(), onDropCommits: jest.fn(), onSquashCommits: jest.fn(),
      ...over,
    }
    renderWithProviders(<CommitGraph {...(props as any)} />)
    return props
  }
  const rows = () => Array.from(document.querySelectorAll('.cg-row'))
  const grip = (from: number, to: number) => {
    fireEvent.click(rows()[from])
    fireEvent.click(rows()[to], { shiftKey: true })
    fireEvent.contextMenu(rows()[from])
  }

  test('a run opens the rebase with its plan', () => {
    const p = draw()
    grip(0, 2)
    fireEvent.click(screen.getByText('Squash 3 Commits into One…'))
    expect(p.onSquashCommits).toHaveBeenCalledWith(h('b'), [
      { hash: h('c'), action: 'pick' }, { hash: h('d'), action: 'squash' }, { hash: h('e'), action: 'squash' },
    ])
  })

  test('a selection it cannot fold says why, and does nothing', () => {
    const p = draw()
    grip(3, 4)
    const row = screen.getByText('Squash: not down to the first commit')
    fireEvent.click(row)
    expect(p.onSquashCommits).not.toHaveBeenCalled()
  })

  test('a host that cannot open the rebase offers no squash at all', () => {
    draw({ onSquashCommits: undefined })
    grip(0, 2)
    expect(screen.queryByText(/Squash/)).not.toBeInTheDocument()
  })
})
