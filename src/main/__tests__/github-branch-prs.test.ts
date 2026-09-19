import { branchPRsPath, toBranchPRs, currentBranchPR } from '../github-branch-prs'

// What a branch's card knows of the requests it carried, from GitHub's answer.

const pr = (n: number, over: Record<string, any> = {}) => ({
  number: n, title: `PR ${n}`, state: 'closed', draft: false, merged_at: null, html_url: `https://github.com/o/r/pull/${n}`,
  head: { ref: 'release/app+ext-1.37.0', sha: 'a'.repeat(40) }, base: { ref: 'main' }, user: { login: 'victor' },
  updated_at: '2026-09-18T10:00:00Z', ...over,
})

describe('branchPRsPath', () => {
  test('every state, newest first, and a branch name that survives the query string', () => {
    const path = branchPRsPath('o', 'r', 'release/app+ext-1.37.0')
    expect(path).toContain('state=all')
    expect(path).toContain('sort=updated&direction=desc')
    // A raw `+` is a space to a query string.
    expect(path).toContain('head=o%3Arelease%2Fapp%2Bext-1.37.0')
  })
})

describe('toBranchPRs', () => {
  test('merged is read from merged_at — GitHub says "closed" for both', () => {
    const [merged, closed, open, draft] = toBranchPRs([
      pr(248, { merged_at: '2026-09-18T12:00:00Z' }),
      pr(247),
      pr(250, { state: 'open' }),
      pr(251, { state: 'open', draft: true }),
    ], 'release/app+ext-1.37.0')
    expect([merged.state, closed.state, open.state, draft.state]).toEqual(['merged', 'closed', 'open', 'draft'])
    expect(merged).toMatchObject({ number: 248, headSha: 'a'.repeat(40), baseRef: 'main', mergedAt: '2026-09-18T12:00:00Z' })
  })

  test('only the branch asked about, and nothing from an answer that is not a list', () => {
    expect(toBranchPRs([pr(1, { head: { ref: 'other', sha: '' } })], 'release/app+ext-1.37.0')).toEqual([])
    expect(toBranchPRs({ message: 'Not Found' }, 'x')).toEqual([])
  })
})

describe('currentBranchPR', () => {
  test('an open request first, whatever came after it', () => {
    const prs = toBranchPRs([pr(9, { merged_at: '2026-09-19T00:00:00Z' }), pr(8, { state: 'open', draft: true })], 'release/app+ext-1.37.0')
    expect(currentBranchPR(prs)?.number).toBe(8)
  })

  test('otherwise the newest; none is null', () => {
    const prs = toBranchPRs([pr(9, { merged_at: '2026-09-19T00:00:00Z' }), pr(3)], 'release/app+ext-1.37.0')
    expect(currentBranchPR(prs)?.number).toBe(9)
    expect(currentBranchPR([])).toBeNull()
  })
})
