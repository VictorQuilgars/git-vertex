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
import type { OpenAllChanges } from '../utils/changeSet'

export type PullRequestAct = 'switch' | 'worktree' | 'changes' | 'compare' | 'openAll'

export interface PullRequestCodeDeps {
  t: (key: any, ...args: any[]) => string
  showToast: (msg: string, type?: 'ok' | 'err') => void
  /** Which remote the base is read from — `origin` when nothing says otherwise. */
  defaultRemote?: string | null
  /** Open the comparison; without it, the fetch is still reported. */
  onCompare?: (base: string, head: string, axis: 'diverged' | 'endpoints') => void
  onSwitched?: () => void
  onWorktreeAdded?: () => void
  /**
   * Every change of the request at once, in the editor's multi-file diff
   * (#284) — base to head, as the request shows them. Absent where the host
   * has no such editor, and then `openAll` is never asked for.
   */
  openAll?: OpenAllChanges
}

export function usePullRequestCode(deps: PullRequestCodeDeps) {
  const { t, showToast, defaultRemote, onCompare, onSwitched, onWorktreeAdded, openAll } = deps
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
    // Against the base as the REMOTE has it: a local branch of that name may
    // be behind, and the request is not measured against this machine.
    const base = pr.baseRef ? `${defaultRemote || 'origin'}/${pr.baseRef}` : 'HEAD'
    if (what === 'openAll' && openAll) {
      openAll({ kind: 'range', base, head, axis: 'diverged' }, t('changes.pr', pr.number))
      return
    }
    if (!onCompare) { showToast(t('gh.pr.fetched', head)); return }
    // `diverged` is what the request itself shows — what the head did since
    // the two parted; `endpoints` is the two trees as they stand.
    onCompare(base, head, what === 'changes' ? 'diverged' : 'endpoints')
  }, [t, showToast, defaultRemote, onCompare, onSwitched, onWorktreeAdded, openAll])
}
