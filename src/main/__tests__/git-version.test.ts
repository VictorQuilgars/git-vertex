import {
  parseGitVersion, isGitVersionAtLeast, MIN_GIT_FOR_CONFLICT_PREDICTION,
} from '../git-service'

describe('parseGitVersion', () => {
  test('plain build', () => {
    expect(parseGitVersion('git version 2.51.2\n')).toBe('2.51.2')
  })

  test('vendor suffix — what macOS actually reports', () => {
    expect(parseGitVersion('git version 2.39.3 (Apple Git-146)\n')).toBe('2.39.3')
  })

  test('two-part version gets a zero patch', () => {
    expect(parseGitVersion('git version 2.40')).toBe('2.40.0')
  })

  test('windows build suffix', () => {
    expect(parseGitVersion('git version 2.45.1.windows.1')).toBe('2.45.1')
  })

  test('anything else is unknown rather than a wrong guess', () => {
    expect(parseGitVersion('')).toBeNull()
    expect(parseGitVersion('command not found: git')).toBeNull()
  })
})

describe('isGitVersionAtLeast', () => {
  test('equal passes', () => {
    expect(isGitVersionAtLeast('2.40.0', '2.40')).toBe(true)
  })

  test('newer passes', () => {
    expect(isGitVersionAtLeast('2.51.2', '2.40')).toBe(true)
    expect(isGitVersionAtLeast('3.0.0', '2.40')).toBe(true)
  })

  test('older fails', () => {
    expect(isGitVersionAtLeast('2.39.3', '2.40')).toBe(false)
    expect(isGitVersionAtLeast('2.9.5', '2.40')).toBe(false)
  })

  test('minor is compared numerically, not as text', () => {
    // The bug this guards: '2.9' > '2.40' under string comparison.
    expect(isGitVersionAtLeast('2.9.0', '2.40')).toBe(false)
    expect(isGitVersionAtLeast('2.400.0', '2.40')).toBe(true)
  })

  test('the shipped floor is the one the prediction needs', () => {
    expect(isGitVersionAtLeast('2.39.3', MIN_GIT_FOR_CONFLICT_PREDICTION)).toBe(false)
    expect(isGitVersionAtLeast('2.40.0', MIN_GIT_FOR_CONFLICT_PREDICTION)).toBe(true)
  })
})
