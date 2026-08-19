import { issueBranchName } from '../issueBranch'

// The suggestion has to be a valid refname whatever an issue title contains —
// a title is free text written by anyone, and the prompt it fills is one Enter
// away from `git checkout -b`.
//
// The reference is a key rather than a number since the tracker work began: a
// GitHub issue is `123`, a tracker that uses keys says `PROJ-421`.

describe('issueBranchName', () => {
  test('number and title, in kebab case', () => {
    expect(issueBranchName('123', 'Fix the login redirect')).toBe('123-fix-the-login-redirect')
  })

  test('an issue with no usable title is just its number', () => {
    expect(issueBranchName('7')).toBe('7')
    expect(issueBranchName('7', '')).toBe('7')
    expect(issueBranchName('7', '💥💥💥')).toBe('7')
  })

  test('accents are folded, not dropped', () => {
    expect(issueBranchName('9', 'Créer un dépôt')).toBe('9-creer-un-depot')
  })

  test('everything git refuses in a refname is gone', () => {
    const name = issueBranchName('42', 'Crash on ~^:?*[ and .. and a trailing.lock')
    expect(name).toBe('42-crash-on-and-and-a-trailing-lock')
    expect(name).not.toMatch(/[~^:?*[\\\s]/)
    expect(name).not.toContain('..')
    expect(name.endsWith('.lock')).toBe(false)
    expect(name.startsWith('-') || name.endsWith('-')).toBe(false)
  })

  test('a long title is cut on a word boundary, with no dash left hanging', () => {
    const name = issueBranchName('5', 'The quick brown fox jumps over the lazy dog and keeps going for a while')
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.endsWith('-')).toBe(false)
    expect(name).toBe('5-the-quick-brown-fox-jumps-over-the-lazy-dog-and-keeps')
  })

  test('a single very long word still yields a name', () => {
    const name = issueBranchName('1', 'x'.repeat(200))
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.startsWith('1-')).toBe(true)
  })

  // A key is a name, not prose: lowering it would rename the ticket.
  test('a key keeps its case, the title does not', () => {
    expect(issueBranchName('PROJ-421', 'Fix the Login')).toBe('PROJ-421-fix-the-login')
    expect(issueBranchName('PROJ-421')).toBe('PROJ-421')
  })

  test('a key is sanitised like everything else that reaches a refname', () => {
    expect(issueBranchName('PROJ 421', 'x')).toBe('PROJ-421-x')
    expect(issueBranchName('feature/~42', 'x')).toBe('feature-42-x')
  })

  test('the cut never eats into the key', () => {
    const name = issueBranchName('VERYLONGPROJECT-4210', 'the quick brown fox jumps over the lazy dog')
    expect(name.length).toBeLessThanOrEqual(60)
    expect(name.startsWith('VERYLONGPROJECT-4210-')).toBe(true)
    expect(name.endsWith('-')).toBe(false)
  })

  // It never invents a name it cannot defend — including here.
  test('nothing usable on either side gives nothing, not a guess', () => {
    expect(issueBranchName('', '')).toBe('')
    expect(issueBranchName('💥')).toBe('')
    expect(issueBranchName('💥', 'Fix the login')).toBe('fix-the-login')
  })
})
