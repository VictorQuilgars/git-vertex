// Every git action the toolbar, the menus and the palette call — branch, stash, tag, commit, remote, worktree — and the modals they open.
import { useState, useCallback } from 'react'
import { StashScope } from '../types'
import { type LinkedIssue } from '../hooks/useBranchMeta'
import { issueRefUrl } from '../utils/issueRef'
import { isRefHidden } from '../utils/graphVisibility'
import { remoteUrl } from '../utils/remoteUrl'
import { canonicalRef, publishedNameFor } from '../components/ContextMenu/branchRefs'
import { buildBranchMenu, type BranchMenuExtras } from '../components/ContextMenu/branchMenu'
import { revealSection } from '../components/Sidebar/Section'
import { MenuItemDef } from '../components/ContextMenu/ContextMenu'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'
import type { AppAi } from './useAppAi'
import type { AppTabs } from './useAppTabs'
import type { AppUpdates } from './useAppUpdates'

export function useAppActions(app: AppChrome & RepoSession & AppGithub & AppConflicts & AppAi & AppTabs & AppUpdates) {
  const { showPrompt, showConfirm, t, showToast, repoPath, commits, branches, currentBranch, setSelectedCommit, soloBranch, setSoloBranch, visibility, remoteNames, toggleHidden, branchMeta, setLoading, stashes, pullMode, tracking, githubOwnerRepo, remoteRepo, loadStashes, loadTags, loadRepoData, setIssueModalBranch, autolinks, prIntentFor, handleStartPR, currentBranchPR, handleOpenBranchesOnRemote, handleOpenBranchOnRemote, withAutoStash, guardConflict, handleRebaseOnto, setAiRead, applyRepo, openViewTab, defaultBranch, githubPRs, setSidebarTab } = app

  // Comparisons and previews are tabs now, not overlays — see ViewTab.
  const [compareBaseHash, setCompareBaseHash] = useState<string | null>(null)
  const [gitflowOpen, setGitflowOpen] = useState(false)
  const [pushModalOpen, setPushModalOpen] = useState(false)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [initModalOpen, setInitModalOpen] = useState(false)
  const handleCreateRepo = async () => {
    const dir = await window.gitAPI.selectDirectory(t('welcome.createHint'))
    if (!dir.path) return
    const res = await (window.gitAPI as any).initRepo(dir.path)
    applyRepo(res)
    // Creating one, though, is a MUTATION: a repository now exists on disk
    // where none did, and nothing else on screen says so.
    if (res?.path) showToast(t('toast.repoCreated'))
  }
  // ── Git operations ─────────────────────────────────────────
  const handleUndo = async () => {
    setLoading(true)
    const r = await window.gitAPI.undoLastAction()
    if (r.success) { showToast(`↩ ${r.action ?? t('toast.undoFallback')}`); await loadRepoData() }
    else showToast(r.error ?? t('toast.cannotUndo'), 'err')
    setLoading(false)
  }
  const handleRedo = async () => {
    setLoading(true)
    const r = await window.gitAPI.redoLastAction()
    if (r.success) { showToast(`↪ ${r.action ?? t('toast.redoFallback')}`); await loadRepoData() }
    else showToast(r.error ?? t('toast.nothingToRedo'), 'err')
    setLoading(false)
  }
  // "Annuler" button offered on toasts after history-rewriting operations
  const undoAction = () => ({ label: t('toast.undo'), onClick: () => { void handleUndo() } })
  const handleFetch = async () => {
    setLoading(true)
    const r = await window.gitAPI.fetch()
    if (r.success) { showToast(t('toast.fetchOk')); await loadRepoData() }
    else showToast(t('toast.fetchErr', r.error ?? ''), 'err')
    setLoading(false)
  }
  const handlePush = async () => {
    if (!repoPath) return
    setLoading(true)
    const { upstream } = await window.gitAPI.getUpstream()
    setLoading(false)
    if (upstream) {
      // upstream configured → push direct
      const r = await window.gitAPI.push()
      if (r.success) { showToast(t('toast.pushOk', upstream)); await loadRepoData() }
      else showToast(t('toast.pushErr', r.error ?? ''), 'err')
    } else {
      // no upstream → open modal to configure
      setPushModalOpen(true)
    }
  }
  // Navigation: it opens the push modal, which is the confirmation.
  const handlePushModal = () => {
    if (repoPath) setPushModalOpen(true)
  }
  const handleStash = async () => {
    if (!repoPath) return
    const r = await window.gitAPI.createStash()
    if ((r as any)?.success === false) showToast(t('toast.stashErr', (r as any).error ?? ''), 'err')
    else { showToast(t('toast.stashCreated')); await loadRepoData() }
  }
  const handlePop = async () => {
    if (!repoPath || stashes.length === 0) return
    const r = await window.gitAPI.popStash(0)
    if ((r as any)?.success === false) showToast(t('toast.stashErr', (r as any).error ?? ''), 'err')
    else { showToast(t('toast.stashPopped', 0)); await loadRepoData() }
  }
  // Navigation: a terminal window opens, which is the confirmation.
  const handleTerminal = async () => {
    if (!repoPath) return
    const r = await (window.gitAPI as any).openTerminal?.()
    if (r?.success === false) showToast(r.error ?? t('toast.terminalError'), 'err')
  }
  const handlePull = async () => {
    await guardConflict(
      // Predicts the merge of the already-known upstream tip; pull will fetch
      // first, so brand-new upstream commits aren't seen here (advisory).
      () => window.gitAPI.predictConflicts('@{u}'),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.pull(pullMode === 'fetch' ? undefined : pullMode)
        if (r.success) { showToast(t('toast.pullOk')); await loadRepoData() }
        else showToast(t('toast.pullErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }
  /**
   * "Take me here" — the double-click on a branch row, a ref chip or a commit.
   * It always lands on a LOCAL BRANCH: git decides which case applies
   * (getCheckoutPlan) and this only carries it out. Detaching HEAD is reserved
   * for the context menu's explicit "check out this commit".
   */
  const handleGoTo = async (ref: string) => {
    const plan = await (window.gitAPI as any).getCheckoutPlan(ref)
    if (!plan || plan.error) { showToast(t('toast.checkoutErr', plan?.error ?? ''), 'err'); return }
    switch (plan.action) {
      case 'already-here':
        showToast(t('toast.alreadyOnBranch', plan.branch))
        return
      case 'checkout-local':
        await handleCheckout(plan.branch)
        return
      case 'create-tracking':
        // A remote branch with no local counterpart: the local branch that
        // tracks it is unambiguous, so it is created without asking.
        await withAutoStash(plan.branch, () =>
          (window.gitAPI as any).checkoutTracking(plan.remoteRef, plan.branch))
        return
      case 'create-branch': {
        // Nothing to land on. Ask for a name — deliberately empty: any
        // suggestion here would be a guess about what this branch is for.
        const name = await showPrompt(t('prompt.branchHere', plan.shortHash), '')
        if (!name || !name.trim()) return
        await withAutoStash(name.trim(), () =>
          window.gitAPI.createBranchAt(name.trim(), plan.hash, true))
        return
      }
    }
  }
  const handleCheckout = async (name: string) => {
    // Auto-stash: if enabled and there are local changes, stash before checkout and pop after
    const settings = await window.gitAPI.settingsGetAll().catch(() => ({} as any))
    const autoStash = settings?.autoStash === 'true'
    let stashed = false
    if (autoStash) {
      const changes = await window.gitAPI.getWorkingChanges()
      const hasChanges = (changes.staged?.length ?? 0) + (changes.unstaged?.length ?? 0) + (changes.untracked?.length ?? 0) > 0
      if (hasChanges) {
        const sr = await window.gitAPI.createStash('Auto-stash before checkout')
        if (sr.success) { stashed = true; showToast(t('toast.autoStashed')) }
      }
    }
    const r = await window.gitAPI.checkout(name)
    if (r.success) {
      if (stashed) {
        const pr = await window.gitAPI.popStash(0)
        if (pr.success) showToast(`${t('toast.checkoutOk', name)}${t('toast.stashRestoredSuffix')}`)
        else showToast(`${t('toast.checkoutOk', name)}${t('toast.stashRestoreFailSuffix')}`, 'err')
      } else {
        showToast(t('toast.checkoutOk', name))
      }
      await loadRepoData()
    } else {
      if (stashed) await window.gitAPI.popStash(0)
      showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
    }
  }
  // Checking out a tag detaches HEAD — git's own behaviour, but silent enough
  // that the toast says so explicitly rather than leaving the user wondering
  // why the branch indicator changed (v1.23.0).
  const handleCheckoutTag = async (name: string) => {
    const r = await window.gitAPI.checkout(name)
    if (r.success) { showToast(t('toast.tagCheckedOut', name)); await loadRepoData() }
    else showToast(t('toast.checkoutErr', r.error ?? ''), 'err')
  }
  const handleCreateBranch = useCallback(async () => {
    const name = await showPrompt(t('prompt.newBranch'))
    if (!name) return
    try {
      const r = await window.gitAPI.createBranch(name)
      if (r.success) { showToast(t('toast.branchCreated', name)); await loadRepoData() }
      else showToast(t('toast.err', r.error ?? ''), 'err')
    } catch (e: any) {
      showToast(t('toast.unexpected', e?.message ?? e), 'err')
    }
  }, [showPrompt, showToast, loadRepoData])
  const handleDeleteBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteBranch', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteBranch(name)
    if (r.success) { showToast(t('toast.branchDeleted', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  // Abandoning a branch means both ends of it. One confirmation, and the local
  // side goes first so a remote that refuses (protected branch) leaves the pair
  // visibly half-done rather than silently dropping the local work.
  const handleDeleteBranchBoth = async (name: string, remoteName: string) => {
    const ok = await showConfirm(t('prompt.deleteBoth', name, remoteName), true)
    if (!ok) return
    const local = await window.gitAPI.deleteBranch(name)
    if (!local.success) { showToast(t('toast.err', local.error ?? ''), 'err'); return }
    const remote = await window.gitAPI.deleteRemoteBranch(`remotes/${remoteName}`)
    if (remote.success) showToast(t('toast.branchesDeleted', name, remoteName))
    else showToast(t('toast.err', remote.error ?? ''), 'err')
    await loadRepoData()
  }
  const handleMergeBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.mergeBranch', name, currentBranch))
    if (!ok) return
    await guardConflict(
      () => window.gitAPI.predictConflicts(name),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.merge(name)
        if (r.success) { showToast(t('toast.mergeOk', name)); await loadRepoData() }
        else showToast(t('toast.mergeErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }
  const handlePushBranch = async (name: string) => {
    setLoading(true)
    const r = await window.gitAPI.pushBranch(name)
    if (r.success) { showToast(t('toast.pushOk', name)); await loadRepoData() }
    else showToast(t('toast.pushErr', r.error ?? ''), 'err')
    setLoading(false)
  }
  const handleDeleteRemoteBranch = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteRemoteBranch', name), true)
    if (!ok) return
    setLoading(true)
    const r = await window.gitAPI.deleteRemoteBranch(name)
    if (r.success) { showToast(t('toast.branchDeleted', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }
  const handleSetUpstream = async (name: string) => {
    const r = await window.gitAPI.setUpstream(name)
    if (r.success) { showToast(t('toast.upstreamSet', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleRenameBranch = async (name: string) => {
    const newName = await showPrompt(t('prompt.renameBranch', name), name)
    if (!newName || newName === name) return
    const r = await window.gitAPI.renameBranch(name, newName)
    if (r.success) { showToast(t('toast.branchRenamed', newName)); await loadRepoData() }
    else showToast(t('toast.renameErr', r.error ?? ''), 'err')
  }
  // ── Commit context menu operations ─────────────────────────
  const handleCreateBranchAt = async (hash: string) => {
    const name = await showPrompt(t('prompt.newBranch'))
    if (!name) return
    const checkout = await showConfirm(t('prompt.checkoutNow', name))
    try {
      const r = await window.gitAPI.createBranchAt(name, hash, checkout)
      if (r.success) {
        showToast(checkout ? t('toast.branchCreatedCheckout', name) : t('toast.branchCreated', name))
        await loadRepoData()
      } else {
        showToast(t('toast.err', r.error ?? ''), 'err')
      }
    } catch (e: any) {
      showToast(t('toast.unexpected', e?.message ?? e), 'err')
    }
  }
  const handleCherryPick = async (hash: string) => {
    await guardConflict(
      // Cherry-pick = 3-way merge with the commit's parent as base.
      () => window.gitAPI.predictConflicts(hash, 'HEAD', `${hash}^`),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.cherryPick(hash)
        if (r.success) { showToast(t('toast.cherryPickOk', hash.slice(0, 7))); await loadRepoData() }
        else showToast(t('toast.cherryPickErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }
  const handleRevert = async (hash: string) => {
    await guardConflict(
      // Revert = apply the inverse: base is the commit, "theirs" its parent.
      () => window.gitAPI.predictConflicts(`${hash}^`, 'HEAD', hash),
      async () => {
        setLoading(true)
        const r = await window.gitAPI.revert(hash)
        if (r.success) { showToast(t('toast.revertOk', hash.slice(0, 7))); await loadRepoData() }
        else showToast(t('toast.revertErr', r.error ?? ''), 'err')
        setLoading(false)
      },
    )
  }
  const handleReset = async (hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    if (mode === 'hard') {
      const ok = await showConfirm(t('prompt.resetHard', hash.slice(0, 7)), true)
      if (!ok) return
    }
    setLoading(true)
    const r = await window.gitAPI.reset(hash, mode)
    if (r.success) {
      showToast(t('toast.resetOk', mode, hash.slice(0, 7)), 'ok', undoAction())
      setSelectedCommit(null)
      await loadRepoData()
    } else {
      showToast(t('toast.resetErr', r.error ?? ''), 'err')
    }
    setLoading(false)
  }
  // Reword works on any commit: HEAD is a plain amend; any other commit goes
  // through a targeted mini-rebase (pick everything, reword just that one),
  // reusing the same interactiveRebase(sequence, messages) infra the
  // interactive-rebase planner uses for squash/reword messages.
  // `presetMsg` (AI recompose) prefills the review prompt with a proposed
  // message instead of the current one — the user still reviews and confirms.
  /**
   * Put `message` on a commit that is not the tip, by replaying the range from
   * its parent with a `reword` step. Every commit after it gets a new sha.
   *
   * Split out of handleRewordCommit so the commit panel's inline editor can
   * apply what the user already typed, instead of opening a second prompt on
   * top of the text they just wrote.
   */
  const applyReword = async (hash: string, message: string) => {
    const current = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (!current || current.parents.length === 0) {
      showToast(t('toast.err', t('toast.cannotRewordFirst')), 'err')
      return
    }
    setLoading(true)
    const seq = await window.gitAPI.getRebaseSequence(current.parents[0])
    const sequence = seq.commits.map(c => ({ action: c.hash === current.hash ? 'reword' : 'pick', hash: c.hash }))
    const r = await window.gitAPI.interactiveRebase(sequence, [message])
    setLoading(false)
    if (r.success) { showToast(t('toast.messageEdited')); await loadRepoData() }
    else if ((r as { conflict?: boolean }).conflict) { showToast(r.error ?? t('toast.rebaseConflict'), 'err'); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleRewordCommit = async (hash: string, presetMsg?: string) => {
    const current = commits.find(c => c.hash === hash || c.hash.startsWith(hash))
    if (!current) return
    const isHead = current.refs.some(r => r.includes('HEAD ->') && r.includes(currentBranch))

    if (isHead) {
      const fullMsg = (await window.gitAPI.getLastCommitMessage()).message || current.message
      const newMsg = await showPrompt(t('prompt.editMessage'), presetMsg ?? fullMsg, true)
      if (newMsg === null || newMsg.trim() === '' || newMsg === fullMsg) return
      const r = await window.gitAPI.amendMessage(newMsg)
      if (r.success) { showToast(t('toast.messageEdited')); await loadRepoData() }
      else showToast(t('toast.err', r.error ?? ''), 'err')
      return
    }

    if (current.parents.length === 0) {
      showToast(t('toast.err', t('toast.cannotRewordFirst')), 'err')
      return
    }
    const newMsg = await showPrompt(t('prompt.editMessage'), presetMsg ?? current.message, true)
    if (newMsg === null || newMsg.trim() === '' || newMsg === current.message) return
    await applyReword(hash, newMsg)
  }
  const handleDropCommit = async (hash: string) => {
    const ok = await showConfirm(t('prompt.dropCommit', hash.slice(0, 7)), true)
    if (!ok) return
    setLoading(true)
    const r = await window.gitAPI.dropCommit(hash)
    if (r.success) { showToast(t('toast.commitDropped', hash.slice(0, 7)), 'ok', undoAction()); setSelectedCommit(null); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }
  // Batch over the multi-selection (#69). Cherry-pick loops the existing
  // single call, OLDEST first, and stops where git stops — the first
  // conflict leaves the repo mid-pick and the conflict UI takes over, which
  // is the honest outcome, reported as far-it-got. Drop is ONE call: a loop
  // of drops would chase hashes its own first step rewrote.
  const handleCherryPickMany = async (hashes: string[]) => {
    setLoading(true)
    let done = 0
    for (const h of hashes) {
      const r = await window.gitAPI.cherryPick(h)
      if (!r.success) {
        setLoading(false)
        showToast(t('toast.cherryPickManyErr', done, hashes.length, r.error ?? ''), 'err')
        await loadRepoData()
        return
      }
      done++
    }
    setLoading(false)
    showToast(t('toast.cherryPickManyOk', done))
    await loadRepoData()
  }
  const handleDropCommits = async (hashes: string[]) => {
    const ok = await showConfirm(t('prompt.dropCommits', hashes.length), true)
    if (!ok) return
    setLoading(true)
    const r = await (window.gitAPI as any).dropCommits(hashes)
    if (r?.success) { showToast(t('toast.commitsDropped', hashes.length), 'ok', undoAction()); setSelectedCommit(null); await loadRepoData() }
    else showToast(t('toast.err', r?.error ?? ''), 'err')
    setLoading(false)
  }
  const handlePushToCommit = async (hash: string) => {
    setLoading(true)
    const r = await window.gitAPI.pushToCommit(hash)
    if (r.success) showToast(t('toast.pushedTo', hash.slice(0, 7)))
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }
  const handleCreatePatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    const r = await window.gitAPI.savePatchFile(res.patch, `${hash.slice(0, 7)}.patch`)
    if (r.success) showToast(t('toast.patchSaved', r.path?.split('/').pop() ?? ''))
    else if (!r.canceled) showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleCopyPatch = async (hash: string) => {
    const res = await window.gitAPI.createPatch(hash)
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    navigator.clipboard.writeText(res.patch)
    showToast(t('toast.patchCopied'))
  }
  const handleCreateWorktreeAt = async (hash: string) => {
    const dir = await window.gitAPI.selectDirectory(t('worktree.selectDir'))
    if (!dir.path) return
    const branch = await showPrompt(t('worktree.branchPrompt'), '')
    if (branch === null) return
    const r = await window.gitAPI.addWorktree(dir.path, hash, branch || undefined)
    if (r.success) showToast(t('toast.worktreeCreated', dir.path.split('/').pop() ?? ''))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleCopyBranchLink = (name: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.branch(remoteRepo, name))
    showToast(t('toast.linkCopied'))
  }
  // Restoring writes over the working copy, so it asks first — and it lands as
  // a pending change rather than a staged one, which is what makes "I did not
  // mean that" a diff you can read instead of an unstage.
  const handleRestoreFile = async (hash: string, filePath: string) => {
    const ok = await showConfirm(t('confirm.restoreFile', filePath, hash.slice(0, 7)), true)
    if (!ok) return
    const r = await window.gitAPI.restoreFileFromCommit(hash, [filePath])
    if (r.success) { showToast(t('toast.fileRestored', filePath)); loadRepoData(true) }
    else showToast(r.error ?? t('toast.restoreFailed'), 'err')
  }
  const handleCopyCommitLink = (hash: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.commit(remoteRepo, hash))
    showToast(t('toast.linkCopied'))
  }
  // Every branch action, wired to the state that only lives here, for any
  // surface that cannot assemble the menu itself. The graph used to build its
  // own thin version and so quietly lacked Push, Rename, Delete and the rest;
  // it now asks for this one instead.
  const branchMenuItems = useCallback((
    target: { name: string; display: string; current: boolean; remote: boolean },
    extras?: BranchMenuExtras,
  ): MenuItemDef[] => {
    // A chip carries git's decoration (`origin/x`); handlers and branch
    // metadata are keyed by the branch-list form (`remotes/origin/x`).
    const ref = canonicalRef(target.name, branches)
    const short = ref.replace(/^remotes\/[^/]+\//, '')
    const publishedAs = publishedNameFor(ref, branches) ?? undefined
    const pr = prIntentFor(ref)
    return buildBranchMenu(
      { ...target, name: ref, pr: pr ?? undefined, publishedAs },
      {
        currentBranch,
        soloed: soloBranch === ref,
        hidden: isRefHidden(ref, visibility, remoteNames),
        favorite: branchMeta.isFavorite(ref),
        issue: branchMeta.issueFor(ref),
      },
      {
        onCheckout: () => handleCheckout(target.remote ? short : ref),
        onPull: handlePull,
        onPush: () => handlePushBranch(ref),
        onSetUpstream: () => handleSetUpstream(ref),
        onCreatePR: pr ? () => handleStartPR(pr) : undefined,
        onMerge: () => handleMergeBranch(ref),
        onRebaseOnto: () => handleRebaseOnto(ref),
        onCompare: () => openViewTab({ view: 'compare', a: currentBranch, b: ref, axis: 'diverged', label: `${currentBranch} … ${ref}` }),
        onOpenOnRemote: () => handleOpenBranchOnRemote(ref),
        onAssociateIssue: () => setIssueModalBranch(ref),
        onToggleFavorite: () => branchMeta.toggleFavorite(ref),
        onToggleSolo: () => setSoloBranch(prev => prev === ref ? null : ref),
        onToggleHide: () => toggleHidden('branches', ref),
        onExplain: () => setAiRead({ kind: 'branch', ref, label: target.display }),
        onChangelog: () => setAiRead({ kind: 'changelog', ref, label: target.display }),
        onCopyName: () => navigator.clipboard.writeText(target.display),
        onCopyLink: () => handleCopyBranchLink(ref),
        onRename: () => handleRenameBranch(ref),
        onDelete: () => handleDeleteBranch(ref),
        onDeleteRemote: () => handleDeleteRemoteBranch(target.remote ? ref : `remotes/${publishedAs}`),
        onDeleteBoth: publishedAs ? () => handleDeleteBranchBoth(ref, publishedAs) : undefined,
      },
      t,
      extras
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches, currentBranch, soloBranch, visibility, remoteNames, branchMeta, prIntentFor, githubOwnerRepo, t])
  // Branch strip above the staging file list (v1.22.0) — same actions as the
  // toolbar and the ⋮ menu, just brought next to the files they apply to.
  const branchStripProps = {
    branch: currentBranch,
    ahead: tracking.ahead,
    behind: tracking.behind,
    onPush: handlePush,
    onPull: handlePull,
    onFetch: handleFetch,
    issue: branchMeta.issueFor(currentBranch),
    pr: currentBranchPR,
    onAssociateIssue: () => setIssueModalBranch(currentBranch),
    // Where a linked reference points. The tracker's own URL first, then the
    // configured patterns; a GitHub number falls back to the repository's own
    // issue URL, which is the one thing issueRefUrl cannot build for itself.
    onOpenIssue: (ref: LinkedIssue) => {
      const url = issueRefUrl(ref, autolinks)
        ?? (ref.provider === 'github' && remoteRepo && /^\d+$/.test(ref.key)
          ? remoteUrl.issue(remoteRepo, Number(ref.key))
          : null)
      if (url) window.gitAPI.openExternal(url)
    },
    menuState: {
      soloed: soloBranch === currentBranch,
      hidden: isRefHidden(currentBranch, visibility, remoteNames),
      favorite: branchMeta.isFavorite(currentBranch),
    },
    menuActions: {
      onPull: handlePull,
      onPush: handlePush,
      onSetUpstream: () => handleSetUpstream(currentBranch),
      onCreatePR: currentBranchPR ? () => handleStartPR(currentBranchPR) : undefined,
      onOpenOnRemote: () => handleOpenBranchOnRemote(currentBranch),
      onOpenBranchesOnRemote: handleOpenBranchesOnRemote,
      onAssociateIssue: () => setIssueModalBranch(currentBranch),
      onToggleFavorite: () => branchMeta.toggleFavorite(currentBranch),
      onToggleSolo: () => setSoloBranch(prev => prev === currentBranch ? null : currentBranch),
      onCopyName: () => navigator.clipboard.writeText(currentBranch),
      onRename: () => handleRenameBranch(currentBranch),
    },
  }

  // ── What the staging pane says on a clean tree (#189) ───────────
  // The panel has said this since v1.22.0 and the desktop said nothing: an
  // empty file list and a commit button that cannot be pressed. Same component,
  // same rule — a row is drawn only when it is true of the repository — with
  // the desktop's own way of reaching a list: the sidebar section, opened and
  // scrolled to, since the desktop stacks its sections instead of choosing one
  // on a rail.
  const revealInSidebar = (id: string) => { setSidebarTab('list'); revealSection(id) }
  const workingEmptyState = {
    state: {
      branch: currentBranch,
      // The desktop reads "published" the way every other menu here does —
      // a remote branch of the same name (publishedNameFor) — because the
      // session tracks ahead/behind, not the upstream's name.
      hasUpstream: !!publishedNameFor(currentBranch, branches),
      remoteName: remoteNames[0] ?? 'origin',
      ahead: tracking.ahead,
      behind: tracking.behind,
      openPRs: githubPRs?.length,
    },
    actions: {
      // Nowhere to publish to is not a next step: a repository with no remote
      // would get a row that opens a push and fails on it.
      onPublish: remoteNames.length > 0 && !publishedNameFor(currentBranch, branches)
        ? () => handleSetUpstream(currentBranch) : undefined,
      onPush: handlePush,
      onPull: handlePull,
      // What this branch would bring — the compare a pull request would show.
      // Comparing a branch with itself is not a review, so not on the default
      // branch, and not when we do not know which one that is.
      onReviewChanges: defaultBranch && currentBranch && currentBranch !== defaultBranch
        ? () => openViewTab({ view: 'compare', a: defaultBranch, b: currentBranch, axis: 'diverged', label: `${defaultBranch} … ${currentBranch}` })
        : undefined,
      onShowPRs: githubPRs !== undefined ? () => revealInSidebar('prs') : undefined,
      onStartFromIssue: githubOwnerRepo ? () => revealInSidebar('issues') : undefined,
      onStartReviewPR: githubPRs?.length ? () => revealInSidebar('prs') : undefined,
      onApplyStash: stashes.length > 0 ? () => revealInSidebar('stash') : undefined,
      onCreateWorktree: () => revealInSidebar('worktrees'),
      onCreateBranch: handleCreateBranch,
      onSwitchBranch: () => revealInSidebar('local'),
    },
  }
  // Drag branch A onto a target. `targetBranch` (B) is set when the drop landed
  // on a branch tip, which is the only case that offers "merge". Direction
  // follows the gesture: merge A INTO B, rebase A ONTO B, reset A to the target.
  const handleBranchDrop = async (branch: string, hash: string, action: 'reset' | 'rebase' | 'merge', targetBranch?: string) => {
    if (action === 'merge' && !targetBranch) return   // merge needs a branch to merge into
    const short = hash.slice(0, 7)
    if (action === 'reset') {
      const ok = await showConfirm(t('prompt.dropReset', branch, targetBranch ?? short), true)
      if (!ok) return
    }
    // merge updates the TARGET branch (and checks it out); rebase/reset update A.
    const updated = action === 'merge' ? targetBranch! : branch
    const run = async () => {
      setLoading(true)
      const r = action === 'reset'
        ? await window.gitAPI.moveBranchTo(branch, hash)
        : action === 'rebase'
          ? await window.gitAPI.rebaseBranchOnto(branch, hash)             // rebase A onto B's tip
          : await window.gitAPI.mergeCommitInto(targetBranch!, branch)     // checkout B, merge A (merge A into B)
      if (r.success) {
        showToast(t('toast.branchDropOk', updated), 'ok', undoAction())
      } else {
        showToast(t('toast.err', r.error ?? ''), 'err')
      }
      // Always load repo data to catch conflicts that prevent success
      await loadRepoData()
      setLoading(false)
    }
    // Reset just moves a ref — it can't conflict. Merge/rebase can.
    if (action === 'reset') { await run(); return }
    await guardConflict(
      action === 'merge'
        ? () => window.gitAPI.predictConflicts(branch, targetBranch)       // merge A into B
        : () => window.gitAPI.predictRebaseConflicts(hash, branch),        // rebase A onto B's tip
      run,
    )
  }
  const handleMoveCommit = async (hash: string, direction: 'up' | 'down') => {
    setLoading(true)
    const r = await window.gitAPI.moveCommit(hash, direction)
    if (r.success) { showToast(t('toast.commitMoved'), 'ok', undoAction()); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
    setLoading(false)
  }
  // ── Tag operations ─────────────────────────────────────────
  const handleCreateTagAtCommit = async (hash: string) => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.tagMessage'))
    const r = await window.gitAPI.createTag(name, hash, message || undefined)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  // An annotated tag is its own git object — it carries an author, a date and a
  // message, which is what release tooling reads. The message is therefore
  // required here, unlike the lightweight tag above where it is optional.
  const handleCreateAnnotatedTagAtCommit = async (hash: string) => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.annotatedTagMessage'))
    if (!message) return
    const r = await window.gitAPI.createTag(name, hash, message)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleCreateTag = async () => {
    const name = await showPrompt(t('prompt.tagName'))
    if (!name) return
    const message = await showPrompt(t('prompt.tagMessage'))
    const r = await window.gitAPI.createTag(name, undefined, message || undefined)
    if (r.success) { showToast(t('toast.tagCreated', name)); await loadRepoData() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleDeleteTag = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteTag', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteTag(name)
    if (r.success) { showToast(t('toast.tagDeleted', name)); await loadTags() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handlePushTag = async (name: string) => {
    const r = await window.gitAPI.pushTag(name)
    if (r.success) showToast(t('toast.tagPushed', name))
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  const handleDeleteRemoteTag = async (name: string) => {
    const ok = await showConfirm(t('prompt.deleteRemoteTag', name), true)
    if (!ok) return
    const r = await window.gitAPI.deleteRemoteTag(name)
    if (r.success) { showToast(t('toast.tagDeletedRemote', name)); await loadTags() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }
  // ── Stash operations ───────────────────────────────────────
  const handleCreateStash = async (scope: StashScope = 'all') => {
    const message = await showPrompt(t('prompt.stashMessage'))
    if (message === null) return
    const r = await window.gitAPI.createStash(message || undefined, scope === 'all' ? undefined : { scope })
    if (r.success) { showToast(t('toast.stashCreated')); await Promise.all([loadStashes(), loadRepoData()]) }
    else showToast(t('toast.stashErr', r.error ?? ''), 'err')
  }
  const handleApplyStash = async (index: number) => {
    const r = await window.gitAPI.applyStash(index)
    if (r.success) { showToast(t('toast.stashApplied', index)); await loadRepoData() }
    else showToast(t('toast.applyErr', r.error ?? ''), 'err')
  }
  const handlePopStash = async (index: number) => {
    const r = await window.gitAPI.popStash(index)
    if (r.success) {
      showToast(t('toast.stashPopped', index))
      await Promise.all([loadStashes(), loadRepoData()])
    } else {
      showToast(t('toast.popErr', r.error ?? ''), 'err')
    }
  }
  const handleDropStash = async (index: number) => {
    const ok = await showConfirm(t('prompt.deleteStash', index), true)
    if (!ok) return
    const r = await window.gitAPI.dropStash(index)
    if (r.success) { showToast(t('toast.stashDropped', index)); await loadStashes() }
    else showToast(t('toast.dropErr', r.error ?? ''), 'err')
  }

  return {
    compareBaseHash, setCompareBaseHash, gitflowOpen, setGitflowOpen, pushModalOpen, setPushModalOpen, cloneOpen, setCloneOpen, initModalOpen, setInitModalOpen, handleCreateRepo, handleUndo, handleRedo, undoAction, handleFetch, handlePush, handlePushModal, handleStash, handlePop, handleTerminal, handlePull, handleGoTo, handleCheckout, handleCheckoutTag, handleCreateBranch, handleDeleteBranch, handleDeleteBranchBoth, handleMergeBranch, handlePushBranch, handleDeleteRemoteBranch, handleSetUpstream, handleRenameBranch, handleCreateBranchAt, handleCherryPick, handleRevert, handleReset, applyReword, handleRewordCommit, handleDropCommit, handleCherryPickMany, handleDropCommits, handlePushToCommit, handleCreatePatch, handleCopyPatch, handleCreateWorktreeAt, handleCopyBranchLink, handleRestoreFile, handleCopyCommitLink, branchMenuItems, branchStripProps, workingEmptyState, handleBranchDrop, handleMoveCommit, handleCreateTagAtCommit, handleCreateAnnotatedTagAtCommit, handleCreateTag, handleDeleteTag, handlePushTag, handleDeleteRemoteTag, handleCreateStash, handleApplyStash, handlePopStash, handleDropStash,
  }
}

export type AppActions = ReturnType<typeof useAppActions>
