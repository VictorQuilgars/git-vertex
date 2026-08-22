import { bypassVerdict, RULESET_PROBE_CAP } from '../ruleset-bypass'

// The pane says "You can bypass this rule" or "You cannot" out loud, so this
// verdict is an assertion about the reader's own rights, not a button state.
// What it must never do is claim a refusal it did not measure.

describe('what the rulesets answer, together', () => {
  test('never everywhere is the only refusal', () => {
    expect(bypassVerdict(['never'])).toBe(false)
    expect(bypassVerdict(['never', 'never', 'never'])).toBe(false)
  })

  // Measured on this repository: "protect main" that nobody bypasses beside
  // "review required (others only)" that the owner does. Demanding every
  // ruleset be bypassable would call the owner a non-bypasser on the very
  // configuration the feature exists for.
  test('one bypassable ruleset among unbypassable ones is enough', () => {
    expect(bypassVerdict(['never', 'always'])).toBe(true)
    expect(bypassVerdict(['always', 'never'])).toBe(true)
  })

  // A merge from the pane IS a pull request, so the pull-request-only mode
  // counts — and the test is against `never` so that a value GitHub has not
  // shipped yet cannot read as a refusal.
  test('any value that is not never means yes', () => {
    expect(bypassVerdict(['pull_requests_only'])).toBe(true)
    expect(bypassVerdict(['some_mode_github_adds_later'])).toBe(true)
  })

  test('no ruleset covering the branch is unknown, not a refusal', () => {
    expect(bypassVerdict([])).toBeNull()
  })

  // One unreadable ruleset could be the one that matters, in either
  // direction — a 403 on a ruleset must not become "you cannot bypass".
  test('one unreadable ruleset makes the whole answer unknown', () => {
    expect(bypassVerdict([null])).toBeNull()
    expect(bypassVerdict(['always', null])).toBeNull()
    expect(bypassVerdict(['never', null])).toBeNull()
  })

  test('the probe cap is a number of rulesets, not of requests', () => {
    expect(RULESET_PROBE_CAP).toBeGreaterThan(0)
  })
})
