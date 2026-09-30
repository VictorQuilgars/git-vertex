import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GithubRow from '../GithubRow'
import { clearPRFacts, createPRFactsCache, PR_FACTS_TTL_MS } from '../prFacts'
import { installMockGitAPI, renderWithProviders } from '../../../__tests__/test-utils'

// A pull request row's hover says what the list cannot (#291): its checks,
// the review decision and its size. The REST list has none of the three, so
// the card asks the host — once for the whole list, not once per row — and
// the row itself says when the request comes from a fork.

const REPO = { owner: 'o', repo: 'r' }
const pr = (n: number, extra: object = {}) => ({
  kind: 'pr' as const, number: n, title: `Request ${n}`, url: `https://x/${n}`,
  author: 'victor', body: `Body of ${n}`, ...extra,
})

/** GitHub's answer, as the host hands it back. */
const answer = {
  facts: {
    12: { number: 12, checks: 'success', reviewDecision: 'APPROVED', additions: 120, deletions: 8, changedFiles: 5 },
    13: { number: 13, checks: 'failure', reviewDecision: 'CHANGES_REQUESTED', additions: 1, deletions: 2, changedFiles: 1 },
  },
}

const rowOf = (n: number) => [...document.querySelectorAll('.sb-gh-row')]
  .find(r => r.textContent?.includes(`#${n}`)) as HTMLElement

describe('a pull request row — its hover facts and its fork marker', () => {
  beforeEach(() => clearPRFacts())

  test('the card shows checks, review decision and size from the API answer', async () => {
    const githubPRFacts = jest.fn().mockResolvedValue(answer)
    installMockGitAPI({ githubPRFacts })
    renderWithProviders(<GithubRow item={pr(12)} factsSource={{ repo: REPO, batch: [12, 13] }} />)
    await userEvent.hover(rowOf(12))
    await waitFor(() => expect(screen.getByText('Passing')).toBeInTheDocument())
    expect(screen.getByText('Approved')).toBeInTheDocument()
    const size = document.querySelector('[data-fact="size"]')!
    expect(size.textContent).toContain('+120')
    expect(size.textContent).toContain('−8')
    expect(size.textContent).toContain('5 files')
    // The hovered number first, the rest of the list in the same request.
    expect(githubPRFacts).toHaveBeenCalledTimes(1)
    expect(githubPRFacts).toHaveBeenCalledWith('o', 'r', [12, 13])
  })

  test('a second row of the same list is answered from what the first asked', async () => {
    const githubPRFacts = jest.fn().mockResolvedValue(answer)
    installMockGitAPI({ githubPRFacts })
    const src = { repo: REPO, batch: [12, 13] }
    renderWithProviders(<>
      <GithubRow item={pr(12)} factsSource={src} />
      <GithubRow item={pr(13)} factsSource={src} />
    </>)
    await userEvent.hover(rowOf(12))
    await waitFor(() => expect(screen.getByText('Passing')).toBeInTheDocument())
    await userEvent.unhover(rowOf(12))
    await userEvent.hover(rowOf(13))
    await waitFor(() => expect(screen.getByText('Changes requested')).toBeInTheDocument())
    expect(screen.getByText('Failing')).toBeInTheDocument()
    expect(githubPRFacts).toHaveBeenCalledTimes(1)
  })

  test('a refused answer says so, and a rate limit in its own words', async () => {
    installMockGitAPI({ githubPRFacts: jest.fn().mockResolvedValue({ error: 'rate_limited' }) })
    renderWithProviders(<GithubRow item={pr(12)} factsSource={{ repo: REPO, batch: [12] }} />)
    await userEvent.hover(rowOf(12))
    await waitFor(() => expect(screen.getByText(/Rate limit reached/)).toBeInTheDocument())
  })

  test('without a source the card is what it was, and nothing is asked', async () => {
    const githubPRFacts = jest.fn()
    installMockGitAPI({ githubPRFacts })
    renderWithProviders(<GithubRow item={pr(12)} />)
    await userEvent.hover(rowOf(12))
    await waitFor(() => expect(screen.getByText('Body of 12')).toBeInTheDocument())
    expect(screen.queryByText('Checks')).not.toBeInTheDocument()
    expect(githubPRFacts).not.toHaveBeenCalled()
  })

  test('a request from a fork carries the marker, naming the fork', () => {
    installMockGitAPI({})
    renderWithProviders(<>
      <GithubRow item={pr(20, { fork: true, headRepo: 'alice/r' })} />
      <GithubRow item={pr(21, { fork: true })} />
      <GithubRow item={pr(22, { fork: false })} />
    </>)
    const marks = screen.getAllByTestId('pr-fork')
    expect(marks).toHaveLength(2)
    expect(rowOf(20).querySelector('[data-testid="pr-fork"]')!.getAttribute('title')).toBe('From a fork: alice/r')
    expect(rowOf(21).querySelector('[data-testid="pr-fork"]')!.getAttribute('title')).toBe('From a fork that no longer exists')
    expect(rowOf(22).querySelector('[data-testid="pr-fork"]')).toBeNull()
  })
})

describe('the facts cache', () => {
  test('held for a minute, then asked again; a failure is not held', async () => {
    let now = 1_000
    const fetcher = jest.fn()
      .mockResolvedValueOnce({ error: 'HTTP 502' })
      .mockResolvedValue(answer)
    const cache = createPRFactsCache(fetcher as any, () => now)
    await expect(cache.load(REPO, 12, [12, 13])).rejects.toThrow('HTTP 502')
    expect(cache.peek(REPO, 12)).toBeUndefined()
    await expect(cache.load(REPO, 12, [12, 13])).resolves.toMatchObject({ checks: 'success' })
    await cache.load(REPO, 13, [12, 13])
    expect(fetcher).toHaveBeenCalledTimes(2)
    now += PR_FACTS_TTL_MS + 1
    await cache.load(REPO, 13, [12, 13])
    expect(fetcher).toHaveBeenCalledTimes(3)
    // Asked first, the hovered number; the ones already fresh are not asked again.
    expect(fetcher.mock.calls[2][2]).toEqual([13, 12])
  })

  test('a number GitHub did not resolve is held as nothing, not asked on every hover', async () => {
    const fetcher = jest.fn().mockResolvedValue({ facts: {} })
    const cache = createPRFactsCache(fetcher as any, () => 0)
    await expect(cache.load(REPO, 99, [99])).resolves.toBeNull()
    await expect(cache.load(REPO, 99, [99])).resolves.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
