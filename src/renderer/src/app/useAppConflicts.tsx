// A merge, rebase, cherry-pick or revert that stopped: the resolver, the interactive rebase, and the auto-stash that wraps an operation.
import { useState, useCallback } from 'react'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'

export function useAppConflicts(app: AppChrome & RepoSession & AppGithub) {
  const { showConfirm, t, showToast, currentBranch, setLoading, setConflictFiles, conflictMode, setConflictMode, loadRepoData } = app

  const [rebaseHash, setRebaseHash] = useState<string | null>(null)
  const [rebasePlanProposal, setRebasePlanProposal] = useState<{ hash: string; action: string; message?: string }[] | null>(null)
  const [conflictResolverFile, setConflictResolverFile] = useState<string | null>(null)
  // Agent-proposed resolution (from a gitgui://open deep link) to preload into
  // the resolver's manual editor — review-only until the user saves it.
  const [conflictResolverProposal, setConflictResolverProposal] = useState<string | null>(null)
  /**
   * Run something that moves HEAD, stashing the working tree around it when the
   * Auto-stash setting is on. Every way of arriving on a branch goes through
   * here — plain checkout, creating a tracking branch, creating a branch at a
   * commit — so none of them can lose local changes the others protect.
   */
  const withAutoStash = async (
    label: string,
    run: () => Promise<{ success: boolean; error?: string }>,
  ) => {
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as any))
    let stashed = false
    if (settings?.autoStash === 'true') {
      const changes = await window.gitAPI.getWorkingChanges()
      const hasChanges = (changes.staged?.length ?? 0) + (changes.unstaged?.length ?? 0) + (changes.untracked?.length ?? 0) > 0
      if (hasChanges) {
        const sr = await window.gitAPI.createStash('Auto-stash before checkout')
        if (sr.success) { stashed = true; showToast(t('toast.autoStashed')) }
      }
    }
    const r = await run()
    if (r.success) {
      if (stashed) {
        const pr = await window.gitAPI.popStash(0)
        if (pr.success) showToast(`${t('toast.checkoutOk', label)}${t('toast.stashRestoredSuffix')}`)
        else showToast(`${t('toast.checkoutOk', label)}${t('toast.stashRestoreFailSuffix')}`, 'err')
      } else {
        showToast(t('toast.checkoutOk', label))
      }
      await loadRepoData()
    } else {
      if (stashed) await window.gitAPI.popStash(0)
      showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
    }
    return r
  }
  // Warn (per the user's `warnBeforeConflict` setting) before an operation that
  // is predicted to conflict. `predict` returns the files that would clash —
  // empty means clean OR the prediction couldn't run, and either way we don't
  // block. On a predicted conflict a sticky toast offers Continue, "don't ask
  // again" (flips the setting off, then continues), or dismiss (×) to cancel.
  const guardConflict = useCallback(async (
    predict: () => Promise<{ files: string[]; error?: string }>,
    op: () => void | Promise<void>,
  ) => {
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as Record<string, string>))
    if ((settings as any)?.warnBeforeConflict === 'false') { await op(); return }
    const { files } = await predict().catch(() => ({ files: [] as string[] }))
    if (files.length === 0) { await op(); return }   // clean, or prediction unavailable
    showToast(
      t('toast.conflictPredicted', String(files.length)),
      'err',
      [
        { label: t('toast.conflictContinue'), onClick: () => { void op() } },
        { label: t('toast.conflictDontAsk'), onClick: () => {
          void window.gitAPI.settingsSet('warnBeforeConflict', 'false')
          void op()
        } },
      ],
      true,   // sticky — a go/no-go decision must not silently time out
    )
  }, [showToast, t])
  const handleRebaseOnto = async (name: string) => {
    const ok = await showConfirm(t('prompt.rebaseOnto', currentBranch, name))
    if (!ok) return
    await guardConflict(
      // Accurate rebase prediction: simulates the per-commit replay.
      () => window.gitAPI.predictRebaseConflicts(name),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.rebaseOnto(name)
        if (r.success) showToast(t('toast.rebaseOntoOk', name))
        else showToast(t('toast.err', r.error ?? ''), 'err')
        // Refresh even on a conflict — the rebase is left paused (not aborted),
        // so the conflict banner/resolver needs the reloaded state to show up.
        await loadRepoData()
        setLoading(false)
      },
    )
  }
  const handleRebaseCurrentOntoCommit = async (hash: string) => {
    await guardConflict(
      () => window.gitAPI.predictRebaseConflicts(hash),   // accurate per-commit replay
      async () => {
        setLoading(true)
        const r = await window.gitAPI.rebaseOnto(hash)
        if (r.success) showToast(t('toast.rebasedOn', hash.slice(0, 7)))
        else showToast(t('toast.err', r.error ?? ''), 'err')
        // Refresh even on a conflict — the rebase is left paused (not aborted),
        // so the conflict banner/resolver needs the reloaded state to show up.
        await loadRepoData()
        setLoading(false)
      },
    )
  }
  // ── Conflict resolution handlers ───────────────────────────
  const handleConflictFinish = async (action: 'rebase' | 'merge', message?: string) => {
    setLoading(true)
    // The operation that produced the conflict dictates which --continue to run.
    // conflictMode is authoritative; `action` is only the resolver's coarse hint.
    const mode = conflictMode ?? action
    let r: { success: boolean; error?: string }
    if (mode === 'rebase') {
      r = await window.gitAPI.continueRebase()
    } else if (mode === 'cherry-pick') {
      r = await window.gitAPI.continueCherryPick()
    } else if (mode === 'revert') {
      r = await window.gitAPI.continueRevert()
    } else {
      r = await window.gitAPI.continueMerge(message)
    }

    if (r.success) {
      showToast(mode === 'rebase' ? t('toast.rebaseContinued') : t('toast.mergeContinued'))
      setConflictFiles([])
      setConflictMode(null)
      await loadRepoData()
    } else {
      showToast(t('toast.err', r.error ?? ''), 'err')
    }
    setLoading(false)
    return r.success
  }
  const handleConflictAbort = async () => {
    setLoading(true)
    // Each operation has its own --abort; using the wrong one fails silently.
    if (conflictMode === 'merge') {
      await window.gitAPI.abortMerge()
      showToast(t('toast.mergeAborted'))
    } else if (conflictMode === 'cherry-pick') {
      await window.gitAPI.abortCherryPick()
      showToast(t('toast.rebaseAborted'))
    } else if (conflictMode === 'revert') {
      await window.gitAPI.abortRevert()
      showToast(t('toast.rebaseAborted'))
    } else {
      await window.gitAPI.abortRebase()
      showToast(t('toast.rebaseAborted'))
    }
    setConflictFiles([])
    setConflictMode(null)
    await loadRepoData()
    setLoading(false)
  }

  return {
    rebaseHash, setRebaseHash, rebasePlanProposal, setRebasePlanProposal, conflictResolverFile, setConflictResolverFile, conflictResolverProposal, setConflictResolverProposal, withAutoStash, guardConflict, handleRebaseOnto, handleRebaseCurrentOntoCommit, handleConflictFinish, handleConflictAbort,
  }
}

export type AppConflicts = ReturnType<typeof useAppConflicts>
