/**
 * A pull request's CODE, not its page (#290).
 *
 * A request whose head is a branch of this repository could be checked out
 * from Branches › REMOTE, once you had worked out which remote branch it was;
 * one from a FORK could not be checked out at all. Every act here starts with
 * the same fetch of `refs/pull/<n>/head` — the one ref GitHub publishes for
 * every request, fork or not — which is what makes the fork's case work at
 * all rather than a special path for it.
 *
 * Reading the changes stops at the fetch: the objects are what a diff needs,
 * and asking somebody to switch branches to read one is how a review costs a
 * stash.
 *
 * A hook rather than a handler inside the side bar, because the sheet that
 * offers the same four acts is mounted by the host, outside that panel.
 */
import { useCallback } from 'react'

export type PullRequestAct = 'switch' | 'worktree' | 'changes' | 'compare'

export interface PullRequestCodeDeps {
  t: (key: any, ...args: any[]) => string
  showToast: (msg: string, type?: 'ok' | 'err') => void
  /** Which remote the base is read from — `origin` when nothing says otherwise. */
  defaultRemote?: string | null
  /** Open the comparison; without it, the fetch is still reported. */
  onCompare?: (base: string, head: string, axis: 'diverged' | 'endpoints') => void
  onSwitched?: () => void
  onWorktreeAdded?: () => void
}

export function usePullRequestCode(deps: PullRequestCodeDeps) {
  const { t, showToast, defaultRemote, onCompare, onSwitched, onWorktreeAdded } = deps
  return useCallback(async (pr: { number: number; baseRef?: string }, what: PullRequestAct) => {
    const wants = what === 'switch'
    const r = await window.gitAPI.fetchPullRequest(pr.number, { checkout: wants })
    if (!r.success && !r.branch) { showToast(t('toast.err', r.error ?? ''), 'err'); return }
    // The head is on its branch even when the checkout failed — the error
    // says which, rather than reporting the whole thing as a failure.
    if (!r.success) showToast(t('toast.err', r.error ?? ''), 'err')
    const head = r.branch ?? ''
    if (wants) {
      if (r.success) showToast(t('gh.pr.switched', head))
      onSwitched?.()
      return
    }
    if (what === 'worktree') {
      const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
      if (!dir.path) return
      const made = await window.gitAPI.addWorktree(dir.path, head)
      if (made.success) { showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? '')); onWorktreeAdded?.() }
      else showToast(t('toast.err', made.error ?? ''), 'err')
      return
    }
    if (!onCompare) { showToast(t('gh.pr.fetched', head)); return }
    // Against the base as the REMOTE has it: a local branch of that name may
    // be behind, and the request is not measured against this machine.
    const base = pr.baseRef ? `${defaultRemote || 'origin'}/${pr.baseRef}` : 'HEAD'
    // `diverged` is what the request itself shows — what the head did since
    // the two parted; `endpoints` is the two trees as they stand.
    onCompare(base, head, what === 'changes' ? 'diverged' : 'endpoints')
  }, [t, showToast, defaultRemote, onCompare, onSwitched, onWorktreeAdded])
}
