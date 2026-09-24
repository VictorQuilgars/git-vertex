import { graphqlUrl, prFactsFailure, prFactsNumbers, prFactsQuery, prFork, toPRFacts, PR_FACTS_MAX } from '../github-pr-facts'

// What a pull request row's hover adds (#291), read the same way by the
// desktop's main process and the extension host. The answers below are the
// shape GitHub's GraphQL API gives — one alias per request asked.

describe('the query for a list', () => {
  test('one alias per number, in one query', () => {
    const q = prFactsQuery([12, 7])
    expect(q).toContain('p12: pullRequest(number: 12)')
    expect(q).toContain('p7: pullRequest(number: 7)')
    expect(q.match(/pullRequest\(/g)).toHaveLength(2)
    expect(q).toContain('statusCheckRollup { state }')
    expect(q).toContain('reviewDecision')
    expect(q).toContain('changedFiles')
  })

  test('only whole positive numbers reach the text, each once, at most a list of them', () => {
    expect(prFactsNumbers([3, 3, 0, -1, 2.5, '4', NaN, 5])).toEqual([3, 5])
    expect(prFactsNumbers(Array.from({ length: 80 }, (_, i) => i + 1))).toHaveLength(PR_FACTS_MAX)
    expect(prFactsQuery(['1) { x } #' as unknown as number, 9])).not.toContain('x }')
  })

  test('github.com and an Enterprise Server each have their GraphQL beside REST', () => {
    expect(graphqlUrl('https://api.github.com')).toBe('https://api.github.com/graphql')
    expect(graphqlUrl('https://ghe.acme.com/api/v3')).toBe('https://ghe.acme.com/api/graphql')
  })
})

describe('the answer, by number', () => {
  const answer = {
    data: {
      repository: {
        p12: {
          number: 12, additions: 120, deletions: 8, changedFiles: 5, reviewDecision: 'APPROVED',
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
        },
        p7: {
          number: 7, additions: 3, deletions: 40, changedFiles: 1, reviewDecision: 'CHANGES_REQUESTED',
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'ERROR' } } }] },
        },
        p9: {
          number: 9, additions: 0, deletions: 0, changedFiles: 0, reviewDecision: null,
          commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
        },
        p4: {
          number: 4, additions: 1, deletions: 1, changedFiles: 1, reviewDecision: 'REVIEW_REQUIRED',
          commits: { nodes: [{ commit: { statusCheckRollup: { state: 'EXPECTED' } } }] },
        },
        // A number GitHub could not resolve: null beside an error, the rest intact.
        p404: null,
      },
    },
    errors: [{ type: 'NOT_FOUND', message: 'Could not resolve to a PullRequest with the number of 404.' }],
  }

  test('checks, review decision and size of each', () => {
    const facts = toPRFacts(answer)
    expect(facts[12]).toEqual({ number: 12, checks: 'success', reviewDecision: 'APPROVED', additions: 120, deletions: 8, changedFiles: 5 })
    expect(facts[7]).toMatchObject({ checks: 'failure', reviewDecision: 'CHANGES_REQUESTED', deletions: 40 })
    expect(facts[9]).toMatchObject({ checks: null, reviewDecision: null })
    expect(facts[4]).toMatchObject({ checks: 'pending', reviewDecision: 'REVIEW_REQUIRED' })
    expect(facts[404]).toBeUndefined()
  })

  test('a partial answer is an answer; nothing at all is a failure, said plainly', () => {
    expect(prFactsFailure(200, answer)).toBeNull()
    expect(prFactsFailure(200, { errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] })).toBe('rate_limited')
    expect(prFactsFailure(403, { errors: [{ type: 'RATE_LIMITED' }] })).toBe('rate_limited')
    expect(prFactsFailure(401, { message: 'Bad credentials' })).toBe('not_authenticated')
    expect(prFactsFailure(502, null)).toBe('HTTP 502')
    expect(prFactsFailure(200, { errors: [{ message: 'Could not resolve to a Repository' }] })).toBe('Could not resolve to a Repository')
    expect(toPRFacts(null)).toEqual({})
  })
})

describe('the fork marker, read off the list row', () => {
  const base = { repo: { full_name: 'o/r' } }
  test('a head in another repository is a fork, and says which', () => {
    expect(prFork({ head: { repo: { full_name: 'alice/r' } }, base })).toEqual({ fork: true, headRepo: 'alice/r' })
  })
  test('a head in this repository is not', () => {
    expect(prFork({ head: { repo: { full_name: 'o/r' } }, base })).toEqual({ fork: false })
  })
  test('a deleted fork is still a fork; a row that says nothing is not called one', () => {
    expect(prFork({ head: { repo: null }, base })).toEqual({ fork: true })
    expect(prFork({ head: { ref: 'x' } })).toEqual({ fork: false })
  })
})
