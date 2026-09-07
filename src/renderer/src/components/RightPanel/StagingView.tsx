// The working tree: what is staged, what is not, and the commit form.

import { useCommitDraft } from '../../hooks/useCommitDraft'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import hljs from 'highlight.js'
import { CommitNode, ConflictKind, FileChange, WorkingChanges } from '../../types'
import { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import { useLang } from '../../i18n/LanguageContext'
import { aiAvatarDataUri } from '../../utils/aiAvatars'
import { linkifyIssues, IssueRepo } from '../IssueLink/IssueLink'
import { parseAutolinks } from '../../utils/autolinks'
import { useSettings } from '../../contexts/SettingsContext'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import ColumnResizeHandle from '../ColumnResizeHandle/ColumnResizeHandle'
import BranchStrip, { type BranchStripProps } from './BranchStrip'
import './RightPanel.css'
import WorkingChangesEmpty, { type NextStepsState, type NextStepsActions } from './WorkingChangesEmpty'
import { hasIssueReferences } from '../IssueLink/IssueLink'
import { STATUS_META, StatusBadge, TreeFileRow, buildTree, type TreeNode, DiffStat } from './shared'

// ── Staging view (commit panel) ───────────────
export interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

// Inline icons (currentColor)
export const IcoTrash = () => (<Icon name="trash" size={15} />)
export const IcoSpark = ({ size = 14 }: { size?: number }) => (<Icon name="ai" />)
export const IcoSort = () => (<Icon name="sort" size={15} />)
export const IcoPathView = () => (<Icon name="list" size={12} />)
export const IcoSearch = () => (<Icon name="search" size={12} />)

export const IcoCopy = () => (<Icon name="copy" size={13} />)
export const IcoOpenDiff = () => (<Icon name="externalLink" size={12} />)

// Per-file line counts (v1.22.0). Renders nothing when git reported none —
// untracked files and binaries — so "unknown" never reads as "+0 −0".
export const IcoTreeView = () => (<Icon name="listTree" size={12} />)
export const IcoCommit = () => (<Icon name="commit" size={15} />)
export const IcoStash = () => (<Icon name="stash" size={15} />)
export const IcoCheck = ({ size = 16 }: { size?: number }) => (<Icon name="check" />)
export const IcoHunks = () => (<Icon name="hunk" size={13} />)
export const IcoCloud = () => (<Icon name="cloud" size={15} />)
export const IcoChevron = ({ open }: { open: boolean }) => (<Icon name="chevronRight" size={11} />)

// ── Embedded (VS Code) single-list staging: checkbox helpers ──────
export type StageState = 'staged' | 'unstaged' | 'partial'

// Checkbox that can render the tri-state "indeterminate" look (partial staging /
// mixed folder). React has no `indeterminate` prop, so it's set via a ref.
export function IndetCheckbox({ checked, indeterminate, onChange, className, title, disabled }: {
  checked: boolean; indeterminate?: boolean; onChange: () => void
  className?: string; title?: string; disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked }, [indeterminate, checked])
  return (
    <input ref={ref} type="checkbox" className={className} title={title} disabled={disabled}
      checked={checked} onChange={onChange} onClick={e => e.stopPropagation()} />
  )
}

export interface StageTreeCtx {
  stateByPath: Map<string, StageState>
  onStage: (paths: string[]) => void
  onUnstage: (paths: string[]) => void
  onDiscard: (path: string) => void
  onSelect: (path: string, area: 'staged' | 'unstaged') => void
  selectedPath?: string | null
  onOpenStagingEditor?: (file: string) => void
  /** Right-click on a file row — the staging list had no menu at all. */
  onContextMenu?: (e: React.MouseEvent, path: string) => void
  stageTitle: string; unstageTitle: string; discardTitle: string; hunkTitle: string
}
export function collectTreeFiles(n: TreeNode): string[] {
  return n.isFile ? [n.fullPath] : n.children.flatMap(collectTreeFiles)
}
// Checkbox file-tree row for the embedded single-list staging view. Folders get
// a tri-state checkbox that stages/unstages every descendant at once.
export function CheckTreeRow({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: StageTreeCtx }) {
  const [open, setOpen] = React.useState(true)
  const indent = depth * 10
  if (node.isFile) {
    const state = ctx.stateByPath.get(node.fullPath) ?? 'unstaged'
    const staged = state === 'staged'
    const selected = ctx.selectedPath === node.fullPath
    return (
      <div className={`stx-row st-tr st-clickable ${selected ? 'st-selected' : ''}`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => ctx.onSelect(node.fullPath, staged ? 'staged' : 'unstaged')}
        onContextMenu={ctx.onContextMenu && (e => ctx.onContextMenu!(e, node.fullPath))}>
        <IndetCheckbox className="stx-check" checked={staged} indeterminate={state === 'partial'}
          title={staged ? ctx.unstageTitle : ctx.stageTitle}
          onChange={() => staged ? ctx.onUnstage([node.fullPath]) : ctx.onStage([node.fullPath])} />
        <StatusBadge status={node.status} className="st-tr-badge" />
        <span className="st-tr-name">{node.name}</span>
        {ctx.onOpenStagingEditor && (
          <button className="st-action st-hunk-editor" title={ctx.hunkTitle}
            onClick={e => { e.stopPropagation(); ctx.onOpenStagingEditor!(node.fullPath) }}><IcoHunks /></button>
        )}
        <button className="st-action st-discard" title={ctx.discardTitle}
          onClick={e => { e.stopPropagation(); ctx.onDiscard(node.fullPath) }}>↺</button>
      </div>
    )
  }
  const files = collectTreeFiles(node)
  const states = files.map(p => ctx.stateByPath.get(p) ?? 'unstaged')
  const allStaged = states.length > 0 && states.every(s => s === 'staged')
  const noneStaged = states.every(s => s === 'unstaged')
  return (
    <>
      <div className="stx-row st-tr st-tr-dir" style={{ paddingLeft: indent }} onClick={() => setOpen(o => !o)}>
        <IndetCheckbox className="stx-check" checked={allStaged} indeterminate={!allStaged && !noneStaged}
          onChange={() => allStaged ? ctx.onUnstage(files) : ctx.onStage(files)} />
        <span className="st-tr-tri">{open ? '▼' : '▶'}</span>
        <span className="st-tr-dirname">{node.name}</span>
      </div>
      {open && node.children.map(c => <CheckTreeRow key={c.fullPath} node={c} depth={depth + 1} ctx={ctx} />)}
    </>
  )
}

export function StagingView({ repoPath, onCommitSuccess, showToast, currentBranch, conflictMode, conflictFiles, onConflictFinish, onConflictAbort, onOpenFileDiff, onOpenStagingEditor, commitProposal, onProposalConsumed, onExplainWorking, onSplitCommits, embedded, branchStrip, emptyState }: {
  repoPath?: string
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  currentBranch?: string
  conflictMode?: string | null
  conflictFiles?: string[]
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void | boolean | Promise<void | boolean>
  onConflictAbort?: () => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onOpenStagingEditor?: (file: string) => void
  commitProposal?: { message: string; files: string[] } | null
  onProposalConsumed?: () => void
  /**
   * The two AI actions about the working tree (#70 P1) — read it, or cut it
   * into commits. Absent ⇒ the caret beside the generate button does not
   * appear at all, so a host that cannot answer offers nothing.
   */
  onExplainWorking?: () => void
  onSplitCommits?: () => void
  embedded?: boolean
  branchStrip?: BranchStripProps
  /**
   * What the pane shows on a clean tree, in the panel: the branch header stays
   * and under it the next steps. The host supplies state and actions; omitted
   * ⇒ the pane says nothing, as it always did. Desktop leaves it out.
   */
  emptyState?: { state: NextStepsState; actions: NextStepsActions }
}) {
  const { t } = useLang()
  const isConflict = !!conflictMode
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  // Whether that state is an answer or just the value it starts at. "Nothing to
  // stage" is a thing to say about a working tree that has been read, not about
  // one we have not asked about yet — without this the pane says it for a frame
  // on every repository, however many files are waiting.
  const [loaded, setLoaded] = useState(false)
  // Single free-form commit message: the user controls their own line breaks
  // (first line reads as the subject by git convention, but nothing forces
  // that split — no separate summary/description fields).
  const { draft, update: updateDraft, message, setMessage, clear: clearDraft } = useCommitDraft(repoPath)
  const amend = draft.amend
  const [amendFiles, setAmendFiles] = useState<FileChange[]>([])
  const [treeMode, setTreeMode] = useState(() => localStorage.getItem('st-tree-mode') === 'true')
  const [sortAsc, setSortAsc] = useState(true)
  // Purely a view lens over the file lists — never changes what gets staged or
  // committed, so counts and the master checkbox stay on the unfiltered set.
  const [fileFilter, setFileFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [unstagedOpen, setUnstagedOpen] = useState(true)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [signoff, setSignoff] = useState(false)
  // "Add as co-author" — the panel already writes a Signed-off-by trailer, and
  // already READS co-authors to show their avatars. This is the missing half:
  // writing one. The candidates are whoever has committed here recently, which
  // is who you actually pair with.
  const [coAuthorMenu, setCoAuthorMenu] = useState<{ x: number; y: number } | null>(null)
  const [authors, setAuthors] = useState<{ name: string; email: string }[]>([])
  const [committing, setCommitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  /** Where the caret's menu opens — the commit detail's AI menu, on the WIP. */
  const [wipAiMenu, setWipAiMenu] = useState<{ x: number; y: number } | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiffFile | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const [formWidth, setFormWidth] = useState(() => {
    const saved = Number(localStorage.getItem('st-embedded-form-width'))
    return Number.isFinite(saved) && saved >= 240 ? saved : 300
  })
  const [fileToolsMenu, setFileToolsMenu] = useState<{ x: number; y: number } | null>(null)
  const [compactMenu, setCompactMenu] = useState<{ x: number; y: number } | null>(null)
  const [formHeight, setFormHeight] = useState(() => parseInt(localStorage.getItem('st-form-h') || '300'))
  const dragRef = useRef<{ y: number; h: number } | null>(null)

  // In short panels (VS Code panel next to a terminal…) the commit form must
  // not swallow the file lists: clamp its height so the lists keep ≥ ~150px.
  // The form content itself scrolls (st2-commit-scroll), so shrinking is safe.
  const stRootRef = useRef<HTMLDivElement>(null)
  const [panelSize, setPanelSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = stRootRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      setPanelSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const panelH = panelSize.h
  // The form can always be dragged up to a generous flat ceiling (800) — for
  // any realistic panel size that's effectively unbounded, so a short VS Code
  // terminal never "blocks" the user from wanting more room. The only thing
  // still trimmed off that ceiling is a thin sliver (56px — resize handle +
  // a couple of file rows) reserved so the form can never grow taller than
  // the panel itself: without that, the message box would render past the
  // panel's actual bottom edge with no clipping/scroll to catch it, which
  // reads as its border "touching" or being cut off by the window edge.
  const maxFormH = panelH > 0 ? Math.min(800, Math.max(96, panelH - 56)) : 800
  const effFormHeight = Math.min(formHeight, maxFormH)
  // In short panels (VS Code panel docked under a terminal) the classic vertical
  // stack (file lists above, commit form below) runs out of height. Two responsive
  // fallbacks:
  //  • compact     — short panel: trim the chrome (topbar, viewbar…).
  //  • compactRow  — short *and* wide: lay out files | commit form side by side,
  //                  each on the full height, so nothing gets clipped.
  // Height tiers:
  //  • ≥ 300px                    → classic layout (unchanged).
  //  • < 300px, wide (compactRow) → files | form side by side, form keeps its
  //                                  usual shape (plenty of height to spare).
  //  • < 300px, narrow (stacked)  → merged layout: amend + AI share one row,
  //                                  the commit button becomes a ✓ at the end
  //                                  of the message toolbar instead of its own
  //                                  band.
  const compact = panelH > 0 && panelH < 300
  const embeddedRow = !!embedded && !isConflict && compact && panelSize.w >= 480
    && (!emptyState || changes.staged.length + changes.unstaged.length + changes.untracked.length > 0 || amend)
  const compactRow = embeddedRow || (!embedded && compact && panelSize.w >= 640)
  const maxFormWidth = Math.max(240, panelSize.w - 166)
  const effectiveFormWidth = Math.min(formWidth, maxFormWidth)
  const tiny = compact && panelH < 190
  // Stacked (narrow) + compact, and not mid-conflict — conflict resolution
  // keeps the explicit Abort/Commit&Merge bar regardless of size.
  const stackedCompact = compact && !compactRow && !isConflict
  // Up to 500px the top banner (discard-all, "N changes on branch", AI) is
  // redundant chrome — counts are in the section headers, AI is on the message
  // toolbar — so hide it to give the file lists more room, even in classic layout.
  const trimTop = panelH > 0 && panelH < 500
  // Up to 500px (and wide enough), put Unstaged | Staged side by side so both
  // are readable without one pushing the other down. In the full horizontal
  // (compactRow) layout the lists are already split, so this only adds the
  // split to the classic vertical layout.
  const splitLists = trimTop && panelSize.w >= 360

  const toggleAmend = useCallback(async (checked: boolean) => {
    if (!checked) { updateDraft(prev => ({ ...prev, amend: false })); return }
    const head = await window.gitAPI.getLastCommitMessage()
    updateDraft(prev => ({
      ...prev,
      amend: true,
      amendHead: head.hash,
      // An edit kept from an earlier amend is only worth restoring when it was
      // written for this very commit; once HEAD has moved it is the wrong text.
      amendMessage: prev.amendHead === head.hash && prev.amendMessage ? prev.amendMessage : (head.message ?? ''),
    }))
  }, [updateDraft])

  // An amend armed for a commit that is no longer HEAD — after a restart, or a
  // commit made from a terminal while the box was checked — is disarmed rather
  // than allowed to rewrite whatever HEAD has become with a message meant for
  // another commit. Re-checked whenever the repository reports a change.
  const amendHead = draft.amendHead
  const [headTick, setHeadTick] = useState(0)
  useEffect(() => {
    if (!amend) { setAmendFiles([]); return }
    let active = true
    Promise.all([window.gitAPI.getLastCommitMessage(), window.gitAPI.getCommitFiles('HEAD')]).then(([head, r]) => {
      if (!active) return
      if (head.hash && amendHead && head.hash !== amendHead) {
        updateDraft(prev => ({ ...prev, amend: false, amendMessage: '', amendHead: undefined }))
        return
      }
      setAmendFiles(r.files ?? [])
    })
    return () => { active = false }
  }, [amend, amendHead, headTick, updateDraft])

  const load = useCallback(async () => {
    const r = await window.gitAPI.getWorkingChanges()
    setChanges(r as WorkingChanges)
    setLoaded(true)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => { load(); setHeadTick(n => n + 1) }
    const offRepo = window.gitAPI.onRepoChanged(handler)
    const offWorking = window.gitAPI.onWorkingChanged(handler)
    return () => { offRepo(); offWorking() }
  }, [load])

  useEffect(() => {
    if (isConflict) {
      window.gitAPI.getMergeMessage().then(r => { if (r.message) setMessage(prev => prev || r.message) })
    }
  }, [isConflict])

  // Agent-proposed commit (MCP propose_commit): preload the message into the
  // form. The proposed files are only *listed* in the banner below — staging
  // them stays a one-click user action, never automatic.
  useEffect(() => {
    if (commitProposal) setMessage(commitProposal.message)
  }, [commitProposal])  // eslint-disable-line react-hooks/exhaustive-deps

  const stageProposedFiles = async () => {
    if (!commitProposal?.files.length) return
    const stageable = new Set([...changes.unstaged.map(f => f.path), ...changes.untracked])
    const stagedAlready = new Set(changes.staged.map(f => f.path))
    const toStage = commitProposal.files.filter(f => stageable.has(f))
    if (toStage.length) await window.gitAPI.stage(toStage)
    await load()
    // Proposed files neither stageable nor already staged (agent may be stale)
    const missing = commitProposal.files.filter(f => !stageable.has(f) && !stagedAlready.has(f)).length
    if (missing > 0) showToast(t('panel.proposal.missing', String(missing)), 'err')
  }

  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { y: e.clientY, h: formHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      // dragging up grows the form, down shrinks it
      const next = Math.min(maxFormH, Math.max(96, dragRef.current.h - (ev.clientY - dragRef.current.y)))
      setFormHeight(next)
    }
    const onUp = () => {
      if (dragRef.current) localStorage.setItem('st-form-h', String(formHeight))
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [formHeight, maxFormH])

  const generateMessage = async () => {
    setGenerating(true)
    try {
      const r = await window.gitAPI.aiGenerateCommitMessage()
      if (!r) showToast(t('panel.gen.empty'), 'err')
      else if (r.error === 'NO_API_KEY') showToast(t('panel.gen.noKey'), 'err')
      else if (r.error) showToast(t('panel.gen.failed', r.error ?? ''), 'err')
      else if (r.message) setMessage(r.message)
      else showToast(t('panel.gen.empty'), 'err')
    } catch (e: any) {
      showToast(t('panel.gen.unexpected', e?.message ?? e), 'err')
    } finally {
      setGenerating(false)
    }
  }

  // #127's rule, at the one place every staging action goes through: a
  // MUTATING action confirms, and says so when it fails. `say` is the chip's
  // message — omitted only where the action is not a mutation.
  const handle = async (fn: () => Promise<any>, reload = true, say?: string) => {
    let r: any
    try {
      r = await fn()
    } catch (e: any) {
      showToast(e?.message ?? String(e), 'err')
      return
    }
    if (r?.success === false) { showToast(r.error ?? t('toast.actionFailed'), 'err'); return }
    if (reload) await load()
    if (say) showToast(say)
  }

  const selectFile = (file: SelectedDiffFile) => {
    setSelectedDiff(file)
    onOpenFileDiff?.({ type: 'working', filePath: file.path, area: file.area })
  }

  const discardAll = async () => {
    const staged = changes.staged.map(f => f.path)
    const unstaged = [...changes.unstaged.map(f => f.path), ...changes.untracked.filter(f => !f.endsWith('/'))]
    const all = [...staged, ...unstaged]
    if (!all.length) return
    if (!window.confirm(t('panel.discardAll.confirm', String(all.length)))) return
    if (staged.length) await window.gitAPI.unstage(staged)
    for (const f of all) await window.gitAPI.discardFile(f)
    await load()
    // The destructive one, and it used to be the quietest of them all.
    showToast(t('toast.discarded', all.length))
  }

  // Stash from the staging panel itself (v1.22.0) — it previously existed only
  // on the toolbar, i.e. nowhere near the files you are looking at.
  const stashAll = async () => {
    const r = await window.gitAPI.createStash()
    if (r?.success === false) { showToast(r.error ?? t('panel.stashFromPanel'), 'err'); return }
    showToast(t('panel.stashFromPanel'))
    await load()
  }

  const copyFileList = async () => {
    await navigator.clipboard.writeText(mergedFiles.map(f => f.path).join('\n'))
    showToast(t('panel.copyFileList.done'))
  }

  const sortFiles = <T extends { path: string }>(arr: T[]) =>
    [...arr].sort((a, b) => sortAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path))

  const totalUnstaged = changes.unstaged.length + changes.untracked.length
  const stagedPaths = new Set(changes.staged.map(f => f.path))
  const amendOnly = amendFiles.filter(f => !stagedPaths.has(f.path))
  const stagedCount = changes.staged.length + amendOnly.length
  const totalChanged = changes.staged.length + totalUnstaged
  // A clean tree: the pane shows what comes next, not a form for a commit that
  // has nothing in it. Both products get it; whether there is anything to say
  // is the host's answer, given by supplying `emptyState` at all.
  //
  // Amend and a message already typed are excluded, and for the same reason: a
  // commit is being written. A draft outlives the changes it was written for —
  // discard them and the message is still yours — and replacing it with a card
  // of suggestions would take it off the screen without deleting it, which is
  // the worst of both.
  const showEmptyState = !!(emptyState && loaded && !isConflict && totalChanged === 0 && !amend && !message.trim())
  const canCommit = changes.staged.length > 0 || amend

  const toggleTree = () => setTreeMode(v => { localStorage.setItem('st-tree-mode', String(!v)); return !v })

  // Closing the filter always clears it — leaving a hidden active filter behind
  // would silently hide files with no visible reason why.
  const closeFilter = () => { setFilterOpen(false); setFileFilter('') }
  const toggleFilter = () => { if (filterOpen) closeFilter(); else setFilterOpen(true) }
  useEffect(() => { if (filterOpen) filterRef.current?.focus() }, [filterOpen])

  // Case-insensitive substring match on the full path, so "src/ma" and "test"
  // both work. An empty filter matches everything.
  const filterNeedle = fileFilter.trim().toLowerCase()
  const matchFilter = (path: string) => !filterNeedle || path.toLowerCase().includes(filterNeedle)

  const sortedStaged = sortFiles(changes.staged).filter(f => matchFilter(f.path))
  const sortedUnstaged = sortFiles(changes.unstaged).filter(f => matchFilter(f.path))
  const sortedUntracked = sortFiles(changes.untracked.map(p => ({ path: p })))
    .map(x => x.path).filter(matchFilter)

  const stagedTree = buildTree(sortedStaged.map(f => ({ path: f.path, status: f.status })))
  const unstagedTree = buildTree([
    ...sortedUnstaged.map(f => ({ path: f.path, status: f.status })),
    ...sortedUntracked.map(f => ({ path: f, status: '?' })),
  ])

  // ── Embedded single-list model: one row per file, checkbox = staged ──
  // A file can be in both staged and unstaged (partial staging) → 'partial'.
  type MergedFile = { path: string; status: string; state: StageState; additions?: number; deletions?: number }
  const mergedFiles: MergedFile[] = (() => {
    const m = new Map<string, MergedFile>()
    // A partially staged file is one row here but two numstat entries, so the
    // counts add up — the row reports everything changed against HEAD.
    const addStats = (e: MergedFile, f: { additions?: number; deletions?: number }) => {
      if (f.additions === undefined && f.deletions === undefined) return
      e.additions = (e.additions ?? 0) + (f.additions ?? 0)
      e.deletions = (e.deletions ?? 0) + (f.deletions ?? 0)
    }
    for (const f of changes.staged) {
      m.set(f.path, { path: f.path, status: f.status, state: 'staged', additions: f.additions, deletions: f.deletions })
    }
    for (const f of changes.unstaged) {
      const ex = m.get(f.path)
      if (ex) { ex.state = 'partial'; addStats(ex, f) }
      else m.set(f.path, { path: f.path, status: f.status, state: 'unstaged', additions: f.additions, deletions: f.deletions })
    }
    for (const raw of changes.untracked) {
      const p = raw.replace(/\/$/, '') // git add/discard accept the slash-less form
      if (!m.has(p)) m.set(p, { path: p, status: '?', state: 'unstaged' })
    }
    return sortFiles([...m.values()])
  })()
  const stateByPath = new Map<string, StageState>(mergedFiles.map(f => [f.path, f.state]))
  // Rows/tree render the filtered view; allStaged/noneStaged below stay on the
  // full set so the master checkbox keeps reflecting the real repo state.
  const visibleFiles = mergedFiles.filter(f => matchFilter(f.path))
  const mergedTree = buildTree(visibleFiles.map(f => ({ path: f.path, status: f.status })))
  const allStaged = mergedFiles.length > 0 && mergedFiles.every(f => f.state === 'staged')
  const noneStaged = mergedFiles.every(f => f.state === 'unstaged')
  const visibleAmendOnly = amendOnly.filter(f => matchFilter(f.path))
  // Something is staged/changed but the filter hides all of it — say so rather
  // than showing the same "no changes" text as a clean tree.
  const filterHidesAll = !!filterNeedle
    && mergedFiles.length + amendOnly.length > 0
    && visibleFiles.length + visibleAmendOnly.length === 0
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const stageOne = (paths: string[]) =>
    handle(() => window.gitAPI.stage(paths), true, t('toast.staged', paths.length))
  const unstageOne = (paths: string[]) =>
    handle(() => window.gitAPI.unstage(paths), true, t('toast.unstaged', paths.length))
  const discardOne = async (path: string) => {
    if (!window.confirm(t('panel.discard.confirm', path))) return
    handle(() => window.gitAPI.discardFile(path), true, t('toast.discarded', 1))
  }
  const toggleAllStaged = () => {
    const staged = changes.staged.map(x => x.path)
    return allStaged
      ? handle(() => window.gitAPI.unstage(staged), true, t('toast.unstaged', staged.length))
      : handle(() => window.gitAPI.stageAll(), true, t('toast.stagedAll'))
  }
  const openFileMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setFileMenu({ x: e.clientX, y: e.clientY, path })
  }
  const stageCtx: StageTreeCtx = {
    stateByPath, onStage: stageOne, onUnstage: unstageOne, onDiscard: discardOne,
    onSelect: (path, area) => selectFile({ path, area }),
    selectedPath: selectedDiff?.path, onOpenStagingEditor,
    onContextMenu: openFileMenu,
    stageTitle: t('panel.stage'), unstageTitle: t('panel.unstaged'),
    discardTitle: t('panel.discard'), hunkTitle: t('panel.hunkEditor'),
  }

  const branchName = currentBranch || 'HEAD'

  // Copying the path of a file you are about to commit is the smallest gesture
  // in this lot and the one with no equivalent anywhere: VS Code's own commands
  // act on the explorer, not on our list. Paths are repo-relative, which is what
  // goes into a review comment.
  const fileMenuNode = fileMenu && (
    <ContextMenu
      x={fileMenu.x} y={fileMenu.y}
      items={[
        ...(embeddedRow ? [
          { label: t('panel.openDiff'), action: () => selectFile({ path: fileMenu.path, area: stateByPath.get(fileMenu.path) === 'staged' ? 'staged' : 'unstaged' }) },
          ...(onOpenStagingEditor ? [{ label: t('panel.hunkEditor'), action: () => onOpenStagingEditor(fileMenu.path) }] : []),
          { label: t('panel.discard'), danger: true, action: () => { void discardOne(fileMenu.path) } },
        ] : []),
        { label: t('panel.file.copyPath'), action: () => navigator.clipboard.writeText(fileMenu.path) },
        {
          label: t('panel.file.copyName'),
          action: () => navigator.clipboard.writeText(fileMenu.path.split('/').pop() ?? fileMenu.path),
        },
      ]}
      onClose={() => setFileMenu(null)}
    />
  )

  // Dynamic commit-button label following the commit flow.
  const commitLabel = (() => {
    if (committing) return t('panel.commit.inProgress')
    if (isConflict) return t('rp.commitMode', conflictMode as string)
    // The panel's footer is the commit, named after its branch, and greyed
    // until it is ready — staging is a row action, not the step that unlocks
    // the form. The desktop keeps the labels that walk through the steps.
    if (embedded && currentBranch) return t('panel.commit.toBranch', currentBranch)
    if (!canCommit) return t('panel.commit.stageFirst')      // nothing staged
    if (!message.trim()) return t('panel.commit.typeMessage') // staged, no message
    if (amend && changes.staged.length === 0) return t('panel.commit.amend')
    const n = changes.staged.length
    return t('panel.commit.changes', String(n), n !== 1 ? 's' : '')
  })()
  const commitReady = isConflict
    ? (!!message.trim() && !conflictFiles?.length)
    : (canCommit && !!message.trim())

  return (
    <div className={`rp-content rp-staging st2 ${compact ? 'st2--compact' : ''} ${compactRow ? 'st2--row' : ''} ${tiny ? 'st2--tiny' : ''} ${trimTop ? 'st2--trimtop' : ''} ${splitLists ? 'st2--splitlists' : ''} ${embeddedRow && !showEmptyState ? 'st2--embedded-row' : ''}`} ref={stRootRef}
      style={embeddedRow && !showEmptyState ? { gridTemplateColumns: `minmax(160px, 1fr) 6px ${effectiveFormWidth}px` } : undefined}>
      {/* ── Top bar ── */}
      {embedded ? (
        /* The panel's header: what this pane is, how much is in it, and the
           two things to do with it. It used to say "N file changes on tmp",
           which the branch strip right under it said again. */
        <div className="st2-topbar st2-topbar--panel">
          <span className="st2-pane-title">{t('graph.wipClean')}</span>
          {totalChanged > 0 && (
            <span className="st2-pane-count" title={t('graph.wip', totalChanged)}>
              <Icon name="pencil" size={11} />{totalChanged}
            </span>
          )}
          <span className="st2-pane-spring" />
          {branchStrip?.onCompareWorking && (
            <button className="st2-pane-btn" onClick={branchStrip.onCompareWorking} title={t('compare.vsWorking')}>
              <Icon name="compare" size={12} /><span>{t('panel.compareBtn')}</span>
            </button>
          )}
          <button className="st2-icon-btn" title={t('panel.refresh')} onClick={() => void load()}>
            <Icon name="refresh" size={13} />
          </button>
        </div>
      ) : (
      <div className="st2-topbar">
        <button className="st2-icon-btn st2-danger" title={t('panel.discardAll')} onClick={discardAll} disabled={totalChanged === 0}>
          <IcoTrash />
        </button>
        <div className="st2-topbar-mid">
          <span className="st2-changecount">{totalChanged} {totalChanged === 1 ? t('panel.fileChange') : t('panel.fileChanges')}</span>
          <span className="st2-on">{t('panel.on')}</span>
          <span className="st2-branch-chip" title={branchName}>{branchName}</span>
        </div>
      </div>
      )}

      {/* ── Branch strip (v1.22.0) — above the files, in both layouts ── */}
      {branchStrip && !embeddedRow && <BranchStrip {...branchStrip} />}

      {/* ── Nothing to stage: the pane says what comes next instead of nothing. ── */}
      {showEmptyState && (
        <WorkingChangesEmpty state={emptyState!.state} actions={emptyState!.actions} />
      )}

      {/* ── Sort + view toggle ── */}
      {/* ── Embedded (VS Code): single checkbox list ── */}
      {fileMenuNode}
      {embedded && !showEmptyState && (
        <div className="stx">
          <div className="stx-head">
            <IndetCheckbox className="stx-check stx-master" checked={allStaged}
              indeterminate={!allStaged && !noneStaged} disabled={mergedFiles.length === 0}
              title={allStaged ? t('panel.unstageAll') : t('panel.stageAll')}
              onChange={toggleAllStaged} />
            {/* The count that counts is how many are staged, not how many
                changed — "ready to commit" is read off this, not off the
                checkboxes one by one. */}
            {!embeddedRow && <span className="stx-count">{t('panel.filesChanged')}</span>}
            <span className="stx-staged-badge">
              {t('panel.stagedOf', changes.staged.length, totalChanged)}
            </span>
            <div className="stx-spring" />
            {embeddedRow ? <>
              <button className="st2-icon-btn stx-tool" title={t('common.moreActions')} aria-label={t('common.moreActions')} aria-haspopup="menu"
                onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setFileToolsMenu({ x: r.left, y: r.bottom }) }}><Icon name="kebab" size={12} /></button>
              {fileToolsMenu && <ContextMenu x={fileToolsMenu.x} y={fileToolsMenu.y} onClose={() => setFileToolsMenu(null)} items={[
                { label: t('panel.sort'), action: () => setSortAsc(s => !s) },
                { label: t('panel.view.tree'), checked: treeMode, action: toggleTree },
                { label: t('panel.copyFileList'), action: copyFileList, disabled: mergedFiles.length === 0 },
                { label: t('panel.stashFromPanel'), action: stashAll, disabled: totalChanged === 0 },
                { label: t('panel.discardAll'), action: discardAll, danger: true, disabled: totalChanged === 0 },
              ]} />}
            </> : <>
            {/* Discard-all lived only in the topbar, which the compact layout
                hides; stash only in the toolbar. Both belong here (v1.22.0). */}
            <button className="st2-icon-btn stx-tool st2-danger" title={t('panel.discardAll')}
              onClick={discardAll} disabled={totalChanged === 0}><IcoTrash /></button>
            <button className="st2-icon-btn stx-tool" title={t('panel.stashFromPanel')}
              onClick={stashAll} disabled={totalChanged === 0}><IcoStash /></button>
            <button className="st2-icon-btn stx-tool" title={t('panel.copyFileList')}
              onClick={copyFileList} disabled={mergedFiles.length === 0}><IcoCopy /></button>
            <button className="st2-icon-btn stx-tool" title={t('panel.sort')} onClick={() => setSortAsc(s => !s)}><IcoSort /></button>
            <button className={`st2-icon-btn stx-tool ${!treeMode ? 'active' : ''}`} title={t('panel.view.path')} onClick={() => treeMode && toggleTree()}><IcoPathView /></button>
            <button className={`st2-icon-btn stx-tool ${treeMode ? 'active' : ''}`} title={t('panel.view.tree')} onClick={() => !treeMode && toggleTree()}><IcoTreeView /></button>
            </>}
          </div>
          {/* The filter is a field, not a button that reveals one: a search
              you have to find is a search nobody uses. */}
          {(
            <div className="st-filter st-filter--always">
              <IcoSearch />
              <input ref={filterRef} type="text" className="st-filter-input"
                placeholder={t('panel.filter.placeholder')} value={fileFilter}
                onChange={e => setFileFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeFilter() } }} />
              {fileFilter && (
                <button className="st-filter-clear" title={t('panel.filter.clear')} aria-label={t('panel.filter.clear')}
                  onClick={() => { setFileFilter(''); filterRef.current?.focus() }}>×</button>
              )}
            </div>
          )}
          <div className="st2-file-list stx-list">
            {filterHidesAll
              ? <div className="st-empty">{t('panel.filter.noMatch', fileFilter.trim())}</div>
              : visibleFiles.length === 0 && visibleAmendOnly.length === 0
              ? <div className="st-empty">{t('panel.noChanges')}</div>
              : treeMode
                ? mergedTree.map(node => <CheckTreeRow key={node.fullPath} node={node} depth={0} ctx={stageCtx} />)
                : visibleFiles.map(f => {
                    const staged = f.state === 'staged'
                    const isSelected = selectedDiff?.path === f.path
                    return (
                      <div key={f.path} className={`stx-row st-clickable ${isSelected ? 'st-selected' : ''}`}
                        onClick={() => selectFile({ path: f.path, area: staged ? 'staged' : 'unstaged' })}>
                        <IndetCheckbox className="stx-check" checked={staged} indeterminate={f.state === 'partial'}
                          title={staged ? t('panel.unstaged') : t('panel.stage')}
                          onChange={() => staged ? unstageOne([f.path]) : stageOne([f.path])} />
                        <StatusBadge status={f.status} />
                        {/* Name strong, folder weak — a file is found by its name. */}
                        <span className="st-path" title={f.path}>
                          <span className="st-path-name">{f.path.split('/').pop()}</span>
                          {f.path.includes('/') && <span className="st-path-dir">{f.path.slice(0, f.path.lastIndexOf('/'))}</span>}
                        </span>
                        <DiffStat additions={f.additions} deletions={f.deletions} />
                        {embeddedRow ? <button className="st2-icon-btn stx-tool stx-file-menu" title={t('common.moreActions')} aria-label={t('common.moreActions')} aria-haspopup="menu"
                          onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setFileMenu({ x: r.left, y: r.bottom, path: f.path }) }}><Icon name="kebab" size={12} /></button> : <>
                        <button className="st-action" title={t('panel.file.copyPath')}
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(f.path) }}><IcoCopy /></button>
                        <button className="st-action st-open-diff" title={t('panel.openDiff')}
                          onClick={e => { e.stopPropagation(); selectFile({ path: f.path, area: staged ? 'staged' : 'unstaged' }) }}><IcoOpenDiff /></button>
                        {onOpenStagingEditor && <button className="st-action st-hunk-editor" title={t('panel.hunkEditor')} onClick={e => { e.stopPropagation(); onOpenStagingEditor(f.path) }}><IcoHunks /></button>}
                        <button className="st-action st-discard" title={t('panel.discard')} onClick={e => { e.stopPropagation(); discardOne(f.path) }}>↺</button>
                        </>}
                      </div>
                    )
                  })
            }
            {visibleAmendOnly.map(f => (
              <div key={f.path} className="stx-row st-amend-file" title={t('panel.amendBadge.tooltip')}>
                <span className="stx-check-spacer" />
                <StatusBadge status={f.status} />
                <span className="st-path">{f.path}</span>
                <span className="st-amend-tag">amend</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Desktop: Unstaged / Staged two-section layout ── */}
      {!embedded && !showEmptyState && (<>
      <div className="st2-viewbar">
        <button className="st2-icon-btn st2-sort" title={t('panel.sort')} onClick={() => setSortAsc(s => !s)}>
          <IcoSort />
        </button>
        <button className={`st2-icon-btn st2-sort ${filterOpen || fileFilter ? 'active' : ''}`}
          title={t('panel.filter')} onClick={() => toggleFilter()}>
          <IcoSearch />
        </button>
        <div className="st2-seg">
          <button className={`st2-seg-btn ${!treeMode ? 'active' : ''}`} onClick={() => treeMode && toggleTree()}>
            <IcoPathView /> {t('panel.view.path')}
          </button>
          <button className={`st2-seg-btn ${treeMode ? 'active' : ''}`} onClick={() => !treeMode && toggleTree()}>
            <IcoTreeView /> {t('panel.view.tree')}
          </button>
        </div>
      </div>
      {filterOpen && (
        <div className="st-filter">
          <input ref={filterRef} type="text" className="st-filter-input"
            placeholder={t('panel.filter.placeholder')} value={fileFilter}
            onChange={e => setFileFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeFilter() } }} />
          {fileFilter && (
            <button className="st-filter-clear" title={t('panel.filter.clear')} aria-label={t('panel.filter.clear')}
              onClick={() => { setFileFilter(''); filterRef.current?.focus() }}>×</button>
          )}
        </div>
      )}

      {/* ── File lists ── */}
      <div className="st2-lists">
        {/* Unstaged */}
        <div className={`st2-section ${unstagedOpen ? 'open' : ''}`}>
          <div className="st2-section-head">
            <button className="st2-section-toggle" onClick={() => setUnstagedOpen(o => !o)}>
              <IcoChevron open={unstagedOpen} />
              <span className="st2-section-title">{t('panel.unstaged')} ({totalUnstaged})</span>
            </button>
            <div style={{ flex: 1 }} />
            {totalUnstaged > 0 && (
              <button className="st2-link st2-green" onClick={() => handle(() => window.gitAPI.stageAll())}>
                {t('panel.stageAll')}
              </button>
            )}
          </div>
          {unstagedOpen && (
            <div className="st2-file-list">
              {totalUnstaged === 0
                ? <div className="st-empty">{t('panel.noChanges')}</div>
                : sortedUnstaged.length + sortedUntracked.length === 0
                ? <div className="st-empty">{t('panel.filter.noMatch', fileFilter.trim())}</div>
                : treeMode
                  ? unstagedTree.map(node => (
                      <TreeFileRow key={node.fullPath} node={node} depth={0}
                        onAction={paths => handle(() => window.gitAPI.stage(paths))}
                        actionIcon="+" actionTitle={t('panel.stage.file', node.fullPath)}
                        onSelect={p => selectFile({ path: p, area: 'unstaged' })}
                        onContextMenu={openFileMenu}
                        isSelected={selectedDiff?.area === 'unstaged' && selectedDiff?.path === node.fullPath}
                      />
                    ))
                  : <>
                      {sortedUnstaged.map(f => {
                        const meta = STATUS_META[f.status] ?? STATUS_META['?']
                        const isSelected = selectedDiff?.path === f.path && selectedDiff.area === 'unstaged'
                        return (
                          <div key={f.path} className={`st-file-row st-clickable ${isSelected ? 'st-selected' : ''}`}
                            onClick={() => selectFile({ path: f.path, area: 'unstaged' })}>
                            <span className="st-badge" style={{ color: meta.color }}>{meta.label}</span>
                            <span className="st-path" title={f.path}>{f.path}</span>
                            <DiffStat additions={f.additions} deletions={f.deletions} />
                            {onOpenStagingEditor && <button className="st-action st-hunk-editor" title={t('rp.hunkEditor')} onClick={e => { e.stopPropagation(); onOpenStagingEditor(f.path) }}><IcoHunks /></button>}
                            <button className="st-action st-stage" title={t('panel.stage.file', f.path)} onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.stage([f.path])) }}>+</button>
                            <button className="st-action st-discard" title={t('panel.discard')} onClick={async e => {
                              e.stopPropagation()
                              if (!window.confirm(t('panel.discard.confirm', f.path))) return
                              handle(() => window.gitAPI.discardFile(f.path))
                            }}>↺</button>
                          </div>
                        )
                      })}
                      {sortedUntracked.map(f => {
                        const isDir = f.endsWith('/')
                        return (
                          <div key={f} className="st-file-row">
                            <span className="st-badge" style={{ color: 'var(--success)' }}>{isDir ? <Icon name="folder" size={12} /> : '?'}</span>
                            <span className="st-path" title={f}>
                              {f}{isDir && <span className="st-dir-hint"> {t('panel.folder')}</span>}
                            </span>
                            <button className="st-action st-stage"
                              title={isDir ? t('panel.stage.folder', f) : t('panel.stage.file', f)}
                              onClick={() => handle(() => window.gitAPI.stage([f]))}>+</button>
                            <button className="st-action st-discard" title={t('panel.deleteUntracked')} onClick={async e => {
                              e.stopPropagation()
                              if (!window.confirm(t('panel.deleteUntracked.confirm', f))) return
                              handle(() => window.gitAPI.discardFile(f))
                            }}>🗑</button>
                          </div>
                        )
                      })}
                    </>
              }
            </div>
          )}
        </div>

        {/* Staged */}
        <div className={`st2-section ${stagedOpen ? 'open' : ''}`}>
          <div className="st2-section-head">
            <button className="st2-section-toggle" onClick={() => setStagedOpen(o => !o)}>
              <IcoChevron open={stagedOpen} />
              <span className="st2-section-title">{t('panel.staged')} ({stagedCount})</span>
            </button>
            <div style={{ flex: 1 }} />
            {changes.staged.length > 0 && (
              <button className="st2-link st2-danger-link" onClick={() => handle(() => window.gitAPI.unstage(changes.staged.map(f => f.path)))}>
                {t('panel.unstageAll')}
              </button>
            )}
          </div>
          {stagedOpen && (
            <div className="st2-file-list">
              {stagedCount === 0
                ? <div className="st-empty">{t('panel.noStaged')}</div>
                : sortedStaged.length + visibleAmendOnly.length === 0
                ? <div className="st-empty">{t('panel.filter.noMatch', fileFilter.trim())}</div>
                : treeMode
                  ? stagedTree.map(node => (
                      <TreeFileRow key={node.fullPath} node={node} depth={0}
                        onAction={paths => handle(() => window.gitAPI.unstage(paths))}
                        actionIcon="−" actionTitle={t('panel.unstaged')}
                        onSelect={p => selectFile({ path: p, area: 'staged' })}
                        onContextMenu={openFileMenu}
                        isSelected={selectedDiff?.area === 'staged' && selectedDiff?.path === node.fullPath}
                      />
                    ))
                  : <>
                      {sortedStaged.map(f => {
                        const meta = STATUS_META[f.status] ?? STATUS_META['?']
                        const isSelected = selectedDiff?.path === f.path && selectedDiff.area === 'staged'
                        return (
                          <div key={f.path} className={`st-file-row st-clickable ${isSelected ? 'st-selected' : ''}`}
                            onClick={() => selectFile({ path: f.path, area: 'staged' })}>
                            <span className="st-badge" style={{ color: meta.color }}>{meta.label}</span>
                            <span className="st-path" title={f.path}>{f.path}</span>
                            <DiffStat additions={f.additions} deletions={f.deletions} />
                            {onOpenStagingEditor && <button className="st-action st-hunk-editor" title={t('rp.hunkEditor')} onClick={e => { e.stopPropagation(); onOpenStagingEditor(f.path) }}><IcoHunks /></button>}
                            <button className="st-action st-unstage" title={t('panel.unstaged')} onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.unstage([f.path])) }}>−</button>
                          </div>
                        )
                      })}
                      {visibleAmendOnly.map(f => {
                        const meta = STATUS_META[f.status] ?? STATUS_META['?']
                        return (
                          <div key={f.path} className="st-file-row st-amend-file" title={t('panel.amendBadge.tooltip')}>
                            <span className="st-badge" style={{ color: meta.color }}>{meta.label}</span>
                            <span className="st-path">{f.path}</span>
                            <span className="st-amend-tag">amend</span>
                          </div>
                        )
                      })}
                    </>
              }
            </div>
          )}
        </div>
      </div>
      </>)}

      {/* ── Resize handle ── */}
      {/* No splitter in the empty state: there is nothing under it to size,
          and a drag handle over dead space reads as a broken pane. */}
      {!showEmptyState && (
        embeddedRow ? <ColumnResizeHandle value={effectiveFormWidth} min={240} max={maxFormWidth}
          label={t('panel.resize.filesCommit')} onChange={setFormWidth}
          onCommit={width => localStorage.setItem('st-embedded-form-width', String(width))} />
        : <div className="st2-resize" onMouseDown={onResizeDown}><div className="st2-resize-grip" /></div>
      )}

      {/* ── Commit area — not in the empty state: there is nothing to commit,
          and a form under "Next steps" would say otherwise. ── */}
      {!showEmptyState && (
      <div className="st2-commit" style={compactRow ? undefined : { height: effFormHeight }}>
        <div className="st2-commit-scroll">
        {/* Tabs */}
        <div className="st2-tabs">
          <button className="st2-tab active"><IcoCommit /> {t('panel.tab.commit')}</button>
          <button className="st2-tab-icon" title={t('panel.tab.stash')} onClick={async () => {
            const r = await window.gitAPI.createStash()
            if ((r as any)?.success === false) showToast(t('toast.stashErr', (r as any).error ?? ''), 'err')
            else { showToast(t('toast.stashCreated')); await load(); onCommitSuccess() }
          }}><IcoStash /></button>
          <button className="st2-tab-icon" title={t('panel.tab.push')} onClick={async () => {
            const r = await window.gitAPI.push()
            if ((r as any)?.success === false) showToast(t('toast.pushErr', (r as any).error ?? ''), 'err')
            else showToast(t('toast.pushOk', branchName))
          }}><IcoCloud /></button>
        </div>

        {/* Amend + AI generate — always share one row, at every panel size,
            so the message field below can start tall instead of losing a row
            to chrome. Amend itself only applies outside a conflict; the AI
            button (and, once stackedCompact drops the bottom action bar, the
            commit ✓) stay on this row regardless. */}
        <div className="st2-msg-toolbar">
          {embeddedRow && <>
            <button className="st2-options-toggle" aria-haspopup="menu" aria-expanded={!!compactMenu}
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setCompactMenu({ x: r.left, y: r.bottom + 4 })
              }}>{t('panel.compact.options')}{amend || signoff ? ' •' : ''}</button>
            {compactMenu && <ContextMenu x={compactMenu.x} y={compactMenu.y} onClose={() => setCompactMenu(null)} items={[
              { label: t('panel.amendPrevious'), checked: amend, action: () => { void toggleAmend(!amend) } },
              { label: t('panel.signoff'), checked: signoff, action: () => setSignoff(!signoff) },
              { label: t('panel.coAuthor.add'), action: () => { void loadAuthors(); setCoAuthorMenu(compactMenu) } },
              ...(branchStrip?.onAssociateIssue ? [{ label: t('sb.branch.associateIssue'), action: branchStrip.onAssociateIssue }] : []),
            ]} />}
          </>}
          {!isConflict && !embeddedRow && (
            <label className="st2-amend">
              <input type="checkbox" checked={amend} onChange={e => toggleAmend(e.target.checked)} />
              <span>{t('panel.amendPrevious')}</span>
            </label>
          )}
          <div style={{ flex: 1 }} />
          <button className={`st2-ai-btn ${generating ? 'loading' : ''}`} title={t('panel.generate.tooltip')}
            onClick={generateMessage} disabled={generating}>
            <IcoSpark size={13} /> <span>{t('panel.generate.short')}</span>
          </button>
          {/* Writing the message is the daily act and stays one click. What
              else the model can do with the same changes — read them, cut
              them into commits — hangs off a caret rather than taking two
              more buttons on a row that is already full. */}
          {(onExplainWorking || onSplitCommits) && (
            <button className="st2-ai-more" title={t('panel.aiMenuTitle')} aria-label={t('panel.aiMenuTitle')}
              disabled={generating}
              onClick={e => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setWipAiMenu({ x: r.right, y: r.bottom + 4 })
              }}>▾</button>
          )}
          {wipAiMenu && (
            <ContextMenu x={wipAiMenu.x} y={wipAiMenu.y} onClose={() => setWipAiMenu(null)} items={[
              ...(onExplainWorking ? [{ label: t('panel.aiExplainWorking'), action: onExplainWorking, icon: 'ai' as const, tone: 'ai' as const }] : []),
              ...(onSplitCommits ? [{ label: t('panel.aiSplit'), action: onSplitCommits, icon: 'ai' as const, tone: 'ai' as const }] : []),
            ]} />
          )}
          {stackedCompact && (
            <button
              className={`st2-commit-btn st2-commit-btn--inline ${commitReady ? 'ready' : ''}`}
              disabled={!commitReady || committing}
              onClick={doCommit}
              title={commitLabel}
            >
              <IcoCheck />
            </button>
          )}
        </div>

        {/* Agent proposal banner (MCP propose_commit) */}
        {commitProposal && (
          <div className="st2-proposal">
            <div className="st2-proposal-head">
              <span className="st2-proposal-title"><Icon name="agent" size={15} /> {t('panel.proposal.title')}</span>
              <button className="st2-proposal-close" title={t('panel.proposal.dismiss')}
                onClick={() => onProposalConsumed?.()}>×</button>
            </div>
            <div className="st2-proposal-body">{t('panel.proposal.msg')}</div>
            {commitProposal.files.length > 0 && (
              <>
                <ul className="st2-proposal-files">
                  {commitProposal.files.map(f => <li key={f} title={f}>{f}</li>)}
                </ul>
                <button className="st2-proposal-stage" onClick={stageProposedFiles}>
                  {t('panel.proposal.stage', String(commitProposal.files.length))}
                </button>
              </>
            )}
          </div>
        )}

        {/* Message box — one free-form field; the user's own line breaks decide
            where the subject ends and the body begins, git reads it the same
            way either way. No type prefix picker, no length counter: both ate
            into the field's height for little benefit. */}
        <div className="st2-msgbox">
          <textarea
            className="st2-message"
            placeholder={t('panel.commitMsg.placeholder')}
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit() }}
          />
        </div>

        {/* Options (signoff) — Compose-with-AI now lives on the toolbar above,
            so this row is just the collapsible toggle. */}
        <div className="st2-options-row">
          <button className="st2-options-toggle" onClick={() => setOptionsOpen(o => !o)}>
            <IcoChevron open={optionsOpen} /> {t('panel.commitOptions')}
          </button>
        </div>
        {coAuthorMenu && (
          <ContextMenu
            x={coAuthorMenu.x} y={coAuthorMenu.y}
            items={authors.length
              ? authors.map(a => ({
                  label: `${a.name} <${a.email}>`,
                  action: () => addCoAuthor(a.name, a.email),
                }))
              : [{ label: t('panel.coAuthor.none'), action: () => {} }]}
            onClose={() => setCoAuthorMenu(null)}
          />
        )}
        {optionsOpen && (
          <div className="st2-options">
            <button
              className="st2-coauthor"
              onClick={e => {
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                void loadAuthors()
                setCoAuthorMenu({ x: r.left, y: r.bottom + 4 })
              }}
            >
              {t('panel.coAuthor.add')}
            </button>
            <label className="st2-amend">
              <input type="checkbox" checked={signoff} onChange={e => setSignoff(e.target.checked)} />
              <span>{t('panel.signoff')}</span>
            </label>
          </div>
        )}

        </div>{/* end st2-commit-scroll */}

        {/* Dynamic commit button (+ abort in conflict mode). Skipped when
            stackedCompact folds it into the message toolbar's inline ✓ instead. */}
        {!stackedCompact && (
          <div className="st2-commit-actions">
            {isConflict && (
              <button className="st2-commit-btn st2-abort" onClick={onConflictAbort}>{t('panel.abort')}</button>
            )}
            <button
              className={`st2-commit-btn ${tiny && !embeddedRow ? 'st2-commit-btn--mini' : ''} ${compact && !tiny ? 'st2-commit-btn--short' : ''} ${commitReady ? 'ready' : ''}`}
              disabled={!commitReady || committing}
              onClick={doCommit}
              title={compact ? commitLabel : '⌘↵'}
            >
              {tiny && !embeddedRow ? <IcoCheck /> : <><IcoCommit /> {embeddedRow ? commitLabel : compact ? t('panel.commit.short') : commitLabel}</>}
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  )

  /**
   * Append a `Co-authored-by:` trailer, the way git itself expects it: in the
   * trailer block at the end, one per line, and never twice for the same person.
   */
  function addCoAuthor(name: string, email: string): void {
    const trailer = `Co-authored-by: ${name} <${email}>`
    setMessage(prev => {
      if (prev.includes(trailer)) return prev
      const body = prev.replace(/\s+$/, '')
      // A trailer block is separated from the message by one blank line; once
      // one exists, further trailers join it rather than starting a new block.
      const sep = !body ? '' : /\n(?:[A-Za-z-]+): .+$/.test(body) ? '\n' : '\n\n'
      return `${body}${sep}${trailer}\n`
    })
  }

  async function loadAuthors(): Promise<void> {
    if (authors.length) return
    try {
      const r = await window.gitAPI.getLog({ maxCount: 200 })
      const seen = new Map<string, { name: string; email: string }>()
      for (const c of r?.commits ?? []) {
        const email = (c.authorEmail ?? '').trim()
        if (!email || seen.has(email.toLowerCase())) continue
        seen.set(email.toLowerCase(), { name: (c.author ?? '').trim() || email, email })
      }
      setAuthors([...seen.values()].slice(0, 12))
    } catch { setAuthors([]) }
  }

  async function doCommit() {
    if (!message.trim()) return
    const full = message.trim()
    setCommitting(true)
    try {
      if (isConflict && onConflictFinish) {
        const action = (conflictMode === 'rebase' || conflictMode === 'cherry-pick' || conflictMode === 'revert') ? 'rebase' : 'merge'
        const success = await onConflictFinish(action, full)
        if (success === true) clearDraft()
      } else {
        const finalMessage = signoff ? `${full}\n\nSigned-off-by: ` : full
        const r = await window.gitAPI.commit(finalMessage, amend)
        if (r.success) {
          showToast(t('toast.commitOk'))
          clearDraft(); setSelectedDiff(null)
          onProposalConsumed?.()
          await load(); onCommitSuccess()
        } else showToast(t('toast.commitErr', r.error ?? ''), 'err')
      }
    } catch (error) {
      showToast(t('toast.commitErr', error instanceof Error ? error.message : String(error)), 'err')
    } finally {
      setCommitting(false)
    }
  }
}
