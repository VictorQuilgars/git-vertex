import { fireEvent, screen } from '@testing-library/react'
import CommitGraph from '../CommitGraph'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// #69 — the graph holds a SET, not just a subject. Shift-click takes a range,
// ctrl/cmd-click toggles one row, and a right-click inside the set opens the
// batch menu — cherry-pick and drop hand their hashes OLDEST first, since
// that is the order a pick applies and a drop sequence reads.

// jsdom draws nothing and scrolls nothing — the scroll-into-view effect that
// follows a selected hash needs the method to exist, not to work.
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
  refs: i === 0 ? ['HEAD -> main'] : [],
}))

function draw(over: Record<string, any> = {}) {
  installMockGitAPI()
  const props = {
    commits, selectedHash: null,
    onSelectCommit: jest.fn(), searchQuery: '', currentBranch: 'main',
    onCheckoutBranch: jest.fn(),
    onCherryPickMany: jest.fn(), onDropCommits: jest.fn(),
    onOpenCommitOnRemote: jest.fn(),
    ...over,
  }
  renderWithProviders(<CommitGraph {...(props as any)} />)
  return props
}

const rows = () => Array.from(document.querySelectorAll('.cg-row'))
const inSet = () => Array.from(document.querySelectorAll('.cg-multisel'))

describe('holding several commits', () => {
  test('shift-click takes the range from the anchor', () => {
    draw()
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[2], { shiftKey: true })
    expect(inSet()).toHaveLength(3)
  })

  test('ctrl/cmd-click toggles a row, seeding from the selected one', () => {
    draw({ selectedHash: HASHES[0] })
    fireEvent.click(rows()[2], { metaKey: true })
    // the single selection joined the set, so the grip grows FROM it
    expect(inSet()).toHaveLength(2)
    fireEvent.click(rows()[2], { metaKey: true })
    expect(inSet()).toHaveLength(1)
  })

  test('a plain click is single-minded again', () => {
    draw()
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[2], { shiftKey: true })
    fireEvent.click(rows()[1])
    expect(inSet()).toHaveLength(0)
  })

  test('Escape lets go of the set before anything else', () => {
    draw()
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[2], { shiftKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(inSet()).toHaveLength(0)
  })
})

describe('the batch menu', () => {
  const grip = () => {
    const p = draw()
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[2], { shiftKey: true })
    fireEvent.contextMenu(rows()[1])
    return p
  }

  test('it names its count, and only opens inside the set', () => {
    grip()
    expect(screen.getByText('3 commits selected')).toBeInTheDocument()
  })

  test('cherry-pick hands the hashes oldest first', () => {
    const p = grip()
    fireEvent.click(screen.getByText('Cherry-pick 3 Commits'))
    expect(p.onCherryPickMany).toHaveBeenCalledWith([HASHES[2], HASHES[1], HASHES[0]])
  })

  test('drop hands the same order, in one call', () => {
    const p = grip()
    fireEvent.click(screen.getByText('Drop 3 Commits…'))
    expect(p.onDropCommits).toHaveBeenCalledWith([HASHES[2], HASHES[1], HASHES[0]])
  })

  test('a right-click outside the set is the end of the set', () => {
    draw()
    fireEvent.click(rows()[0])
    fireEvent.click(rows()[1], { shiftKey: true })
    fireEvent.contextMenu(rows()[2])
    expect(screen.queryByText(/commits selected/)).not.toBeInTheDocument()
    expect(inSet()).toHaveLength(0)
  })
})
