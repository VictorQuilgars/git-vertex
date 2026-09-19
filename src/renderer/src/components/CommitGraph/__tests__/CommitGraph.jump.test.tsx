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

/** `feature` checked out, one commit ahead of `main`; its upstream one behind. */
const FEATURE = 'ffff000ffff000ffff000ffff000ffff000ffff0'
const withFeature = [
  { ...commits[0], hash: FEATURE, shortHash: FEATURE.slice(0, 7), message: 'feature work', parents: [HASHES[0]], refs: ['HEAD -> feature'] },
  { ...commits[0], refs: ['main'] },
  { ...commits[1], refs: ['origin/feature'] },
  commits[2],
]

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

  // ── The merge target (#253) ──
  test('t goes to the tip of the branch this one merges into', () => {
    const p = draw({ currentBranch: 'feature', mergeTargetRef: 'main', commits: withFeature })
    press('t')
    expect(selected(p)).toEqual([HASHES[0]])
  })

  test('a target that only exists on a remote is found there', () => {
    const p = draw({ currentBranch: 'feature', mergeTargetRef: 'develop', remoteNames: ['origin'],
      commits: withFeature.map(c => c.hash === HASHES[2] ? { ...c, refs: ['origin/develop'] } : c) })
    press('t')
    expect(selected(p)).toEqual([HASHES[2]])
  })

  test('a target beyond the page is asked of the host, which grows the page to it', () => {
    const onRevealRef = jest.fn()
    const p = draw({ currentBranch: 'feature', mergeTargetRef: 'release', onRevealRef, commits: withFeature })
    press('t')
    expect(onRevealRef).toHaveBeenCalledWith('release')
    expect(p.onSelectCommit).not.toHaveBeenCalled()
  })

  test('an upstream beyond the page is reached the same way', () => {
    const onRevealRef = jest.fn()
    draw({ upstreamRef: 'origin/gone-far', onRevealRef })
    press('u')
    expect(onRevealRef).toHaveBeenCalledWith('origin/gone-far')
  })

  test('with no target nothing happens — and a screen reader is told why', () => {
    const onRevealRef = jest.fn()
    const p = draw({ mergeTargetRef: null, onRevealRef })
    press('t')
    expect(p.onSelectCommit).not.toHaveBeenCalled()
    expect(onRevealRef).not.toHaveBeenCalled()
    expect(document.querySelector('.cg-sr-live')?.textContent).toBe('No merge target for this branch.')
  })
})

describe('the rows a branch is read against are marked', () => {
  // A mark is a sibling of the graph, not a child of its row: `data-hash` says whose it is.
  const messageOf = (list: typeof commits, hash: string | undefined) => list.find(c => c.hash === hash)?.message ?? ''
  const marks = (list: typeof commits = commits) => Array.from(document.querySelectorAll<HTMLElement>('.cg-marker-rail')).map(m => ({
    roles: m.dataset.roles, row: messageOf(list, m.dataset.hash), title: m.title,
  }))

  test('HEAD, its upstream and the merge target each wear their own mark, on their own row only', () => {
    draw({ currentBranch: 'feature', mergeTargetRef: 'main', upstreamRef: 'origin/feature', commits: withFeature })
    const found = marks(withFeature as any)
    expect(found.map(m => m.roles)).toEqual(['head', 'target', 'upstream'])
    expect(found[0].row).toBe('feature work')
    expect(found[1].row).toBe('commit 0')
    expect(found[1].title).toBe('Merge Target (main)')
    expect(found[2].title).toBe('Upstream Tip')
    expect(document.querySelector('.cg-marker-seg.cg-marker--target .cg-marker-label')?.textContent).toBe('Target')
  })

  test('a row that is two of them wears one mark, split', () => {
    draw()
    // HEAD on row 0, its upstream on row 1 — then level:
    expect(marks().map(m => m.roles)).toEqual(['head', 'upstream'])
    document.body.innerHTML = ''
    draw({ commits: commits.map((c, i) => i === 0 ? { ...c, refs: ['HEAD -> main', 'origin/main'] } : { ...c, refs: [] }) })
    const level = marks()
    expect(level.map(m => m.roles)).toEqual(['head upstream'])
    expect(level[0].title).toBe('HEAD (Current Branch Tip), Upstream Tip')
    expect(document.querySelectorAll('.cg-marker-swatch')).toHaveLength(2)
    expect(document.querySelectorAll('.cg-marker-band')).toHaveLength(1)
  })

  test('no target\'s mark on HEAD\'s own row, and none at all without a target', () => {
    draw({ mergeTargetRef: null })
    expect(marks().some(m => m.roles?.includes('target'))).toBe(false)
    document.body.innerHTML = ''
    // The branch has just been cut from main: both names on one commit.
    draw({ currentBranch: 'feature', mergeTargetRef: 'main',
      commits: commits.map((c, i) => i === 0 ? { ...c, refs: ['HEAD -> feature', 'main'] } : { ...c, refs: [] }) })
    expect(marks().map(m => m.roles)).toEqual(['head'])
  })

  // What the first cut got wrong, pinned: a row is a stacking context UNDER the
  // graph, so a mark inside it opened beneath the node; and a band as tall as
  // the row sat beside a lane band that is not.
  test('the bar and its pill stack above the graph, the band under everything it draws', () => {
    draw({ currentBranch: 'feature', mergeTargetRef: 'main', commits: withFeature })
    const rail = document.querySelector('.cg-marker-rail')!
    expect(rail.closest('.cg-row')).toBeNull()
    expect(rail.parentElement).toBe(document.querySelector('.cg-scroll-content'))
    // The hit zone comes first, so the pill paints over it and keeps its hover.
    expect(rail.previousElementSibling?.className).toBe('cg-marker-hit')
    const svg = document.querySelector('.cg-graph-svg')!
    const band = svg.querySelector('.cg-marker-band')!
    expect(svg.firstElementChild).toBe(band)
  })

  test('the band is the lane band\'s own height and place, and ends at the node\'s centre', () => {
    draw({ currentBranch: 'feature', mergeTargetRef: 'main', commits: withFeature })
    const band = document.querySelector('.cg-marker-band--head')!
    const lane = document.querySelector('.cg-graph-svg g rect')!   // the first row's lane band
    expect(band.getAttribute('height')).toBe(lane.getAttribute('height'))
    expect(band.getAttribute('y')).toBe(lane.getAttribute('y'))
    // It stops where the lane band starts: the node's centre.
    expect(Number(band.getAttribute('x')) + Number(band.getAttribute('width'))).toBe(Number(lane.getAttribute('x')))
  })

  test('the hover zone stops short of the node, and a click on the mark selects its row', () => {
    const p = draw({ currentBranch: 'feature', mergeTargetRef: 'main', commits: withFeature })
    const hit = document.querySelector<HTMLElement>('.cg-marker-hit')!
    const band = document.querySelector('.cg-marker-band--head')!
    const nodeCentre = Number(band.getAttribute('x')) + Number(band.getAttribute('width'))
    expect(parseFloat(hit.style.width)).toBeLessThan(nodeCentre - 13)
    fireEvent.click(document.querySelectorAll('.cg-marker-rail')[1])
    expect(selected(p)).toEqual([HASHES[0]])
  })

  test('in the panel\'s stacked rows the mark is the whole row\'s height', () => {
    draw({ currentBranch: 'feature', mergeTargetRef: 'main', commits: withFeature, refsBelow: true })
    const rail = document.querySelector<HTMLElement>('.cg-marker-rail')!
    const row = document.querySelector<HTMLElement>('.cg-row:not(.cg-row-wip)')!
    expect(rail.style.height).toBe(row.style.height)
    expect(rail.style.top).toBe(row.style.top)
  })
})

describe('the key sheet', () => {
  test('? opens it, and it lists t beside h, u and w', () => {
    draw()
    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    const sheet = document.querySelector('.cg-keys')!
    expect(sheet).toBeTruthy()
    const goTo = Array.from(sheet.querySelectorAll('.cg-keys-group')).find(g => g.textContent?.startsWith('Go to'))!
    expect(Array.from(goTo.querySelectorAll('kbd')).map(k => k.textContent)).toEqual(['w', 'h', 'u', 't'])
    expect(goTo.textContent).toContain('Merge target')
  })

  test('every jump key the graph handles is on the sheet', () => {
    const src = require('fs').readFileSync('src/renderer/src/components/CommitGraph/CommitGraph.tsx', 'utf8')
    const handled = /const JUMPS = new Set\(\[([^\]]+)\]\)/.exec(src)![1].split(',').map((k: string) => k.trim().replace(/'/g, ''))
    const { GRAPH_SHORTCUTS } = require('../GraphShortcuts')
    const listed = GRAPH_SHORTCUTS.flatMap((g: any) => g.rows.flatMap((r: any) => r.keys))
    expect(handled.filter((k: string) => !listed.includes(k))).toEqual([])
    expect(listed).toEqual(expect.arrayContaining(['/', '?']))
  })

  test('Escape closes the sheet and nothing else', () => {
    const p = draw({ selectedHash: HASHES[1] })
    fireEvent.keyDown(window, { key: '?' })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.querySelector('.cg-keys')).toBeNull()
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
