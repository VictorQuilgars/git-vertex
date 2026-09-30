import { plainError } from '../errorText'

describe('plainError — an error without the IPC wrapper around it', () => {
  test('the channel and the error class Electron puts in front are dropped', () => {
    expect(plainError(new Error("Error invoking remote method 'git:list-worktrees': Error: worktree list unavailable")))
      .toBe('worktree list unavailable')
  })

  test('the same, when the error has already been turned into a string', () => {
    expect(plainError("Error: Error invoking remote method 'git:get-reflog': Error: boom")).toBe('boom')
  })

  test('a handler that threw something that is not an Error has no class to drop', () => {
    expect(plainError("Error invoking remote method 'git:get-remotes': nope")).toBe('nope')
  })

  // A class that says something the message does not is kept.
  test('a more specific class stays', () => {
    expect(plainError("Error invoking remote method 'x': TypeError: cannot read properties of undefined"))
      .toBe('TypeError: cannot read properties of undefined')
  })

  test('a message that never had a wrapper is left exactly as it is', () => {
    expect(plainError(new Error('not-implemented: listAgents'))).toBe('not-implemented: listAgents')
    expect(plainError('HTTP 404')).toBe('HTTP 404')
    expect(plainError(undefined)).toBe('undefined')
  })

  test('the words are only a wrapper at the start', () => {
    expect(plainError("git said: Error invoking remote method 'x': y")).toBe("git said: Error invoking remote method 'x': y")
  })
})
