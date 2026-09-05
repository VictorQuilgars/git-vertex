// The tab strip and what it opens: repositories, views, the home, the settings — and the deep links that land in them.
import React, { useState, useCallback, useRef } from 'react'
import { CommitNode } from '../types'
import { type ViewTab, type AppTab, viewNeedsRepo, sameView, newTabId } from './shared'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'
import type { AppAi } from './useAppAi'

export function useAppTabs(app: AppChrome & RepoSession & AppGithub & AppConflicts & AppAi) {
  const { t, showToast, repoPath, setRepoPath, repoName, setRepoName, setCommits, selectedCommit, setSelectedCommit, setRecentRepos, clearRepoView, detectGithub, rebaseHash, setRebaseHash, setRebasePlanProposal, conflictResolverFile, setConflictResolverFile, setConflictResolverProposal, setCommitProposal } = app

  // ── Tabs (home / repo / launchpad) ──
  const [tabs, setTabs] = useState<AppTab[]>(() => [{ id: 'home-initial', kind: 'home' }])
  const [activeTabId, setActiveTabId] = useState<string | null>('home-initial')
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const selectedByTab = useRef<Map<string, CommitNode | null>>(new Map())
  // Repository Management is a full-page overlay (like Settings), reached from
  // the fixed 📁 button — it is NOT a tab.
  const [repoMgmtOpen, setRepoMgmtOpen] = useState(false)
  // Release notes shown once after an update (like VS Code's "what's new" tab).
  const [whatsNew, setWhatsNew] = useState<{ version: string; notes: string } | null>(null)
  // The "what's new" tab is a normal tab: it can stay open in the background
  // while you work in a repo. `whatsNewActive` is whether it's the current view.
  const [whatsNewActive, setWhatsNewActive] = useState(false)
  const applyRepo = useCallback(async (res: { path?: string; name?: string; error?: string }) => {
    if (res.path) {
      setWhatsNewActive(false)   // opening a repo leaves the what's-new view
      const name = res.name ?? res.path.split('/').pop()!
      setRepoPath(res.path)
      setRepoName(name)
      setSelectedCommit(null)
      setCommits([])
      const updated = await window.gitAPI.getRecentRepos()
      setRecentRepos(updated ?? [])
      await detectGithub()
      // Register or activate a tab for this repo
      setTabs(prev => {
        // Paths are NFC-normalized in the main process, but a tab registered
        // before that (or from a differently-normalized source) must still
        // match rather than open a second tab on the same repo.
        const existing = prev.find(tb => tb.kind === 'repo' && tb.path!.normalize('NFC') === res.path!.normalize('NFC'))
        if (existing) { setActiveTabId(existing.id); return prev }
        // Opening a repo from a home tab converts that tab in place (the
        // "New Tab" becomes the repo) rather than leaving an empty home behind.
        const active = prev.find(tb => tb.id === activeTabId)
        if (active && active.kind === 'home') {
          return prev.map(tb => tb.id === active.id ? { id: tb.id, kind: 'repo', path: res.path!, name } : tb)
        }
        const id = newTabId('repo')
        setActiveTabId(id)
        return [...prev, { id, kind: 'repo', path: res.path!, name }]
      })
    } else if (res.error && res.error !== 'cancelled') {
      showToast(t('toast.err', res.error), 'err')
    }
  }, [showToast, detectGithub, activeTabId])
  // #127, decided per case against the rule in Toast.tsx: opening a
  // repository is NAVIGATION — the whole window becomes that repository,
  // which is its own confirmation — so these two stay silent on success and
  // let applyRepo report a refusal.
  const handleOpenRepo = async () => applyRepo(await window.gitAPI.openRepo())
  const handleSetRepo = async (path: string) => applyRepo(await window.gitAPI.setRepo(path))
  // Open the current release notes on demand (welcome "Notes de version" link).
  const openReleaseNotes = async () => {
    const w = await (window.gitAPI as any).getReleaseNotes?.().catch(() => null)
    if (w) { setWhatsNew(w); setWhatsNewActive(true) }
    else showToast(t('toast.noReleaseNotes'), 'err')
  }
  // A mutation, but a SELF-EVIDENT one — the row leaves the list you removed
  // it from, in front of you. #127's rule sends those to silence.
  const handleRemoveRecent = async (path: string) => {
    const updated = await window.gitAPI.removeRecentRepo(path)
    setRecentRepos(updated ?? [])
  }
  // ── Deep links (gitgui://open — MCP open_in_git_vertex, etc.) ──
  // Open the repo, then route to the requested surface. Commit selection
  // waits for the log to load (deepLinkHash consumed by the effect below).
  const [deepLinkHash, setDeepLinkHash] = useState<string | null>(null)
  const applyDeepLink = useCallback(async (link: { repo: string; view: string; file?: string; hash?: string; proposalContent?: string } | null) => {
    if (!link?.repo) return
    await handleSetRepo(link.repo)
    // A deep link that carries a proposal but arrives without it, or with one
    // we can't parse, used to do nothing at all: the repo opened, no view
    // switched, no error anywhere. The agent meanwhile reported success, so
    // the user was told the message/plan was waiting in the app when it was
    // not. Every failure below is surfaced instead of swallowed.
    const proposalMissing = (what: string) => {
      console.error('[deeplink] missing proposal payload', link)
      showToast(t('deeplink.missing', what), 'err')
    }
    const proposalUnreadable = (what: string, e: unknown) => {
      console.error('[deeplink] malformed proposal payload', link, e)
      showToast(t('deeplink.unreadable', what), 'err')
    }

    if (link.view === 'resolve' && link.file) {
      setConflictResolverFile(link.file)
      // Preload an agent-proposed resolution into the manual editor for
      // review — never applied until the user clicks "Enregistrer & Résoudre".
      setConflictResolverProposal(link.proposalContent ?? null)
    } else if (link.view === 'commit' && link.hash) {
      setDeepLinkHash(link.hash)
    } else if (link.view === 'propose-commit') {
      // MCP propose_commit: preload the message (and proposed file list) into
      // the staging form — the user stages and commits themselves.
      if (!link.proposalContent) { proposalMissing(t('deeplink.what.commitMsg')); return }
      try {
        const p = JSON.parse(link.proposalContent)
        setCommitProposal({
          message: String(p.message ?? ''),
          files: Array.isArray(p.files) ? p.files.map(String) : [],
        })
        setSelectedCommit({
          hash: '__WIP__', shortHash: 'WIP', message: '//WIP',
          author: '', authorEmail: '', date: '', parents: [], refs: []
        })
      } catch (e) { proposalUnreadable(t('deeplink.what.commitMsgCap'), e) }
    } else if (link.view === 'propose-rebase') {
      // MCP propose_rebase_plan: open the visual rebase editor with the
      // agent's plan preloaded — the user reviews and launches it themselves.
      if (!link.hash) { proposalUnreadable(t('deeplink.what.rebasePlanCap'), 'missing base hash'); return }
      if (!link.proposalContent) { proposalMissing(t('deeplink.what.rebasePlan')); return }
      try {
        const p = JSON.parse(link.proposalContent)
        if (!Array.isArray(p.steps)) throw new Error('proposal has no steps array')
        setRebasePlanProposal(p.steps)
        setRebaseHash(link.hash)
      } catch (e) { proposalUnreadable(t('deeplink.what.rebasePlanCap'), e) }
    } else if (link.view !== 'graph') {
      // "graph" is just "open this repo" and needs nothing more; anything else
      // reaching here is a view we know but whose required parameter is absent.
      console.error('[deeplink] nothing to do for this link', link)
      showToast(t('deeplink.incomplete', link.view), 'err')
    }
  }, [showToast])
  // "+" → a fresh home ("New Tab") every time.
  const openHomeTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    const id = newTabId('home')
    setTabs(prev => [...prev, { id, kind: 'home' }])
    setActiveTabId(id)
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])
  // 🚀 → focus the Launchpad if one is open, otherwise open one.
  const openLaunchpadTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      const existing = prev.find(tb => tb.kind === 'launchpad')
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('launchpad')
      setActiveTabId(id)
      return [...prev, { id, kind: 'launchpad' }]
    })
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])
  // Appearance → "Browse N more themes". A tab rather than a pane: 4,000 rows
  // want the width, and the choice survives going to a repo and back. One at a
  // time, like the Launchpad.
  const openThemesTab = useCallback(() => {
    if (conflictResolverFile || rebaseHash) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      const existing = prev.find(tb => tb.kind === 'themes')
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('themes')
      setActiveTabId(id)
      return [...prev, { id, kind: 'themes' }]
    })
    clearRepoView()
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, clearRepoView])
  /**
   * Open a view in a tab — or reveal the one already showing it.
   *
   * The tab carries the repository it belongs to, because the main process
   * holds one repo at a time: a comparison tab left over from another
   * repository would quietly answer with this one's history.
   */
  const openViewTab = useCallback((body: ViewTab) => {
    // An operation in progress is a different matter from a missing repository:
    // switchTab already refuses to move while one runs, so opening a tab under
    // it would strand the user.
    if (conflictResolverFile || rebaseHash) return
    const needsRepo = viewNeedsRepo(body)
    if (needsRepo && !repoPath) return
    setWhatsNewActive(false)
    setRepoMgmtOpen(false)
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setTabs(prev => {
      // A repository's view is the same tab only within that repository; an
      // application view is the same tab everywhere, so it does not match on a
      // path it does not have.
      const existing = prev.find(tb => tb.kind === 'view' && tb.body && sameView(tb.body, body)
        && (!needsRepo || tb.path === repoPath))
      if (existing) { setActiveTabId(existing.id); return prev }
      const id = newTabId('view')
      setActiveTabId(id)
      return needsRepo
        ? [...prev, { id, kind: 'view' as const, path: repoPath!, name: repoName, body }]
        : [...prev, { id, kind: 'view' as const, body }]
    })
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, repoPath, repoName])
  const openSettingsTab = useCallback(() => openViewTab({ view: 'settings' }), [openViewTab])
  const switchTab = useCallback(async (tab: AppTab) => {
    setWhatsNewActive(false)   // clicking a tab leaves the what's-new view (tab stays open)
    setRepoMgmtOpen(false)
    if (tab.id === activeTabId) return
    if (conflictResolverFile || rebaseHash) return
    if (activeTabId) selectedByTab.current.set(activeTabId, selectedCommit)
    setActiveTabId(tab.id)
    // A view tab is bound to a repository too: its queries go through the main
    // process, which serves whichever repo was last set.
    if (tab.kind !== 'repo' && tab.kind !== 'view') { clearRepoView(); return }
    // A view with no path is about the application, not about a repository:
    // there is nothing to set, and whatever repository is open stays open
    // behind it so leaving the tab returns to it.
    if (tab.kind === 'view' && !tab.path) return
    if (tab.kind === 'view' && tab.path === repoPath) return
    const r = await window.gitAPI.setRepo(tab.path!)
    if (r.path) {
      setRepoPath(r.path)
      setRepoName(r.name ?? tab.name!)
      setCommits([])
      setSelectedCommit(selectedByTab.current.get(tab.id) ?? null)
      await detectGithub()
    } else if (r.error) {
      showToast(t('toast.err', r.error), 'err')
    }
  }, [activeTabId, selectedCommit, conflictResolverFile, rebaseHash, repoPath, detectGithub, showToast, clearRepoView])
  const closeTab = useCallback((id: string) => {
    selectedByTab.current.delete(id)
    setTabs(prev => {
      const idx = prev.findIndex(tb => tb.id === id)
      const next = prev.filter(tb => tb.id !== id)
      if (id === activeTabId) {
        // Never leave the window tab-less: fall back to a neighbour, or seed a
        // fresh home if this was the last tab.
        if (next.length === 0) {
          const home: AppTab = { id: newTabId('home'), kind: 'home' }
          setActiveTabId(home.id)
          clearRepoView()
          return [home]
        }
        const fallback = next[Math.max(0, idx - 1)]
        setActiveTabId(fallback.id)
        if (fallback.path) {
          window.gitAPI.setRepo(fallback.path!).then(r => {
            if (r.path) {
              setRepoPath(r.path)
              setRepoName(r.name ?? fallback.name!)
              setCommits([])
              setSelectedCommit(selectedByTab.current.get(fallback.id) ?? null)
              detectGithub()
            }
          })
        } else {
          clearRepoView()
        }
      }
      return next
    })
  }, [activeTabId, detectGithub, clearRepoView])
  const closeOtherTabs = useCallback((id: string) => {
    const kept = tabs.find(tb => tb.id === id)
    setTabs(prev => prev.filter(tb => tb.id === id))
    for (const key of Array.from(selectedByTab.current.keys())) {
      if (key !== id) selectedByTab.current.delete(key)
    }
    setActiveTabId(id)
    // Reconcile the body if the survivor isn't the repo currently loaded.
    if (kept && !kept.path && kept.kind !== 'view') clearRepoView()
    else if (kept?.path && kept.path !== repoPath) {
      window.gitAPI.setRepo(kept.path!).then(r => {
        if (r.path) {
          setRepoPath(r.path); setRepoName(r.name ?? kept.name!)
          setCommits([]); setSelectedCommit(selectedByTab.current.get(kept.id) ?? null); detectGithub()
        }
      })
    }
  }, [tabs, repoPath, clearRepoView, detectGithub])
  const activeTab = tabs.find(tb => tb.id === activeTabId)
  const launchpadActive = activeTab?.kind === 'launchpad'
  const themesActive = activeTab?.kind === 'themes'
  const viewTab = activeTab?.kind === 'view' ? activeTab.body : undefined
  // The tab strip's keyboard: arrows move between tabs and open the one they
  // land on, Home and End go to the ends, Delete closes. Only the active tab
  // is in the Tab order, so the strip is one stop for Tab, not one per tab.
  const onTabKeyDown = (e: React.KeyboardEvent, tab: AppTab) => {
    const i = tabs.findIndex(tb => tb.id === tab.id)
    if (i < 0) return
    let target: AppTab | undefined
    switch (e.key) {
      case 'ArrowRight': target = tabs[(i + 1) % tabs.length]; break
      case 'ArrowLeft': target = tabs[(i - 1 + tabs.length) % tabs.length]; break
      case 'Home': target = tabs[0]; break
      case 'End': target = tabs[tabs.length - 1]; break
      case 'Enter': case ' ': e.preventDefault(); switchTab(tab); return
      case 'Delete': case 'Backspace': e.preventDefault(); closeTab(tab.id); return
      default: return
    }
    e.preventDefault()
    if (!target || target.id === tab.id) return
    switchTab(target)
    const id = target.id
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.app-tab[data-tab-id="${id}"]`)?.focus())
  }

  return {
    tabs, setTabs, activeTabId, setActiveTabId, tabMenu, setTabMenu, selectedByTab, repoMgmtOpen, setRepoMgmtOpen, whatsNew, setWhatsNew, whatsNewActive, setWhatsNewActive, applyRepo, handleOpenRepo, handleSetRepo, openReleaseNotes, handleRemoveRecent, deepLinkHash, setDeepLinkHash, applyDeepLink, openHomeTab, openLaunchpadTab, openThemesTab, openViewTab, openSettingsTab, switchTab, closeTab, closeOtherTabs, activeTab, launchpadActive, themesActive, viewTab, onTabKeyDown,
  }
}

export type AppTabs = ReturnType<typeof useAppTabs>
