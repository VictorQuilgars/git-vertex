// git:* — every git operation the renderer can ask for, answered by the repository that is open.
import { handle } from './handle'
import { ipcMain, dialog } from 'electron'
import { join, dirname } from 'path'
import { existsSync, readdirSync } from 'fs'
import { type CompareAxis } from '../git-service'
import { getRecentRepos } from '../recent-repos'
import { gitBinary, makeSimpleGit } from '../git-service'
import { resolveBase } from '../ai-material'
import { githubRepo } from '../../renderer/src/utils/remoteUrl'
import fs from 'fs'
import path from 'path'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join as pathJoin } from 'path'
import { maybeUpdateSubmodules, openRepoAt } from '../repo-session'
import { notify, state } from '../app-state'
import { readSettings } from '../settings-store'
import { ghApi } from '../github-client'
import { rawGit } from '../ai-runtime'

// ── Local repo scan (Launchpad WIPS + "View Repo" mapping) ──────────
// Discovering which local dirs are git repos (has a .git) is the slow part, so
// it's cached (60s TTL, or force). Discovery seeds from the recent repos and
// their sibling directories one level up, so newly-cloned neighbours show up on
// the next non-cached scan. `git status` runs fresh each call for accurate WIP
// counts; the GitHub remote name is cached per path (it rarely changes).
export let repoScanCache: { paths: string[]; ts: number } = { paths: [], ts: 0 }

export const fullnameCache = new Map<string, string | null>()

export function discoverLocalRepos(seeds: string[]): string[] {
  const found = new Set<string>()
  const parents = new Set<string>()
  for (const p of seeds) {
    if (existsSync(join(p, '.git'))) found.add(p)
    parents.add(dirname(p))
  }
  for (const parent of parents) {
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = join(parent, entry.name)
        if (existsSync(join(dir, '.git'))) found.add(dir)
      }
    } catch { /* unreadable dir — skip */ }
  }
  return [...found]
}

export function registerGitHandlers(): void {
  handle('git:open-repo', async () => {
    // Electron 43 changed where a dialog with no defaultPath opens: the
    // Downloads folder rather than the last one used. Nobody keeps their
    // repositories there, so the picker is told where to start — beside the
    // repository most recently opened, which is where the next one usually is.
    const [mostRecent] = getRecentRepos()
    const result = await dialog.showOpenDialog(state.mainWindow, {
      properties: ['openDirectory'],
      title: 'Open a Git repository',
      ...(mostRecent ? { defaultPath: dirname(mostRecent) } : {}),
    })
    if (result.canceled || result.filePaths.length === 0) return { error: 'cancelled' }
    return openRepoAt(result.filePaths[0])
  })

  handle('git:set-repo', async (_event, repoPath: string) => {
    return openRepoAt(repoPath)
  })

  // Create a new repository: git init in the chosen (possibly empty) directory,
  // then open it. Idempotent if the directory is already a repo.
  handle('git:init-repo', async (_event, dir: string) => {
    try {
      await makeSimpleGit(dir).init(['-b', readSettings().defaultBranchName?.trim() || 'main'])
      return openRepoAt(dir)
    } catch (e: any) {
      return { error: e.message }
    }
  })

  // "Initialize a Repository" (Local Only): create <location>/<name>,
  // git init on the given branch, optionally drop a .gitignore/LICENSE (fetched
  // from GitHub's template APIs) and run `git lfs install`.
  handle('git:init-advanced', async (_e, opts: { location: string; name: string; branch?: string; gitignore?: string; license?: string; lfs?: boolean }) => {
    try {
      const { mkdirSync, writeFileSync } = await import('fs')
      const target = join(opts.location, opts.name)
      mkdirSync(target, { recursive: true })
      await makeSimpleGit(target).init(['-b', opts.branch?.trim() || 'main'])
      const api = await ghApi()
      const token = api.token
      const ghHeaders: Record<string, string> = { Accept: 'application/vnd.github+json' }
      if (token) ghHeaders.Authorization = `Bearer ${token}`
      if (opts.gitignore) {
        try {
          const r = await fetch(`${api.base}/gitignore/templates/${opts.gitignore}`, { headers: ghHeaders })
          if (r.ok) { const d = await r.json() as any; writeFileSync(join(target, '.gitignore'), d.source ?? '') }
        } catch { /* optional */ }
      }
      if (opts.license) {
        try {
          const r = await fetch(`${api.base}/licenses/${opts.license}`, { headers: ghHeaders })
          if (r.ok) { const d = await r.json() as any; writeFileSync(join(target, 'LICENSE'), d.body ?? '') }
        } catch { /* optional */ }
      }
      if (opts.lfs) {
        try {
          const { execFile } = await import('child_process')
          const { promisify } = await import('util')
          await promisify(execFile)(gitBinary(), ['-C', target, 'lfs', 'install'])
        } catch { /* lfs not installed — skip */ }
      }
      return openRepoAt(target)
    } catch (e: any) { return { error: e.message } }
  })

  // ── IPC: Git read operations ───────────────────────────────────
  handle('git:get-log', async (_event, options: { maxCount?: number; all?: boolean; refs?: string[]; excludes?: string[] } = {}) => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getLog(options)
  })

  handle('git:get-branches', async () => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getBranches()
  })

  handle('git:get-diff', async (_event, commitHash: string) => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getDiff(commitHash)
  })

  handle('git:diff-between-commits', async (_event, fromHash: string, toHash: string | null, axis?: CompareAxis) => {
    if (!state.gitService) return { diff: '', error: 'No repo open' }
    return state.gitService.diffBetweenCommits(fromHash, toHash, axis)
  })

  handle('git:files-between-commits', async (_event, fromHash: string, toHash: string | null, axis?: CompareAxis) => {
    if (!state.gitService) return { files: [], error: 'No repo open' }
    return state.gitService.filesBetweenCommits(fromHash, toHash, axis)
  })

  handle('git:get-merge-base', async (_event, a: string, b: string) => {
    if (!state.gitService) return { base: null, error: 'No repo open' }
    return state.gitService.getMergeBase(a, b)
  })

  handle('git:get-commit-files', async (_event, commitHash: string) => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getCommitFiles(commitHash)
  })

  handle('git:get-commit-body', async (_event, hash: string) => {
    if (!state.gitService) return { body: '' }
    return state.gitService.getCommitBody(hash)
  })

  handle('git:get-status', async () => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getStatus()
  })

  handle('git:get-stashes', async () => {
    if (!state.gitService) return { error: 'No repo open' }
    return state.gitService.getStashes()
  })

  handle('git:get-tracking', async () => {
    if (!state.gitService) return { branch: null, upstream: null, ahead: 0, behind: 0 }
    return state.gitService.getTracking()
  })

  // ── IPC: Git write operations ──────────────────────────────────
  handle('git:checkout', async (_event, ref: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.checkout(ref)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  handle('git:create-branch', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.createBranch(name)
  })

  handle('git:delete-branch', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.deleteBranch(name)
  })

  handle('git:get-upstream', async () => {
    if (!state.gitService) return { upstream: null }
    return state.gitService.getUpstream()
  })

  handle('git:fetch', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const before = await state.gitService.getRemoteRefs()
    const result = await state.gitService.fetch()
    if (result.success) {
      const after = await state.gitService.getRemoteRefs()
      let changed = 0
      for (const ref of Object.keys(after)) {
        if (before[ref] !== after[ref]) changed++
      }
      if (changed > 0) {
        notify(
          'New commits available',
          changed === 1
            ? '1 remote branch was updated.'
            : `${changed} remote branches were updated.`,
          'notifyFetch'
        )
      }
    }
    return result
  })

  handle('git:push', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.push()
  })

  handle('git:push-to', async (_e, remote: string, branch: string, setUpstream: boolean, force = false) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.pushTo(remote, branch, setUpstream, force)
  })

  handle('git:pull', async (_event, mode?: 'ff' | 'ff-only' | 'rebase') => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.pull(mode)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  // ── IPC: Staging & commit ─────────────────────────────────────
  handle('git:get-working-changes', async () => {
    if (!state.gitService) return { staged: [], unstaged: [], untracked: [] }
    return state.gitService.getWorkingChanges()
  })

  handle('git:stage', async (_event, files: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.stage(files)
  })

  handle('git:stage-all', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.stageAll()
  })

  handle('git:unstage', async (_event, files: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.unstage(files)
  })

  handle('git:commit', async (_event, message: string, amend = false) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const sign = readSettings().gpgSign === 'true'
    const result = await state.gitService.commit(message, amend, sign)
    if (result.success) {
      const firstLine = message.split('\n')[0]
      notify('Commit created', firstLine, 'notifyCommit', false)
    }
    return result
  })

  handle('git:get-last-commit-message', async (_event, ref?: string) => {
    if (!state.gitService) return { message: '' }
    return state.gitService.getLastCommitMessage(ref)
  })

  handle('git:get-working-file-diff', async (_event, filepath: string, staged: boolean, context?: number) => {
    if (!state.gitService) return { diff: '' }
    return state.gitService.getWorkingFileDiff(filepath, staged, context)
  })

  handle('git:discard-file', async (_event, file: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.discardFile(file)
  })

  // ── IPC: Commit operations ─────────────────────────────────
  handle('git:cherry-pick', async (_event, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.cherryPick(hash)
  })

  handle('git:revert', async (_event, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.revert(hash)
  })

  handle('git:reset', async (_event, hash: string, mode: 'soft' | 'mixed' | 'hard') => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.reset(hash, mode)
  })

  handle('git:amend-message', async (_event, message: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.amendMessage(message)
  })

  handle('git:get-checkout-plan', async (_event, ref: string) => {
    if (!state.gitService) return { action: 'create-branch', error: 'No repo open' }
    return state.gitService.getCheckoutPlan(ref)
  })

  handle('git:checkout-tracking', async (_event, remoteRef: string, localName: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.checkoutTracking(remoteRef, localName)
  })

  handle('git:get-reword-plan', async (_event, hash: string) => {
    if (!state.gitService) return { canReword: false, isHead: false, rewrites: 0, reason: 'No repo open' }
    return state.gitService.getRewordPlan(hash)
  })

  handle('git:drop-commit', async (_event, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.dropCommit(hash)
  })

  handle('git:drop-commits', async (_event, hashes: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.dropCommits(hashes)
  })

  handle('git:move-commit', async (_event, hash: string, direction: 'up' | 'down') => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.moveCommit(hash, direction)
  })

  handle('git:diff-commit-to-working', async (_event, hash: string) => {
    if (!state.gitService) return { diff: '' }
    return state.gitService.diffCommitToWorking(hash)
  })

  // ── IPC: Branch operations ─────────────────────────────────
  handle('git:create-branch-at', async (_event, name: string, hash: string, checkout: boolean) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.createBranchAt(name, hash, checkout)
  })

  handle('git:rename-branch', async (_event, oldName: string, newName: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.renameBranch(oldName, newName)
  })

  handle('git:fast-forward-upstream', async () => {
    if (!state.gitService) return { success: false, error: 'No repository open' }
    return state.gitService.fastForwardToUpstream()
  })

  handle('git:merge', async (_event, branch: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.merge(branch)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  handle('git:predict-conflicts', async (_event, theirs: string, ours?: string, mergeBase?: string) => {
    if (!state.gitService) return { files: [], error: 'No repo open' }
    return state.gitService.predictConflicts(theirs, ours, mergeBase)
  })

  handle('git:predict-rebase-conflicts', async (_event, upstream: string, branch?: string) => {
    if (!state.gitService) return { files: [], error: 'No repo open' }
    return state.gitService.predictRebaseConflicts(upstream, branch)
  })

  handle('git:rebase-onto', async (_event, branch: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.rebaseOnto(branch)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  handle('git:push-branch', async (_event, branch: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.pushBranch(branch)
  })

  handle('git:push-to-commit', async (_event, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.pushToCommit(hash)
  })

  handle('git:create-patch', async (_event, hash: string) => {
    if (!state.gitService) return { patch: '', error: 'No repo open' }
    return state.gitService.createPatch(hash)
  })

  handle('git:delete-remote-branch', async (_event, branch: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.deleteRemoteBranch(branch)
  })

  handle('git:set-upstream', async (_event, branch: string, upstream?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.setUpstream(branch, upstream)
  })

  handle('git:move-branch-to', async (_event, branch: string, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.moveBranchTo(branch, hash)
  })

  handle('git:rebase-branch-onto', async (_event, branch: string, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.rebaseBranchOnto(branch, hash)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  handle('git:merge-commit-into', async (_event, branch: string, hash: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    const r = await state.gitService.mergeCommitInto(branch, hash)
    if (r.success) await maybeUpdateSubmodules()
    return r
  })

  // ── IPC: Tag operations ────────────────────────────────────
  handle('git:get-tags', async () => {
    if (!state.gitService) return { tags: [] }
    return state.gitService.getTags()
  })

  handle('git:create-tag', async (_event, name: string, hash?: string, message?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.createTag(name, hash, message)
  })

  handle('git:delete-tag', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.deleteTag(name)
  })

  handle('git:push-tag', async (_event, name: string, remote?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.pushTag(name, remote)
  })

  handle('git:delete-remote-tag', async (_event, name: string, remote?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.deleteRemoteTag(name, remote)
  })

  // ── IPC: Stash operations ──────────────────────────────────
  handle('git:create-stash', async (
    _event,
    message?: string,
    opts?: { scope?: 'all' | 'staged' | 'unstaged'; paths?: string[] },
  ) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.createStash(message, opts)
  })

  handle('git:rename-stash', async (_event, index: number, message: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.renameStash(index, message)
  })

  handle('git:apply-stash', async (_event, index: number) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.applyStash(index)
  })

  handle('git:pop-stash', async (_event, index: number) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.popStash(index)
  })

  handle('git:drop-stash', async (_event, index: number) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.dropStash(index)
  })

  handle('git:stash-diff', async (_event, index: number) => {
    if (!state.gitService) return { diff: '' }
    return state.gitService.getStashDiff(index)
  })

  // ── IPC: Blame ─────────────────────────────────────────────
  handle('git:get-blame', async (_event, hash: string, filepath: string) => {
    if (!state.gitService) return { lines: [] }
    return state.gitService.getBlame(hash, filepath)
  })

  // ── IPC: Submodules ────────────────────────────────────────
  handle('git:get-submodules', async () => {
    if (!state.gitService) return { submodules: [] }
    return state.gitService.getSubmodules()
  })

  handle('git:init-submodule', async (_event, path: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.initSubmodule(path)
  })

  handle('git:update-submodule', async (_event, path: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.updateSubmodule(path)
  })

  // ── IPC: Extended search & branch comparison ───────────────
  handle('git:search-in-diffs', async (_event, query: string) => {
    if (!state.gitService) return { hashes: [] }
    return state.gitService.searchInDiffs(query)
  })
  handle('git:locate-in-history', async (_event, hashes: string[], options?: { all?: boolean; refs?: string[]; excludes?: string[] }) => {
    if (!state.gitService) return { positions: {} }
    return state.gitService.locateInHistory(hashes, options)
  })

  handle('git:compare-branches', async (_event, current: string, other: string) => {
    if (!state.gitService) return { ahead: [], behind: [] }
    return state.gitService.compareBranches(current, other)
  })

  // ── IPC: Interactive Rebase ────────────────────────────────
  handle('git:get-rebase-sequence', async (_event, baseHash: string) => {
    if (!state.gitService) return { commits: [] }
    return state.gitService.getRebaseSequence(baseHash)
  })

  handle('git:interactive-rebase', async (_event, sequence: { action: string; hash: string }[], messages?: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.interactiveRebase(sequence, messages)
  })

  // ── IPC: Conflict resolution ───────────────────────────────
  handle('git:get-conflicted-files', async () => {
    if (!state.gitService) return { files: [] }
    return state.gitService.getConflictedFiles()
  })

  handle('git:get-conflict-versions', async (_event, filepath: string) => {
    if (!state.gitService) return { base: '', ours: '', theirs: '' }
    return state.gitService.getConflictVersions(filepath)
  })

  handle('git:get-file-content', async (_event, filepath: string) => {
    if (!state.gitService) return { content: '', error: 'No repo open' }
    return state.gitService.getFileContent(filepath)
  })

  handle('git:get-file-at-commit', async (_event, commitHash: string, filepath: string) => {
    if (!state.gitService) return { content: '', error: 'No repo open' }
    return state.gitService.getFileAtCommit(commitHash, filepath)
  })

  handle('git:restore-file', async (_event, commitHash: string, paths: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.restoreFileFromCommit(commitHash, paths)
  })

  handle('git:apply-patch', async (_event, patch: string, reverse: boolean) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.applyPatch(patch, reverse)
  })

  handle('git:mark-resolved', async (_event, filepath: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.markResolved(filepath)
  })

  handle('git:resolve-conflict', async (_event, filepath: string, content: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.resolveConflict(filepath, content)
  })

  handle('git:resolve-conflict-side', async (_event, filepath: string, side: 'ours' | 'theirs') => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.resolveConflictWithSide(filepath, side)
  })

  handle('git:continue-rebase', async (_event, messages?: string[]) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.continueRebase(messages)
  })

  handle('git:continue-merge', async (_event, message?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.continueMerge(message)
  })

  handle('git:abort-rebase', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.abortRebase()
  })

  handle('git:continue-cherry-pick', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.continueCherryPick()
  })

  handle('git:abort-cherry-pick', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.abortCherryPick()
  })

  handle('git:continue-revert', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.continueRevert()
  })

  handle('git:abort-revert', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.abortRevert()
  })

  handle('git:abort-merge', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.abortMerge()
  })

  handle('git:undo-last-action', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.undoLastAction()
  })

  handle('git:redo-last-action', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.redoLastAction()
  })

  handle('git:get-conflict-sides', async () => {
    if (!state.gitService) return { ours: '', theirs: '' }
    return state.gitService.getConflictSides()
  })

  handle('git:get-conflict-mode', async () => {
    if (!state.gitService) return { mode: null }
    return state.gitService.getConflictMode()
  })

  handle('git:get-merge-message', async () => {
    if (!state.gitService) return { message: '' }
    return state.gitService.getMergeMessage()
  })

  // ── IPC: Reflog ────────────────────────────────────────────
  handle('git:get-reflog', async () => {
    if (!state.gitService) return { entries: [] }
    return state.gitService.getReflog()
  })

  // ── IPC: File History ──────────────────────────────────────
  handle('git:get-file-history', async (_event, filepath: string) => {
    if (!state.gitService) return { commits: [] }
    return state.gitService.getFileHistory(filepath)
  })

  // ── IPC: Remotes ───────────────────────────────────────────
  handle('git:get-remotes', async () => {
    if (!state.gitService) return { remotes: [] }
    return state.gitService.getRemotes()
  })

  handle('git:add-remote', async (_event, name: string, url: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.addRemote(name, url)
  })

  handle('git:remove-remote', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.removeRemote(name)
  })

  handle('git:rename-remote', async (_event, oldName: string, newName: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.renameRemote(oldName, newName)
  })

  handle('git:fetch-remote', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.fetchRemote(name)
  })

  handle('git:get-default-remote', async () => {
    if (!state.gitService) return { remote: null, explicit: false }
    return state.gitService.getDefaultRemote()
  })

  handle('git:get-default-branch', async () => {
    if (!state.gitService) return { branch: null }
    return state.gitService.getDefaultBranch()
  })

  handle('git:set-default-remote', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.setDefaultRemote(name)
  })

  handle('git:prune-remote', async (_event, name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.pruneRemote(name)
  })

  handle('git:get-gone-branches', async () => {
    if (!state.gitService) return { branches: [] }
    return state.gitService.getGoneBranches()
  })

  handle('git:prune-gone-branches', async (_event, names: string[]) => {
    if (!state.gitService) return { success: false, deleted: [], error: 'No repo open' }
    return state.gitService.pruneGoneBranches(names)
  })

  // ── IPC: Gitflow ───────────────────────────────────────────
  handle('git:gitflow-status', async () => {
    if (!state.gitService) return { initialized: false, mainBranch: 'main', features: [], releases: [], hotfixes: [] }
    return state.gitService.gitflowStatus()
  })

  handle('git:gitflow-init', async () => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.gitflowInit()
  })

  handle('git:gitflow-start', async (_event, type: 'feature' | 'release' | 'hotfix', name: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.gitflowStart(type, name)
  })

  handle('git:gitflow-finish', async (_event, type: 'feature' | 'release' | 'hotfix', name: string, tagName?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.gitflowFinish(type, name, tagName)
  })

  // ── IPC: Worktrees ─────────────────────────────────────────
  handle('git:list-worktrees', async () => {
    if (!state.gitService) return { worktrees: [] }
    return state.gitService.listWorktrees()
  })

  handle('git:add-worktree', async (_event, path: string, ref: string, newBranch?: string) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.addWorktree(path, ref, newBranch)
  })

  handle('git:remove-worktree', async (_event, path: string, force?: boolean) => {
    if (!state.gitService) return { success: false, error: 'No repo open' }
    return state.gitService.removeWorktree(path, force)
  })

  /**
   * Would this branch conflict with the one it is going to land on? (#70)
   *
   * The toolbar's badge, and nothing more: a `merge-tree --write-tree` against
   * the branch's own base, which is resolved by the SAME function the AI
   * features use — a repository where the badge says "against origin/main" and
   * the changelog says "over main" would be two answers to one question.
   *
   * It fails open. A repository with no base, a merge-tree that cannot run: the
   * badge says it does not know, and nothing anywhere is blocked.
   */
  handle('git:conflict-outlook', async (_e, branch?: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    const raw = rawGit()
    let head = branch
    if (!head) {
      try { head = (await raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim() } catch { return { error: 'No branch' } }
    }
    if (!head || head === 'HEAD') return { base: null, files: [] }   // detached
    const base = await resolveBase(raw, head)
    if (!base) return { base: null, files: [] }
    const r = await state.gitService.predictConflicts(base, head)
    return { base, files: r.files, error: r.error }
  })

  // ── Git global config ──────────────────────────────────────────
  handle('git:get-global-config', async () => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const run = async (args: string[]) => {
      try { const r = await exec(gitBinary(), args); return r.stdout.trim() } catch { return '' }
    }
    return {
      userName: await run(['config', '--global', 'user.name']),
      userEmail: await run(['config', '--global', 'user.email']),
    }
  })

  handle('git:set-global-config', async (_e, userName: string, userEmail: string) => {
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    try {
      if (userName) await exec(gitBinary(), ['config', '--global', 'user.name', userName])
      if (userEmail) await exec(gitBinary(), ['config', '--global', 'user.email', userEmail])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  // Read a repo's README (first match) for the Repository Management details panel.
  handle('git:read-readme', async (_e, dir: string) => {
    try {
      const { readFileSync } = await import('fs')
      for (const n of ['README.md', 'README.MD', 'Readme.md', 'readme.md', 'README', 'README.txt', 'README.rst']) {
        const p = join(dir, n)
        if (existsSync(p)) return { content: readFileSync(p, 'utf-8'), name: n }
      }
      return { content: null }
    } catch (e: any) { return { error: e.message } }
  })

  handle('git:scan-local-repos', async (_e, force?: boolean) => {
    const now = Date.now()
    if (force || now - repoScanCache.ts > 60_000) {
      repoScanCache = { paths: discoverLocalRepos(getRecentRepos()), ts: now }
    }
    const { execFile } = await import('child_process')
    const { promisify } = await import('util')
    const exec = promisify(execFile)
    const env = { ...process.env, LC_ALL: 'C' }
    const repos = await Promise.all(repoScanCache.paths.map(async p => {
      let changed = 0, added = 0, deleted = 0, branch = ''
      try {
        const st = await exec(gitBinary(), ['-C', p, 'status', '--porcelain'], { env })
        changed = st.stdout.split('\n').filter(Boolean).length
      } catch { return null }   // not a real repo anymore — drop it
      // Line-level breakdown (tracked changes vs HEAD), shown as ✏ + −.
      try {
        const ss = await exec(gitBinary(), ['-C', p, 'diff', 'HEAD', '--shortstat'], { env })
        added = Number(ss.stdout.match(/(\d+) insertion/)?.[1] ?? 0)
        deleted = Number(ss.stdout.match(/(\d+) deletion/)?.[1] ?? 0)
      } catch { /* empty repo / no HEAD — leave 0 */ }
      try {
        const b = await exec(gitBinary(), ['-C', p, 'rev-parse', '--abbrev-ref', 'HEAD'])
        branch = b.stdout.trim()
      } catch { /* detached — leave blank */ }
      if (!fullnameCache.has(p)) {
        try {
          const r = await exec(gitBinary(), ['-C', p, 'remote', 'get-url', 'origin'])
          const { owner, repo } = githubRepo(r.stdout.trim())
          fullnameCache.set(p, owner && repo ? `${owner}/${repo}` : null)
        } catch { fullnameCache.set(p, null) }
      }
      return { path: p, name: p.split('/').pop() ?? p, changed, added, deleted, branch, fullname: fullnameCache.get(p) ?? null }
    }))
    return { repos: repos.filter(Boolean) }
  })

  // Clone to an explicit location (no native dialog) with Shallow/Sparse options —
  // used by the Clone modal.
  handle('git:clone-to', async (_e, opts: { url: string; location: string; name: string; shallow?: boolean; sparse?: boolean }) => {
    try {
      const target = pathJoin(opts.location, opts.name)
      const args: string[] = []
      if (opts.shallow) args.push('--depth', '1')
      if (opts.sparse) args.push('--sparse')
      // Embed the token for github.com HTTPS so private repos clone, then scrub it.
      const api = await ghApi()
      const token = api.token
      let url = opts.url
      const isGh = /^https:\/\/github\.com\//.test(url)
      if (token && isGh) url = url.replace('https://', `https://${token}@`)
      await makeSimpleGit().clone(url, target, args)
      if (token && isGh) { try { await makeSimpleGit(target).remote(['set-url', 'origin', opts.url]) } catch { /* keep */ } }
      return openRepoAt(target)
    } catch (e: any) { return { error: e.message } }
  })
}
