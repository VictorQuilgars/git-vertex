import { issueBranchName } from '../issueBranch'

// The suggestion has to be a valid refname whatever an issue title contains —
// a title is free text written by anyone, and the prompt it fills is one Enter
// away from `git checkout -b`.

describe('issueBranchName', () => {
  test('number and title, in kebab case', () => {
    expect(issueBranchName(123, 'Fix the login redirect')).toBe('123-fix-the-login-redirect')
  })

  test('an issue with no usable title is just its number', () => {
    expect(issueBranchName(7)).toBe('7')
    expect(issueBranchName(7, '')).toBe('7')
    expect(issueBranchName(7, '💥💥💥')).toBe('7')
  })

  test('accents are folded, not dropped', () => {
    expect(issueBranchName(9, 'Créer un dépôt')).toBe('9-creer-un-depot')
  })

  test('everything git refuses in a refname is gone', () => {
    const name = issueBranchName(42, 'Crash on ~^:?*[ and .. and a trailing.lock')
    expect(name).toBe('42-crash-on-and-and-a-trailing-lock')
    expect(name).not.toMatch(/[~^:?*[\\\s]/)
    expect(name).not.toContain('..')
    expect(name.endsWith('.lock')).toBe(false)
    expect(name.startsWith('-') || name.endsWith('-')).toBe(false)
  })

  test('a long title is cut on a word boundary, with no dash left hanging', () => {
    const name = issueBranchName(5, 'The quick brown fox jumps over the lazy dog and keeps going for a while')
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.endsWith('-')).toBe(false)
    expect(name).toBe('5-the-quick-brown-fox-jumps-over-the-lazy-dog-and-keeps')
  })

  test('a single very long word still yields a name', () => {
    const name = issueBranchName(1, 'x'.repeat(200))
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.startsWith('1-')).toBe(true)
  })
})
