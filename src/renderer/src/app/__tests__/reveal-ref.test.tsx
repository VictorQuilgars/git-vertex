import { act, renderHook } from '@testing-library/react'
import { useAppSearch } from '../useAppSearch'
import { installMockGitAPI } from '../../__tests__/test-utils'
import { emptyVisibility } from '../../utils/graphVisibility'

// A reference named from the graph — `/`, `t`, `u` — whose tip the page may
// not hold. On the page it is selected; off it the page is grown to reach it,
// the way a search hit is reached; too far, or on no branch shown, it is said.

const H = (c: string) => c.repeat(40)
const loaded = [{ hash: H('a') }, { hash: H('b') }] as any[]

function mount(api: Record<string, jest.Mock>) {
  installMockGitAPI(api as any)
  const app = {
    t: (key: string, ...args: unknown[]) => `${key}(${args.join(',')})`,
    showToast: jest.fn(), setSelectedCommit: jest.fn(), growHistory: jest.fn(), setDeepLinkHash: jest.fn(),
    repoPath: '/repo', commits: loaded, branches: [], stashes: [], tags: [], notedHashes: null,
    aiSearchHashes: null, setAiSearchHashes: jest.fn(), setAiSearchLoading: jest.fn(),
    logLimitRef: { current: 500 }, showAllRef: { current: true }, soloRef: { current: null },
    visibilityRef: { current: emptyVisibility() },
  }
  const { result } = renderHook(() => useAppSearch(app as any))
  return { app, reveal: (ref: string) => act(async () => { await result.current.revealRef(ref) }) }
}

describe('revealRef', () => {
  test('a tip on the page is selected, and git is asked nothing more', async () => {
    const locateInHistory = jest.fn()
    const { app, reveal } = mount({ resolveCommit: jest.fn().mockResolvedValue({ hash: H('b') }), locateInHistory })
    await reveal('feature')
    expect(app.setSelectedCommit).toHaveBeenCalledWith(loaded[1])
    expect(locateInHistory).not.toHaveBeenCalled()
  })

  test('a tip beyond the page grows the page to it, to be selected when its row is in', async () => {
    const { app, reveal } = mount({
      resolveCommit: jest.fn().mockResolvedValue({ hash: H('f') }),
      locateInHistory: jest.fn().mockResolvedValue({ positions: { [H('f')]: 1234 } }),
    })
    await reveal('release')
    expect(app.growHistory).toHaveBeenCalledWith(1500)
    expect(app.setDeepLinkHash).toHaveBeenCalledWith(H('f'))
    expect(app.showToast).not.toHaveBeenCalled()
  })

  test('past the reach, the finder says how far back the commit is instead', async () => {
    const { app, reveal } = mount({
      resolveCommit: jest.fn().mockResolvedValue({ hash: H('f') }),
      locateInHistory: jest.fn().mockResolvedValue({ positions: { [H('f')]: 41234 } }),
    })
    await reveal('v0.1.0')
    expect(app.growHistory).not.toHaveBeenCalled()
    expect(app.showToast).toHaveBeenCalledWith('ext.app.revealBeyond(41,234)', 'info')
  })

  test('on no branch the graph shows: said, not loaded', async () => {
    const { app, reveal } = mount({
      resolveCommit: jest.fn().mockResolvedValue({ hash: H('f') }),
      locateInHistory: jest.fn().mockResolvedValue({ positions: {} }),
    })
    await reveal('hidden-branch')
    expect(app.growHistory).not.toHaveBeenCalled()
    expect(app.showToast).toHaveBeenCalledWith('ext.app.revealUnreached(hidden-branch)', 'info')
  })

  test('a name that is no commit says so', async () => {
    const { app, reveal } = mount({ resolveCommit: jest.fn().mockResolvedValue({ hash: null }) })
    await reveal('nope')
    expect(app.showToast).toHaveBeenCalledWith('ext.app.revealNotFound(nope)', 'err')
  })
})
