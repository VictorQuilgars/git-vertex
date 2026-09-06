// What the root component is made of outside its own body: the tab model, the view
// helpers, the stash preview, the constants. Split out of App.tsx.
import React, { useState, useEffect } from 'react'
import { CommitNode, ConflictKind, type CompareAxis } from '../types'
import { useLang } from '../i18n/LanguageContext'
import DiffViewer from '../components/DiffViewer/DiffViewer'
import { CenterDiffTarget } from '../components/CenterFileDiff/CenterFileDiff'

export interface StashEntry { index: number; message: string }

export interface TagEntry   { name: string; hash: string }

// Absent `entries` means the host does not report unmerged states (an older
// extension build). Return an empty map so the UI stays silent about the kind
// instead of defaulting every file to "both modified".
export function kindsByPath(entries?: { path: string; kind: ConflictKind }[]): Record<string, ConflictKind> {
  if (!entries) return {}
  return Object.fromEntries(entries.map(e => [e.path, e.kind]))
}

// ── Stash content preview ───────────────────────────────────────
// A view, so it opens in a tab: you read a stash while looking at the graph
// that made it, and it stays put when you click elsewhere.
export function StashPreview({ index, message }: { index: number; message: string }) {
  const [diff, setDiff] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const { t } = useLang()

  React.useEffect(() => {
    ;(window.gitAPI as any).stashDiff(index).then((r: any) => {
      setDiff(r?.diff ?? '')
      setLoading(false)
    })
  }, [index])

  return (
    <div className="view-page">
      <div className="view-page-header">
        <span className="view-page-title">Stash <code>#{index}</code> — {message}</span>
      </div>
      <div className="view-page-body">
        {loading
          ? <div className="bc-loading">{t('common.loading')}</div>
          : diff.trim() === ''
            ? <div className="bc-empty" style={{ padding: 24 }}>{t('stash.empty')}</div>
            : <DiffViewer commit={syntheticCommit(`stash@{${index}}`, message)} diff={diff} files={[]} loading={false} />}
      </div>
    </div>
  )
}

// Minimal CommitNode so DiffViewer renders its body (it early-returns on null commit).
export function syntheticCommit(shortHash: string, message: string): CommitNode {
  return {
    hash: shortHash, shortHash, message,
    author: '', authorEmail: '', date: '', parents: [], refs: []
  }
}

// ── Imperative dialog helpers ──────────────────────────────────
export type DialogState =
  | { kind: 'prompt';  message: string; defaultValue?: string; multiline?: boolean; resolve: (v: string | null) => void }
  | { kind: 'confirm'; message: string; danger?: boolean;      resolve: (v: boolean) => void }
  | { kind: 'choice';  message: string; options: string[];     resolve: (v: string | null) => void }

// ── Tabs ───────────────────────────────────────────────────────
// Tabs are heterogeneous: the classic repo tab, the "home" welcome screen
// (multiple allowed — every "+" opens a fresh one) and the full-page
// Launchpad (opened by the 🚀 button). `path`/`name` are only set on repo tabs.
export type TabKind = 'home' | 'repo' | 'launchpad' | 'themes' | 'view'

/**
 * A view that used to be a window drawn over the graph.
 *
 * The rule, and the reason this exists: a surface that HOLDS something — a
 * comparison, a file's history, a stash's contents — is a tab. It has a title,
 * it survives clicking elsewhere, you can have two, and you close it when you
 * are done. A surface that ASKS something — confirm, name this, pick a remote
 * before pushing — stays a modal: transient, blocking, nothing to come back to.
 *
 * The VS Code panel has worked this way from the start (openGitVertexCompareTab
 * and its siblings); the app drew modals over the graph instead, which is what
 * made it dense.
 */
export type ViewTab =
  | { view: 'compare'; a: string; b: string | null; axis?: CompareAxis; label: string }
  | { view: 'fileHistory'; file: string }
  | { view: 'stash'; index: number; message: string }
  | { view: 'fileDiff'; target: CenterDiffTarget }
  | { view: 'settings' }

export interface AppTab { id: string; kind: TabKind; path?: string; name?: string; body?: ViewTab }

/** What the tab bar calls a view, and draws for it. */
export function viewTabName(body: ViewTab, t: (k: any, ...a: any[]) => string): string {
  switch (body.view) {
    case 'compare': return body.label
    case 'fileHistory': return t('tabs.history', body.file.split('/').pop() ?? body.file)
    case 'stash': return t('tabs.stash', body.index)
    case 'settings': return t('tabs.settings')
    case 'fileDiff': {
      const name = body.target.filePath.split('/').pop() ?? body.target.filePath
      return body.target.type === 'commit'
        ? `${name} (${body.target.commitHash.slice(0, 7)})`
        : `${name} (${t(body.target.area === 'staged' ? 'tabs.staged' : 'tabs.unstaged')})`
    }
  }
}

export function viewTabIcon(body: ViewTab): 'compare' | 'history' | 'stash' | 'diff' | 'gear' {
  switch (body.view) {
    case 'compare': return 'compare'
    case 'fileHistory': return 'history'
    case 'stash': return 'stash'
    case 'fileDiff': return 'diff'
    case 'settings': return 'gear'
  }
}

/**
 * Whether a view is about a repository at all.
 *
 * Every one of them is, except the settings: a comparison, a file's history, a
 * stash and a diff are all *of* something checked out, and the main process
 * serves one repository at a time — which is why those tabs carry their path.
 * The settings are the application's own screen, and tying them to a repository
 * meant the gear did nothing at all until one was open.
 */
export function viewNeedsRepo(body: ViewTab): boolean {
  return body.view !== 'settings'
}

/** Two view tabs are the same tab when they show the same thing. */
export function sameView(a: ViewTab, b: ViewTab): boolean {
  if (a.view !== b.view) return false
  if (a.view === 'compare' && b.view === 'compare') return a.a === b.a && a.b === b.b
  if (a.view === 'fileHistory' && b.view === 'fileHistory') return a.file === b.file
  if (a.view === 'stash' && b.view === 'stash') return a.index === b.index
  if (a.view === 'fileDiff' && b.view === 'fileDiff') return sameDiffTarget(a.target, b.target)
  // One settings tab: it shows the whole of a thing, so a second one would
  // be the same tab twice.
  return a.view === 'settings'
}

/** The same file, of the same version — a staged diff is not the unstaged one. */
export function sameDiffTarget(a: CenterDiffTarget, b: CenterDiffTarget): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'commit' && b.type === 'commit') return a.commitHash === b.commitHash && a.filePath === b.filePath
  if (a.type === 'working' && b.type === 'working') return a.filePath === b.filePath && a.area === b.area
  return false
}

export let tabSeq = 0

export const newTabId = (prefix: TabKind) => `${prefix}-${Date.now()}-${tabSeq++}`

/**
 * How often the GitHub lists are asked. GitHub publishes this number itself —
 * `X-Poll-Interval: 60` on its events endpoint — so it is its contract, not
 * our guess. The requests are conditional, so a minute costs nothing while
 * nothing changes.
 */
export const GITHUB_POLL_MS = 60_000

/** How much history one load of the graph holds, and how much a "more" adds. */
export const LOG_PAGE = 500
