// The GitHub side of the open repository: which remote is GitHub, the lists it loads, the pull-request intents, and the actions that open there.
import React, { useState, useCallback, useMemo } from 'react'
import { type LinkedIssue } from '../hooks/useBranchMeta'
import { issueBranchName } from '../utils/issueBranch'
import type { GithubListItem } from '../components/Sidebar/Sidebar'
import { issueRefLabel } from '../utils/issueRef'
import { parseAutolinks } from '../utils/autolinks'
import { prIntentFor as computePRIntent, type PRIntent } from '../components/ContextMenu/prIntent'
import { repoFromRemotes, remoteUrl } from '../utils/remoteUrl'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'

export function useAppGithub(app: AppChrome & RepoSession) {
  const { showPrompt, t, getSetting, showToast, branches, currentBranch, setRemoteNames, branchMeta, setGithubRepoUrl, githubOwnerRepo, setGithubOwnerRepo, remoteRepo, setRemoteRepo, defaultBranch, setDefaultBranch, loadRepoData } = app

  const [issueModalBranch, setIssueModalBranch] = useState<string | null>(null)
  const [githubUser, setGithubUser] = useState<{ login: string; avatar: string } | null>(null)
  const [githubConnected, setGithubConnected] = useState(false)
  // The two GitHub lists the sidebar shows as sections. `undefined` while there
  // is no GitHub here or no answer yet — the sections then do not render at
  // all, which is not the same as rendering an empty one.
  const [githubPRs, setGithubPRs] = useState<GithubListItem[] | undefined>()
  /** Read inside loadGithubLists without making it depend on the lists. */
  const githubPRsRef = React.useRef(githubPRs);
  const [githubIssues, setGithubIssues] = useState<GithubListItem[] | undefined>()
  const githubIssuesRef = React.useRef(githubIssues);
  // The signed-in login — what the account groups of PULL REQUESTS filter on.
  const [githubLogin, setGithubLogin] = useState<string | null>(null)
  // The issue being read in the centre (§3 bis) — the third layout: toolbar
  // and left panel kept, graph replaced, commit panel not shown. Belongs to
  // the repository, so a repo switch closes it.
  const [issueDetail, setIssueDetail] = useState<{ kind: 'pr' | 'issue'; item: GithubListItem } | null>(null)
  const [prModalOpen, setPrModalOpen] = useState(false)
  // Which pull request the composer is opening — head, base and whether the
  // head still has to be pushed. Decided by prIntentFor, never by the composer.
  const [prIntent, setPrIntent] = useState<PRIntent | null>(null)
  // The reference patterns from Settings › GitHub — what lets a linked
  // reference open even when no tracker API is wired for it.
  const autolinks = useMemo(() => parseAutolinks(getSetting('autolinks', '')), [getSetting])
  // ── Open repo helpers ──────────────────────────────────────
  // Which section a manual refresh is reading, and a tick per section that
  // tells the saved-filter groups to bypass the search cache (#133).
  const [githubRefreshing, setGithubRefreshing] = useState<'prs' | 'issues' | null>(null)
  const [githubRefreshTick, setGithubRefreshTick] = useState({ prs: 0, issues: 0 })
  /** Bumped by each background poll, so the saved filters re-query with it. */
  const [githubPollTick, setGithubPollTick] = useState(0)
  /**
   * `silent` is a poll rather than something the user asked for (#141). Two
   * things change: a refused read leaves the lists exactly as they are instead
   * of taking the sections away, and nothing is written when the answer came
   * back `notModified` — a list that reorders under an open hover card is
   * worse than a list that is a minute old.
   */
  const loadGithubLists = useCallback(async (base: { owner: string; repo: string }, only?: 'prs' | 'issues', silent = false) => {
    void (window.gitAPI as any).githubGetUser?.()
      .then((r: any) => setGithubLogin(r?.user?.login ?? null))
      .catch(() => setGithubLogin(null))
    const rows = (list: any[] | undefined, kind: 'pr' | 'issue'): GithubListItem[] =>
      (list ?? []).map((x: any) => ({
        number: x.number, title: x.title, author: x.author,
        draft: kind === 'pr' ? !!x.draft : undefined, url: x.url,
        createdAt: x.createdAt, comments: x.comments, labels: x.labels,
        headRef: x.headRef, baseRef: x.baseRef,
        body: x.body, assignees: x.assignees, reviewers: x.reviewers,
      }))
    try {
      // `only` narrows it to the section whose button was pressed: the two are
      // two calls, and refreshing both because one looks stale spends two
      // requests to answer one question.
      const [prs, issues] = await Promise.all([
        only === 'issues' ? null : (window.gitAPI as any).githubListPRs(base.owner, base.repo).catch(() => null),
        only === 'prs' ? null : (window.gitAPI as any).githubListIssues(base.owner, base.repo).catch(() => null),
      ])
      // A refused read costs that section's list, never the section itself —
      // the rule the saved filters already follow. Except on a poll, where it
      // costs nothing at all: the user did not ask, so a blip must not empty
      // what they are looking at.
      // ⚠️ `notModified` means "the same as the last body I handed out" — and
      // the ETag cache lives in the MAIN process, which outlives this renderer.
      // After a window reload the renderer holds nothing while that cache is
      // still warm, so the first load comes back 304. Skipping it there left
      // the sections undefined, which is how they disappear entirely rather
      // than showing as empty. It is only safe to skip when there is already
      // something to keep — and the answer carries the body either way.
      const put = (r: any, current: any, apply: (v: any) => void, shape: () => any) => {
        if (r?.notModified && current !== undefined) return
        if (r?.error) { if (!silent) apply(undefined); return }
        apply(shape())
      }
      if (only !== 'issues') put(prs, githubPRsRef.current, setGithubPRs, () => rows(prs?.prs, 'pr'))
      if (only !== 'prs') put(issues, githubIssuesRef.current, setGithubIssues, () => rows(issues?.issues, 'issue'))
    } catch {
      if (silent) return
      if (only !== 'issues') setGithubPRs(undefined)
      if (only !== 'prs') setGithubIssues(undefined)
    }
  }, [])
  /** The section headers' refresh button — one section, and never two at once. */
  const refreshGithubSection = useCallback(async (section: 'prs' | 'issues') => {
    if (!githubOwnerRepo || githubRefreshing) return
    setGithubRefreshing(section)
    try {
      await loadGithubLists(githubOwnerRepo, section)
      // Only after the list is back: the tick is what makes each saved filter
      // re-query with `force`, and they should not race the list they sit under.
      setGithubRefreshTick(t => ({ ...t, [section]: t[section] + 1 }))
    } finally {
      setGithubRefreshing(null)
    }
  }, [githubOwnerRepo, githubRefreshing, loadGithubLists])
  // The composer belongs to the repository it opened on. Left in state, a
  // drawer open when the tab was closed greeted the NEXT open of the repo —
  // with an intent computed for branches that may have moved since.
  const [issueComposerOpen, setIssueComposerOpen] = useState(false)
  const detectGithub = useCallback(async () => {
    const detected = await (window.gitAPI as any).githubDetectRepo()
    setGithubOwnerRepo(detected?.owner && detected?.repo
      ? { owner: detected.owner, repo: detected.repo } : null)
    // The lists follow the repository, and a repository with no GitHub — or no
    // token — simply has no sections rather than two empty ones.
    if (detected?.owner && detected?.repo) {
      void loadGithubLists({ owner: detected.owner, repo: detected.repo })
    } else {
      setGithubPRs(undefined); setGithubIssues(undefined)
    }
    // Read the remote itself rather than assuming github.com: this is what
    // every link below is built from, and the only thing that knows the host.
    const rem = await window.gitAPI.getRemotes().catch(() => ({ remotes: [] }))
    const def = await (window.gitAPI as any).getDefaultRemote?.().catch(() => null)
    setRemoteNames((rem?.remotes ?? []).map((r: { name: string }) => r.name))
    const parsed = repoFromRemotes(rem?.remotes ?? [], def?.remote)
    setRemoteRepo(parsed)
    setGithubRepoUrl(parsed ? remoteUrl.repo(parsed) : null)
    const d = await (window.gitAPI as any).getDefaultBranch?.()
    setDefaultBranch(d?.branch ?? null)
  }, [])
  // Cloud Patches without a server: the patch goes to a secret gist and the
  // shareable link lands in the clipboard.
  const handleSharePatch = async (hash: string) => {
    const res = await (window.gitAPI as any).githubSharePatch(hash)
    if (res.error === 'not_authenticated') { showToast(t('toast.sharePatch.needAuth'), 'err'); return }
    if (res.error === 'gist_scope') { showToast(t('toast.sharePatch.gistScope'), 'err'); return }
    if (res.error) { showToast(t('toast.err', res.error), 'err'); return }
    navigator.clipboard.writeText(res.url)
    showToast(t('toast.sharePatch.copied'), 'ok', { label: t('toast.open'), onClick: () => (window.gitAPI as any).openExternal(res.url) })
  }
  // Which pull request a branch row offers — see prIntent.ts for the rules.
  // Handed to every surface that shows branch actions so they all agree.
  const prIntentFor = useCallback(
    (branchRef: string) =>
      githubOwnerRepo
        ? computePRIntent(branchRef, {
            currentBranch, defaultBranch, branches,
            // The list the panel already holds — the same one that puts the
            // #N chip on a branch. A row must not offer to start what that
            // chip says is already open (rule 6).
            openPRs: githubPRs,
          })
        : null,
    [githubOwnerRepo, currentBranch, defaultBranch, branches, githubPRs]
  )
  // The push itself happens in the composer, right before the GitHub call.
  // Navigation: this opens the composer, and the composer reports its own
  // outcome — nothing has changed yet at this point.
  const handleStartPR = (intent: PRIntent) => {
    if (!githubOwnerRepo) { showToast(t('pr.noRemote'), 'err'); return }
    setPrIntent(intent)
    setPrModalOpen(true)
  }
  // The four openers below are NAVIGATION — a browser comes to the front with
  // the page in it. They speak only to say they cannot go (#127, decided per
  // case): a chip confirming a window you are already looking at is the noise
  // that pushes a real one off the stack.
  const handleOpenCommitOnRemote = (hash: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.commit(remoteRepo, hash))
  }
  // The pull request the checked-out branch offers — null on the default
  // branch, which is where requests land rather than start. The toolbar
  // button, the branch strip and the PULL REQUESTS header's `+` all follow it.
  const currentBranchPR = prIntentFor(currentBranch)
  // A file inside a commit: the one place we know both a path and the exact ref
  // it existed at. Linking at the commit rather than at a branch is the whole
  // point — the line numbers stay true.
  const handleOpenFileOnRemote = (hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.file(remoteRepo, hash, filePath))
  }
  const handleCopyFileLink = (hash: string, filePath: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    navigator.clipboard.writeText(remoteUrl.file(remoteRepo, hash, filePath))
    showToast(t('toast.linkCopied'))
  }
  // The other direction of the v1.21.0 issue link, and the one people reach
  // for: you pick up an issue and you need a branch for it. The suggested name
  // is only a suggestion — what is typed wins — and the link is written for
  // the branch that was actually created, not for the one we proposed.
  const handleCreateBranchFromIssue = async (issue: { number: number; title: string; url: string }) => {
    // The GitHub panel is the only list we can enumerate, so what arrives here
    // is always a GitHub issue. It becomes a reference at this boundary rather
    // than deeper down, so the shape stored is the same one a typed reference
    // produces.
    const ref: LinkedIssue = {
      provider: 'github', key: String(issue.number), title: issue.title, url: issue.url,
    }
    const label = issueRefLabel(ref)
    const name = await showPrompt(t('gh.issue.branchPrompt', label), issueBranchName(ref.key, ref.title))
    if (!name) return
    const r = await window.gitAPI.createBranch(name)
    if (!r.success) { showToast(r.error ?? t('toast.branchFailed'), 'err'); return }
    branchMeta.setIssue(name, ref)
    showToast(t('toast.branchFromIssue', name, label))
    loadRepoData()
  }
  const handleOpenBranchesOnRemote = () => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branches(remoteRepo))
  }
  // Same as above one level up: /tree/<branch>. Existed for commits only until
  // v1.21.0, which is why "Open Branch on Remote" was nowhere to be found.
  const handleOpenBranchOnRemote = (name: string) => {
    if (!remoteRepo) { showToast(t('toast.noGithubRepo'), 'err'); return }
    window.gitAPI.openExternal(remoteUrl.branch(remoteRepo, name))
  }

  return {
    issueModalBranch, setIssueModalBranch, githubUser, setGithubUser, githubConnected, setGithubConnected, githubPRs, setGithubPRs, githubPRsRef, githubIssues, setGithubIssues, githubIssuesRef, githubLogin, setGithubLogin, issueDetail, setIssueDetail, prModalOpen, setPrModalOpen, prIntent, setPrIntent, autolinks, githubRefreshing, setGithubRefreshing, githubRefreshTick, setGithubRefreshTick, githubPollTick, setGithubPollTick, loadGithubLists, refreshGithubSection, issueComposerOpen, setIssueComposerOpen, detectGithub, handleSharePatch, prIntentFor, handleStartPR, handleOpenCommitOnRemote, currentBranchPR, handleOpenFileOnRemote, handleCopyFileLink, handleCreateBranchFromIssue, handleOpenBranchesOnRemote, handleOpenBranchOnRemote,
  }
}

export type AppGithub = ReturnType<typeof useAppGithub>
