// Pointing a branch at a remote branch, from wherever it is offered (#308).
//
// The side bar had this act; the reference card's pencil ran something else —
// `setUpstream(branch)` with no target, which can only ever set
// `<remote>/<same name>`, so on an unpublished branch the pencil could only
// fail. One act now, and these are its terms.
import { renderHook } from '@testing-library/react'
import { useChangeUpstream, type ChangeUpstreamDeps } from '../useChangeUpstream'
import { installMockGitAPI } from '../../__tests__/test-utils'

const t = (key: string, ...args: any[]) => args.length ? `${key}(${args.join(',')})` : key

function setup(over: Partial<ChangeUpstreamDeps> = {}, api: Record<string, any> = {}) {
  installMockGitAPI({
    listRemoteBranches: jest.fn().mockResolvedValue({ branches: ['origin/main', 'origin/release', 'origin/spike'] }),
    setUpstream: jest.fn().mockResolvedValue({ success: true }),
    ...api,
  })
  const deps: ChangeUpstreamDeps = {
    t,
    showToast: jest.fn(),
    showPrompt: jest.fn().mockResolvedValue('origin/release'),
    onDone: jest.fn(),
    ...over,
  }
  const { result } = renderHook(() => useChangeUpstream(deps))
  return { change: result.current, deps, api: window.gitAPI as any }
}

test('the remote branches are listed in the prompt, not left to be typed', async () => {
  const { change, deps } = setup()
  await change('feature/login', 'origin/main')
  const [message, initial] = (deps.showPrompt as jest.Mock).mock.calls[0]
  expect(message).toContain('origin/main')
  expect(message).toContain('origin/release')
  // It opens on what the branch tracks: changing one is usually correcting it.
  expect(initial).toBe('origin/main')
})

test('the answer is what git is given, and the lists are re-read', async () => {
  const { change, deps, api } = setup()
  await change('feature/login', 'origin/main')
  expect(api.setUpstream).toHaveBeenCalledWith('feature/login', 'origin/release')
  expect(deps.onDone).toHaveBeenCalled()
})

test('whitespace around what was typed is not part of the ref', async () => {
  const { change, api } = setup({ showPrompt: jest.fn().mockResolvedValue('  origin/release \n') })
  await change('feature/login')
  expect(api.setUpstream).toHaveBeenCalledWith('feature/login', 'origin/release')
})

test('cancelling, or answering with what it already tracks, changes nothing', async () => {
  for (const answer of [null, '', 'origin/main', '  origin/main  ']) {
    const { change, deps, api } = setup({ showPrompt: jest.fn().mockResolvedValue(answer) })
    await change('feature/login', 'origin/main')
    expect(api.setUpstream).not.toHaveBeenCalled()
    expect(deps.onDone).not.toHaveBeenCalled()
  }
})

test("git-core's refusal is shown as it came — it names what fixes it", async () => {
  const error = 'origin/feature/login is not on the remote — publish feature/login to create it'
  const { change, deps } = setup({}, { setUpstream: jest.fn().mockResolvedValue({ success: false, error }) })
  await change('feature/login', 'origin/main')
  const [message, kind] = (deps.showToast as jest.Mock).mock.calls[0]
  expect(message).toContain(error)
  expect(kind).toBe('err')
  expect(deps.onDone).not.toHaveBeenCalled()
})

test('a repository whose remotes cannot be listed still asks, rather than failing', async () => {
  const { change, deps, api } = setup({}, { listRemoteBranches: jest.fn().mockRejectedValue(new Error('no remote')) })
  await change('feature/login')
  expect(deps.showPrompt).toHaveBeenCalled()
  expect(api.setUpstream).toHaveBeenCalledWith('feature/login', 'origin/release')
})
