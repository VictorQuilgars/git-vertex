import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import hljs from 'highlight.js'
import { CommitNode, ConflictKind, FileChange, WorkingChanges } from '../../types'

// Whether each side actually holds a version of the path. Where one does not,
// choosing that side removes the file (resolveConflictWithSide falls back to
// `git rm -f`), so the button has to say Delete rather than Current/Incoming.
const SIDE_HAS_VERSION: Record<ConflictKind, { ours: boolean; theirs: boolean }> = {
  'both-modified':   { ours: true,  theirs: true  },
  'both-added':      { ours: true,  theirs: true  },
  'both-deleted':    { ours: false, theirs: false },
  'added-by-us':     { ours: true,  theirs: false },
  'added-by-them':   { ours: false, theirs: true  },
  'deleted-by-us':   { ours: false, theirs: true  },
  'deleted-by-them': { ours: true,  theirs: false },
  'unknown':         { ours: true,  theirs: true  },
}
import { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import { useLang } from '../../i18n/LanguageContext'
import { aiAvatarDataUri } from '../../utils/aiAvatars'
import { linkifyIssues, IssueRepo } from '../IssueLink/IssueLink'
import { parseAutolinks } from '../../utils/autolinks'
import { useSettings } from '../../contexts/SettingsContext'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import BranchStrip, { type BranchStripProps } from './BranchStrip'
import './RightPanel.css'
import WorkingChangesEmpty, { type NextStepsState, type NextStepsActions } from './WorkingChangesEmpty'

function detectLang(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', css: 'css', scss: 'scss',
    html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', c: 'c', cpp: 'cpp', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php',
    sql: 'sql', xml: 'xml', toml: 'toml', vue: 'xml',
  }
  return ext ? map[ext] : undefined
}

function hl(content: string, lang?: string): string {
  try {
    if (lang && hljs.getLanguage(lang))
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  } catch {
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

// ── Diff parser ───────────────────────────────────────────────
/**
 * What editing a given commit's message would take, as git sees it.
 * `isHead` means a plain `commit --amend`; otherwise `rewrites` is how many
 * commits get a new sha when the range is replayed. `canReword: false` covers a
 * root commit, a merge commit and anything outside HEAD's history.
 */
interface RewordPlan { canReword: boolean; isHead: boolean; rewrites: number; reason?: string }

interface DiffLine { type: 'add' | 'remove' | 'context'; content: string; oldLine?: number; newLine?: number }
interface DiffHunk { header: string; lines: DiffLine[] }
interface FileDiff { from: string; to: string; hunks: DiffHunk[] }

function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = []
  const blocks = raw.split(/^diff --git /m).filter(Boolean)
  for (const block of blocks) {
    const lines = block.split('\n')
    const match = lines[0].match(/a\/(.+?) b\/(.+)/)
    const to = match?.[2] ?? lines[0]
    const hunks: DiffHunk[] = []
    let h: DiffHunk | null = null
    let ol = 0, nl = 0
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        ol = parseInt(m?.[1] ?? '1'); nl = parseInt(m?.[2] ?? '1')
        h = { header: line, lines: [] }; hunks.push(h)
      } else if (h) {
        if (line.startsWith('+')) h.lines.push({ type: 'add', content: line.slice(1), newLine: nl++ })
        else if (line.startsWith('-')) h.lines.push({ type: 'remove', content: line.slice(1), oldLine: ol++ })
        else if (!line.startsWith('\\') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++'))
          h.lines.push({ type: 'context', content: line.slice(1), oldLine: ol++, newLine: nl++ })
      }
    }
    if (hunks.length) files.push({ from: to, to, hunks })
  }
  return files
}

// ── File tree builder ─────────────────────────────────────────
interface TreeNode {
  name: string
  fullPath: string
  isFile: boolean
  status?: string
  children: TreeNode[]
}

function buildTree(files: { path: string; status: string }[]): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', isFile: false, children: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      let child = node.children.find(c => c.name === parts[i])
      if (!child) {
        child = { name: parts[i], fullPath: parts.slice(0, i + 1).join('/'), isFile: isLast, status: isLast ? f.status : undefined, children: [] }
        node.children.push(child)
      }
      node = child
    }
  }
  return root.children
}

const TreePencil = () => (
  <Icon name="pencil" size={12} />
)

function treeStats(node: TreeNode): { mod: number; add: number; del: number } {
  if (node.isFile) {
    const s = node.status ?? 'M'
    return { mod: s !== 'A' && s !== 'D' ? 1 : 0, add: s === 'A' ? 1 : 0, del: s === 'D' ? 1 : 0 }
  }
  return node.children.reduce((acc, c) => {
    const cs = treeStats(c)
    return { mod: acc.mod + cs.mod, add: acc.add + cs.add, del: acc.del + cs.del }
  }, { mod: 0, add: 0, del: 0 })
}

// Single source of truth for the per-file status marker (M/A/D/R/?), used
// everywhere — staging list, staging tree, commit details — so the same file
// state always reads the same. Defined near buildTree; STATUS_META lives below
// and is hoisted, so this resolves fine at render time.
function StatusBadge({ status, className }: { status?: string; className?: string }) {
  const m = STATUS_META[status ?? 'M'] ?? STATUS_META['?']
  return <span className={`st-badge ${className ?? ''}`} style={{ color: m.color }}>{m.label}</span>
}

function TreeFileRow({ node, depth, onAction, actionIcon, actionTitle, onSelect, isSelected, onContextMenu }: {
  node: TreeNode; depth: number
  onAction: (paths: string[]) => void
  actionIcon: string; actionTitle: string
  onSelect?: (path: string) => void
  isSelected?: boolean
  /** Right-click on a FILE row (folders have nothing to link to). */
  onContextMenu?: (e: React.MouseEvent, path: string) => void
}) {
  const { t } = useLang()
  const [open, setOpen] = React.useState(true)
  const indent = depth * 10

  if (node.isFile) {
    return (
      <div
        className={`st-tr st-clickable ${isSelected ? 'st-selected' : ''}`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => onSelect?.(node.fullPath)}
        onContextMenu={onContextMenu && (e => onContextMenu(e, node.fullPath))}
      >
        <StatusBadge status={node.status} className="st-tr-badge" />
        <span className="st-tr-name">{node.name}</span>
        {actionIcon && (
          <button className={`st-action ${actionIcon === '+' ? 'st-stage' : 'st-unstage'}`}
            title={actionTitle}
            onClick={e => { e.stopPropagation(); onAction([node.fullPath]) }}>
            {actionIcon}
          </button>
        )}
      </div>
    )
  }

  const allPaths = (n: TreeNode): string[] =>
    n.isFile ? [n.fullPath] : n.children.flatMap(allPaths)
  const stats = !open ? treeStats(node) : null

  return (
    <>
      <div className="st-tr st-tr-dir" style={{ paddingLeft: indent }} onClick={() => setOpen(o => !o)}>
        <span className="st-tr-tri">{open ? '▼' : '▶'}</span>
        <span className="st-tr-dirname">{node.name}</span>
        {stats && (
          <div className="st-tr-stats">
            {stats.mod > 0 && <><TreePencil /><span className="st-stat-mod">{stats.mod}</span></>}
            {stats.add > 0 && <span className="st-stat-add">+{stats.add}</span>}
            {stats.del > 0 && <span className="st-stat-del">−{stats.del}</span>}
          </div>
        )}
        {actionIcon && (
          <button className={`st-action ${actionIcon === '+' ? 'st-stage' : 'st-unstage'}`}
            title={t('rp.folderAction', actionTitle)}
            onClick={e => { e.stopPropagation(); onAction(allPaths(node)) }}>
            {actionIcon}
          </button>
        )}
      </div>
      {open && node.children.map(c => (
        <TreeFileRow key={c.fullPath} node={c} depth={depth + 1}
          onAction={onAction} actionIcon={actionIcon} actionTitle={actionTitle}
          onSelect={onSelect} isSelected={isSelected && c.fullPath === node.fullPath} />
      ))}
    </>
  )
}

// ── Shared helpers ────────────────────────────────────────────
function getAvatarColor(str: string) {
  const colors = ['#00bfff','#ff6b6b','#51cf66','#ffd43b','#cc5de8','#ff922b','#20c997','#f06595']
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}
function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

function GravatarAvatar({ email, name, sha, size = 36, radius = 6 }: {
  email: string; name: string; sha?: string; size?: number; radius?: number
}) {
  const aiLogo = aiAvatarDataUri(name, email)
  const [src, setSrc] = useState<string | null>(aiLogo)
  useEffect(() => {
    if (aiLogo) { setSrc(aiLogo); return }
    if (!email) { console.log('[avatar] no email for', name); return }
    console.log('[avatar] resolving', email, sha ? `sha=${sha}` : '(no sha)')
    ;(window.gitAPI as any).avatarResolve(email, sha)
      .then((url: string | null) => {
        console.log('[avatar] resolved', email, '→', url)
        setSrc(url)
      })
      .catch((err: unknown) => { console.warn('[avatar] resolve error', email, err) })
  }, [email, sha, aiLogo])

  const base: React.CSSProperties = { width: size, height: size, borderRadius: radius, flexShrink: 0 }
  if (src) {
    return <img src={src} alt={name} style={{ ...base, objectFit: 'cover', display: 'block' }}
      onError={() => { console.warn('[avatar] img load error, falling back to initials. src=', src); setSrc(null) }} />
  }
  return (
    <div style={{ ...base, background: getAvatarColor(email), display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-on-emphasis)', fontWeight: 700, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  )
}
function fmtDate(s: string, locale: string) {
  try { return new Date(s).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return s }
}
const STATUS_META: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: 'var(--accent)' }, A: { label: 'A', color: 'var(--success)' },
  D: { label: 'D', color: 'var(--danger)' }, R: { label: 'R', color: 'var(--purple-text)' },
  '!': { label: '!', color: 'var(--attention)' }, '?': { label: '?', color: 'var(--text-secondary)' },
}

// ── File History modal ────────────────────────────────────────

// ── Blame view ────────────────────────────────────────────────
interface BlameLine {
  shortHash: string; hash: string; author: string; date: string; lineNum: number; content: string
}

function hashToColor(hash: string): string {
  let n = 0
  for (let i = 0; i < 6; i++) n = (n * 16 + parseInt(hash[i], 16))
  const hue = n % 360
  return `hsl(${hue}, 55%, 28%)`
}

function BlameView({ commitHash, filepath, onSelectCommit }: {
  commitHash: string; filepath: string; onSelectCommit: (hash: string) => void
}) {
  const { t } = useLang()
  const [lines, setLines] = useState<BlameLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.gitAPI.getBlame(commitHash, filepath).then(r => {
      setLines(r.lines ?? [])
      setLoading(false)
    })
  }, [commitHash, filepath])

  if (loading) return <div className="rp-blame-loading">{t('panel.loadingBlame')}</div>
  if (!lines.length) return <div className="rp-blame-loading">{t('panel.noBlame')}</div>

  return (
    <div className="rp-blame-container">
      <table className="rp-blame-table">
        <tbody>
          {lines.map((line, i) => {
            const prevHash = lines[i - 1]?.hash
            const isNewBlock = line.hash !== prevHash
            const bg = hashToColor(line.hash)
            return (
              <tr key={i} className="rp-blame-row">
                <td
                  className="rp-blame-meta"
                  style={{ background: bg, opacity: isNewBlock ? 1 : 0.6 }}
                >
                  {isNewBlock ? (
                    <>
                      <span
                        className="rp-blame-hash"
                        onClick={() => onSelectCommit(line.hash)}
                        title={`${line.hash}\n${line.author}\n${line.date}`}
                      >
                        {line.shortHash}
                      </span>
                      <span className="rp-blame-author">{line.author.split(' ')[0]}</span>
                      <span className="rp-blame-date">{line.date}</span>
                    </>
                  ) : null}
                </td>
                <td className="rp-blame-linenum">{line.lineNum}</td>
                <td className="rp-blame-content"><code>{line.content}</code></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── CommitDetail view ─────────────────────────────────────────
function formatPath(path: string): { dir: string; name: string } {
  const parts = path.split('/')
  const name = parts.pop() ?? path
  const dir = parts.join('/')
  if (!dir) return { dir: '', name }
  const MAX = 26
  return { dir: (dir.length > MAX ? dir.slice(0, MAX - 1) + '…' : dir) + '/', name }
}

const MIN_MSG_H = 48
const MAX_MSG_H = 400

function CommitDetail({ commit, onSelectCommit, wipCount, onViewWip, onOpenFileDiff, onAmendSuccess, githubRepo, onRewordMessage, showToast, onOpenFileOnRemote, onCopyFileLink, onRestoreFile, onOpenFileHistory }: {
  commit: CommitNode
  onSelectCommit: (hash: string) => void
  wipCount?: number
  onViewWip?: () => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onAmendSuccess?: () => void
  githubRepo?: IssueRepo | null
  // A file inside a commit is the one place we know BOTH a path and the exact
  // ref it existed at, which is what a shareable link needs. Callbacks rather
  // than the parsed remote: the two hosts already hold it, and threading data
  // three components deep to rebuild the same string would be the duplication
  // this lot exists to delete. Omitted ⇒ the menu rows simply do not appear.
  onOpenFileOnRemote?: (hash: string, filePath: string) => void
  onCopyFileLink?: (hash: string, filePath: string) => void
  /** Put this file back the way it was at this commit. Asks first. */
  onRestoreFile?: (hash: string, filePath: string) => void
  /**
   * Show this file's history — the host decides where a view goes: a tab in the
   * app, an editor tab in the panel. Omitted ⇒ the button disappears rather
   * than opening nothing.
   */
  onOpenFileHistory?: (filePath: string) => void
  /**
   * Apply a message to a commit that is NOT the tip — a replay of everything
   * after it. The host owns it because it is a rebase: loading state, conflict
   * reporting and the reload afterwards are all its business. Without this prop
   * the message block stays editable only on the tip.
   */
  onRewordMessage?: (hash: string, message: string) => void | Promise<void>
  showToast?: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { t } = useLang()
  const [files, setFiles] = useState<FileChange[]>([])
  // Distinguishes "still fetching" from "fetched, and there is nothing" — a
  // merge commit legitimately lists no file, and showing "Loading…" for it
  // leaves the panel looking hung for as long as the commit stays selected.
  const [filesLoading, setFilesLoading] = useState(true)
  const [body, setBody] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [view, setView] = useState<'files' | 'blame'>('files')
  const [cdTreeMode, setCdTreeMode] = useState(() => localStorage.getItem('cd-tree-mode') === 'true')
  const [viewAll, setViewAll] = useState(false)
  const [msgHeight, setMsgHeight] = useState(120)
  const [amendEditing, setAmendEditing] = useState(false)
  const [amendMsg, setAmendMsg] = useState('')
  const [amendLoading, setAmendLoading] = useState(false)
  // Whether this commit's message can be edited at all, and what it would cost.
  // Answered by git rather than guessed from refs: the old check read
  // `refs.includes('HEAD')`, which is true only for the tip and says nothing
  // about the commits behind it.
  const [rewordPlan, setRewordPlan] = useState<RewordPlan | null>(null)
  // AI menu on the "Recompose commit with AI" button
  const [fileMenu, setFileMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const { get } = useSettings()
  // Configured reference patterns (Jira, Linear…), for the message below.
  const autolinks = React.useMemo(() => parseAutolinks(get('autolinks', '')), [get])
  const [aiMenu, setAiMenu] = useState<{ x: number; y: number } | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)
  const [explOpen, setExplOpen] = useState(false)
  // Cached explanation for this commit (from a previous run) — NOT shown by
  // default; a small button in the top row lets the user reveal it for free.
  const [cachedExplanation, setCachedExplanation] = useState<string | null>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: msgHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = ev.clientY - dragRef.current.startY
      const newH = Math.min(MAX_MSG_H, Math.max(MIN_MSG_H, dragRef.current.startH + delta))
      setMsgHeight(newH)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [msgHeight])

  useEffect(() => {
    setFiles([]); setBody(''); setSelectedFile(null); setView('files')
    setAmendEditing(false); setAmendMsg(''); setAmendLoading(false)
    setAiMenu(null); setAiExplanation(null); setCachedExplanation(null); setExplOpen(false)
    setFilesLoading(true)
    // Asked per commit, and only used to decide whether the message block is
    // clickable — a host that does not implement it simply gets no editing.
    setRewordPlan(null)
    ;(window.gitAPI as any).getRewordPlan?.(commit.hash)
      .then((p: RewordPlan) => setRewordPlan(p ?? null))
      .catch(() => setRewordPlan(null))
    Promise.all([
      window.gitAPI.getCommitFiles(commit.hash),
      (window.gitAPI as any).getCommitBody(commit.hash),
    ]).then(([fr, br]: any[]) => {
      setFiles(fr.files ?? [])
      setBody(br.body ?? '')
    }).finally(() => setFilesLoading(false))
    // Cached AI explanation for this commit, if any — kept behind a small
    // reveal button, never auto-shown.
    ;(window.gitAPI as any).aiGetExplanations?.()
      .then((r: any) => { const e = r?.explanations?.[commit.hash]; if (e) setCachedExplanation(e) })
      .catch(() => {})
  }, [commit.hash])

  const parentShort = commit.parents?.[0]?.slice(0, 7) ?? null
  const isHeadCommit = commit.refs.some(r => r.includes('HEAD'))
  // Editing the tip needs nothing from the host; editing anything older needs
  // the host's reword handler, since it is a rebase. Both need git to have said
  // yes — a merge commit, a root commit or a commit off HEAD's history cannot
  // be reworded at all, and the block stays plain text for them.
  const canEditMessage = !!rewordPlan?.canReword && (rewordPlan.isHead || !!onRewordMessage)

  // ── AI actions (Recompose / Explain) ──
  const runAiRecompose = useCallback(async () => {
    setAiBusy(true)
    try {
      const r = await (window.gitAPI as any).aiRecomposeCommit(commit.hash)
      if (r.error) {
        showToast?.(r.error === 'NO_API_KEY' ? t('panel.aiNoKey') : r.error, 'err')
        return
      }
      if (canEditMessage) {
        // Prefill the inline editor and let the user review before confirming —
        // the same gesture whether this is the tip or a commit ten back. It used
        // to branch here, sending non-tip commits through a modal prompt.
        setAmendMsg(r.message)
        setAmendEditing(true)
      } else {
        // Nothing can be rewritten here (merge commit, root, another branch), so
        // the proposal would have nowhere to go. Hand it over instead of
        // dropping it.
        await navigator.clipboard.writeText(r.message)
        showToast?.(t('panel.aiCopied'), 'ok')
      }
    } catch (e: any) {
      // e.g. VS Code host without the ai handler yet — the shim rejects.
      showToast?.(e?.message ?? 'AI error', 'err')
    } finally {
      setAiBusy(false)
    }
  }, [commit.hash, canEditMessage, showToast, t])

  const runAiExplain = useCallback(async (force = false) => {
    setAiBusy(true)
    if (force) setAiExplanation(null)
    try {
      const r = await (window.gitAPI as any).aiExplainCommit(commit.hash, force)
      if (r.error) {
        showToast?.(r.error === 'NO_API_KEY' ? t('panel.aiNoKey') : r.error, 'err')
        return
      }
      setAiExplanation(r.explanation)
      setCachedExplanation(r.explanation)
      setExplOpen(true)
    } catch (e: any) {
      showToast?.(e?.message ?? 'AI error', 'err')
    } finally {
      setAiBusy(false)
    }
  }, [commit.hash, showToast, t])

  const aiMenuItems: MenuItemDef[] = [
    { label: t('panel.aiRecompose'), action: runAiRecompose },
    { label: cachedExplanation ? t('panel.aiExplainAgain') : t('panel.aiExplain'), action: () => runAiExplain(!!cachedExplanation) },
  ]

  // Parse co-authors from body (name + email)
  const coAuthors = body
    ? [...body.matchAll(/Co-Authored-By:\s*(.+?)\s*<([^>]+)>/gi)].map(m => ({ name: m[1].trim(), email: m[2].trim() }))
    : []
  // Body without co-author lines
  const cleanBody = body
    ? body.replace(/^Co-Authored-By:.*$/gim, '').trim()
    : ''

  return (
    <div className="rp-content">
      {/* ── WIP banner ── */}
      {wipCount != null && wipCount > 0 && (
        <div className="cd-wip-banner">
          <span>{t('rp2.wipCount', wipCount)}</span>
          <button className="cd-view-change-btn" onClick={onViewWip}>{t('rp.viewChanges')}</button>
        </div>
      )}

      {/* ── Hash + AI row ── */}
      <div className="cd-top-row">
        <div className="cd-hash-info">
          <span className="cd-label">commit:</span>
          <code className="cd-hash" onClick={() => navigator.clipboard.writeText(commit.hash)}
            title={t('panel.copyHash')}>{commit.shortHash}</code>
        </div>
        <button
          className="cd-ai-btn"
          disabled={aiBusy}
          onClick={e => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setAiMenu({ x: rect.left, y: rect.bottom + 4 })
          }}
        >
          <Icon name="ai" size={13} />
          <span className="cd-ai-label">{aiBusy ? t('panel.aiWorking') : 'Recompose commit with AI'}</span>
          <span className="cd-ai-sep" />
          <span className="cd-ai-arrow">▼</span>
        </button>
        {aiMenu && (
          <ContextMenu
            x={aiMenu.x} y={aiMenu.y}
            items={aiMenuItems}
            onClose={() => setAiMenu(null)}
          />
        )}
      </div>

      {/* ── AI explanation (persistent accordion when one exists) ── */}
      {(aiExplanation || cachedExplanation) && (
        <div className="cd-ai-explain">
          <div
            className="cd-ai-explain-head"
            onClick={() => setExplOpen(o => !o)}
            title={explOpen ? undefined : t('panel.aiShowCached')}
          >
            <span className="cd-ai-explain-chevron">{explOpen ? '▾' : '▸'}</span>
            <span className="cd-ai-explain-title">💬 {explOpen ? t('panel.aiExplainTitle') : t('panel.aiExplainAvailable')}</span>
            {explOpen && (
              <button className="cd-ai-explain-refresh" title={t('panel.aiExplainAgain')} disabled={aiBusy}
                onClick={e => { e.stopPropagation(); runAiExplain(true) }}>{aiBusy ? '…' : '↻'}</button>
            )}
          </div>
          {explOpen && <p className="cd-ai-explain-text">{aiExplanation ?? cachedExplanation}</p>}
        </div>
      )}

      {/* ── Scrollable content ── */}
      <div className="cd-scroll">
        {/* Zone 1 — commit message (dark) */}
        <div
          className={`cd-message-block${amendEditing ? ' cd-message-block--editing' : ''}${!amendEditing && canEditMessage ? ' cd-message-block--amendable' : ''}`}
          style={amendEditing ? undefined : { height: msgHeight, minHeight: MIN_MSG_H, maxHeight: MAX_MSG_H }}
          onClick={!amendEditing && canEditMessage ? () => {
            const full = commit.message + (body ? '\n\n' + body : '')
            setAmendMsg(full)
            setAmendEditing(true)
          } : undefined}
          title={!amendEditing && canEditMessage
            ? (rewordPlan?.isHead ? t('panel.clickToAmend') : t('panel.clickToReword', rewordPlan?.rewrites ?? 0))
            : undefined}
        >
          {amendEditing ? (
            <textarea
              className="cd-amend-textarea"
              value={amendMsg}
              onChange={e => setAmendMsg(e.target.value)}
              autoFocus
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <>
              <p className="cd-title">{linkifyIssues(commit.message, githubRepo, autolinks)}</p>
              {cleanBody && <pre className="cd-body">{linkifyIssues(cleanBody, githubRepo, autolinks)}</pre>}
            </>
          )}
        </div>

        {/* Amend / reword action buttons */}
        {amendEditing && (
          <div className="cd-amend-actions">
            {/* Rewording an older commit replays everything after it, which is a
                different promise from amending the tip. The button says which
                one you are about to do, and how many commits it moves. */}
            {rewordPlan && !rewordPlan.isHead && (
              <span className="cd-amend-warn" title={t('panel.rewordWarnTitle')}>
                {t('panel.rewordWarn', rewordPlan.rewrites)}
              </span>
            )}
            <button
              className="cd-amend-confirm"
              disabled={amendLoading || !amendMsg.trim()}
              onClick={async () => {
                const next = amendMsg.trim()
                setAmendLoading(true)
                try {
                  if (rewordPlan && !rewordPlan.isHead) {
                    // Not the tip: the host replays the range with this message.
                    // It owns the loading/toast/refresh cycle, so nothing here
                    // reports success on its own.
                    await onRewordMessage?.(commit.hash, next)
                  } else {
                    const r = await (window.gitAPI as any).amendMessage(next)
                    if (r && r.success === false) {
                      showToast?.(r.error ?? t('panel.amendFailed'), 'err')
                      return
                    }
                    onAmendSuccess?.()
                  }
                  setAmendEditing(false)
                } catch (err: any) {
                  showToast?.(err?.message ?? t('panel.amendFailed'), 'err')
                } finally {
                  setAmendLoading(false)
                }
              }}
            >
              {amendLoading
                ? '…'
                : rewordPlan && !rewordPlan.isHead ? t('panel.rewordConfirm') : t('panel.amendConfirm')}
            </button>
            <button className="cd-amend-cancel" onClick={() => setAmendEditing(false)}>
              {t('panel.amendCancel')}
            </button>
          </div>
        )}

        {/* Resize handle */}
        {!amendEditing && (
          <div className="cd-resize-handle" onMouseDown={onResizeMouseDown}>
            <div className="cd-resize-grip" />
          </div>
        )}

        {/* Zone 2 — commit info (lighter) */}
        <div className="cd-info-zone">
          {/* Author */}
          <div className="cd-author-block">
            <GravatarAvatar email={commit.authorEmail} name={commit.author} sha={commit.hash} size={36} radius={6} />
            <div className="cd-author-mid">
              <span className="cd-author-name">{commit.author}</span>
              <span className="cd-author-meta">authored {fmtDate(commit.date, t('graph.dateLocale'))}</span>
            </div>
            {parentShort && (
              <button className="cd-parent-btn" onClick={() => onSelectCommit(commit.parents[0])}>
                parent: <code>{parentShort}</code>
              </button>
            )}
          </div>

          {coAuthors.length > 0 && (
            <div className="cd-coauthors">
              <span className="cd-label">Co-authors:</span>
              {coAuthors.map((a, i) => (
                <GravatarAvatar key={i} email={a.email} name={a.name} size={28} radius={6} />
              ))}
            </div>
          )}

          {/* Refs */}
          {commit.refs.length > 0 && (
            <div className="cd-refs">
              {commit.refs
                .filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
                .map((r, i) => {
                  const isHead = r.includes('HEAD'), isTag = r.startsWith('tag:')
                  const isRemote = r.includes('origin/') || r.includes('remotes/')
                  const text = r.replace('tag: ', '').replace('HEAD -> ', '★ ')
                  const cls = isHead ? 'rp-ref-head' : isTag ? 'rp-ref-tag' : isRemote ? 'rp-ref-remote' : 'rp-ref-local'
                  return <span key={i} className={`rp-ref ${cls}`}>{text}</span>
                })}
            </div>
          )}

          {/* Files count */}
          {files.length > 0 && (() => {
            const nMod = files.filter(f => f.status !== 'A' && f.status !== 'D').length
            const nAdd = files.filter(f => f.status === 'A').length
            const nDel = files.filter(f => f.status === 'D').length
            return (
              <div className="cd-files-count-row">
                {nMod > 0 && <>
                  <Icon name="pencil" size={12} />
                  <span className="cd-count-mod">{nMod} modified</span>
                </>}
                {nAdd > 0 && <span className="cd-count-add">+ {nAdd} added</span>}
                {nDel > 0 && <span className="cd-count-del">− {nDel} deleted</span>}
              </div>
            )
          })()}

          {/* Files bar */}
          <div className="cd-files-bar">
            <button className="cd-sort-btn" title={t('rp.sort')}>
              <Icon name="sort" size={13} />
            </button>
            <div className="cd-view-toggle">
              <button className={`cd-view-btn ${!cdTreeMode ? 'active' : ''}`} onClick={() => { setView('files'); setCdTreeMode(false); localStorage.setItem('cd-tree-mode', 'false') }}>
                <Icon name="list" size={11} />
                Path
              </button>
              <button className={`cd-view-btn ${cdTreeMode ? 'active' : ''}`} onClick={() => setCdTreeMode(v => { localStorage.setItem('cd-tree-mode', String(!v)); return !v })}>
                <Icon name="listTree" size={11} />
                Tree
              </button>
            </div>
            <label className="cd-viewall">
              <input type="checkbox" checked={viewAll} onChange={e => setViewAll(e.target.checked)} />
              <span>{t('rp.allFiles')}</span>
            </label>
          </div>

          {/* File list */}
          {fileMenu && (
            <ContextMenu
              x={fileMenu.x} y={fileMenu.y}
              items={[
                ...(onOpenFileOnRemote ? [{
                  label: t('panel.file.openOnRemote'),
                  action: () => onOpenFileOnRemote(commit.hash, fileMenu.path),
                }] : []),
                ...(onCopyFileLink ? [{
                  label: t('panel.file.copyLink'),
                  action: () => onCopyFileLink(commit.hash, fileMenu.path),
                }] : []),
                { label: t('panel.file.copyPath'), action: () => navigator.clipboard.writeText(fileMenu.path) },
                ...(onRestoreFile ? [
                  // `as MenuItemDef[]`: a separator is typed `separator: true`,
                  // and an array literal widens it to boolean.
                  { separator: true },
                  {
                    label: t('panel.file.restore'),
                    action: () => onRestoreFile(commit.hash, fileMenu.path),
                  },
                ] as MenuItemDef[] : []),
              ]}
              onClose={() => setFileMenu(null)}
            />
          )}
          {view === 'files' && (
            <div className="rp-file-list">
              {cdTreeMode
                ? buildTree(files.map(f => ({ path: f.path, status: f.status ?? 'M' }))).map(node => (
                    <TreeFileRow key={node.fullPath} node={node} depth={0}
                      onAction={() => {}}
                      actionIcon=""
                      actionTitle=""
                      onSelect={p => { setSelectedFile(p); onOpenFileDiff?.({ type: 'commit', commitHash: commit.hash, filePath: p }) }}
                      onContextMenu={(e, p) => { e.preventDefault(); setFileMenu({ x: e.clientX, y: e.clientY, path: p }) }}
                      isSelected={selectedFile === node.fullPath}
                    />
                  ))
                : files.map((f, i) => {
                    const { dir, name } = formatPath(f.path)
                    const s = f.status ?? 'M'
                    return (
                      <div key={i}
                        className={`rp-file-row ${selectedFile === f.path ? 'active' : ''}`}
                        onClick={() => { setSelectedFile(f.path); onOpenFileDiff?.({ type: 'commit', commitHash: commit.hash, filePath: f.path }) }}
                        onContextMenu={e => { e.preventDefault(); setFileMenu({ x: e.clientX, y: e.clientY, path: f.path }) }}
                      >
                        <StatusBadge status={s} className="rp-file-badge" />
                        <span className="rp-file-path">
                          {dir && <span className="rp-file-dir">{dir}</span>}
                          <span className="rp-file-name">{name}</span>
                        </span>
                        {onOpenFileHistory && (
                          <button className="rp-history-btn" title={t('panel.history')}
                            onClick={e => { e.stopPropagation(); onOpenFileHistory(f.path) }}>
                            <Icon name="history" size={11} />
                          </button>
                        )}
                      </div>
                    )
                  })
              }
              {files.length === 0 && (
                <div className="rp-empty">
                  {filesLoading ? t('panel.loading') : t('panel.noFileChanged')}
                </div>
              )}
            </div>
          )}

          {view === 'blame' && selectedFile && (
            <BlameView commitHash={commit.hash} filepath={selectedFile} onSelectCommit={onSelectCommit} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Staging view (commit panel) ───────────────
interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

// Inline icons (currentColor)
const IcoTrash = () => (<Icon name="trash" size={15} />)
const IcoSpark = ({ size = 14 }: { size?: number }) => (<Icon name="ai" />)
const IcoSort = () => (<Icon name="sort" size={15} />)
const IcoPathView = () => (<Icon name="list" size={12} />)
const IcoSearch = () => (<Icon name="search" size={12} />)

const IcoCopy = () => (<Icon name="copy" size={13} />)
const IcoOpenDiff = () => (<Icon name="externalLink" size={12} />)

// Per-file line counts (v1.22.0). Renders nothing when git reported none —
// untracked files and binaries — so "unknown" never reads as "+0 −0".
function DiffStat({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions === undefined && deletions === undefined) return null
  return (
    <span className="st-numstat" title={`+${additions ?? 0} / −${deletions ?? 0}`}>
      {!!additions && <span className="st-numstat-add">+{additions}</span>}
      {!!deletions && <span className="st-numstat-del">−{deletions}</span>}
    </span>
  )
}
const IcoTreeView = () => (<Icon name="listTree" size={12} />)
const IcoCommit = () => (<Icon name="commit" size={15} />)
const IcoStash = () => (<Icon name="stash" size={15} />)
const IcoCheck = ({ size = 16 }: { size?: number }) => (<Icon name="check" />)
const IcoHunks = () => (<Icon name="hunk" size={13} />)
const IcoCloud = () => (<Icon name="cloud" size={15} />)
const IcoChevron = ({ open }: { open: boolean }) => (<Icon name="chevronRight" size={11} />)

// ── Embedded (VS Code) single-list staging: checkbox helpers ──────
type StageState = 'staged' | 'unstaged' | 'partial'

// Checkbox that can render the tri-state "indeterminate" look (partial staging /
// mixed folder). React has no `indeterminate` prop, so it's set via a ref.
function IndetCheckbox({ checked, indeterminate, onChange, className, title, disabled }: {
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

interface StageTreeCtx {
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
function collectTreeFiles(n: TreeNode): string[] {
  return n.isFile ? [n.fullPath] : n.children.flatMap(collectTreeFiles)
}
// Checkbox file-tree row for the embedded single-list staging view. Folders get
// a tri-state checkbox that stages/unstages every descendant at once.
function CheckTreeRow({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: StageTreeCtx }) {
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

function StagingView({ onCommitSuccess, showToast, currentBranch, conflictMode, conflictFiles, onConflictFinish, onConflictAbort, onOpenFileDiff, onOpenStagingEditor, commitProposal, onProposalConsumed, embedded, branchStrip, emptyState }: {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  currentBranch?: string
  conflictMode?: string | null
  conflictFiles?: string[]
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onOpenStagingEditor?: (file: string) => void
  commitProposal?: { message: string; files: string[] } | null
  onProposalConsumed?: () => void
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
  // Single free-form commit message: the user controls their own line breaks
  // (first line reads as the subject by git convention, but nothing forces
  // that split — no separate summary/description fields).
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
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
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiffFile | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
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
  const compactRow = compact && panelSize.w >= 640
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
    setAmend(checked)
    if (checked) {
      const [msgRes, filesRes] = await Promise.all([
        window.gitAPI.getLastCommitMessage(),
        window.gitAPI.getCommitFiles('HEAD'),
      ])
      setMessage(msgRes.message ?? '')
      setAmendFiles(filesRes.files ?? [])
    } else {
      setMessage('')
      setAmendFiles([])
    }
  }, [])

  const load = useCallback(async () => {
    const r = await window.gitAPI.getWorkingChanges()
    setChanges(r as WorkingChanges)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handler = () => load()
    const offRepo = window.gitAPI.onRepoChanged(handler)
    const offWorking = window.gitAPI.onWorkingChanged(handler)
    return () => { offRepo(); offWorking() }
  }, [load])

  useEffect(() => {
    if (isConflict) {
      window.gitAPI.getMergeMessage().then(r => { if (r.message) setMessage(r.message) })
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

  const handle = async (fn: () => Promise<any>, reload = true) => {
    await fn()
    if (reload) await load()
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
  // A clean tree in the panel: the pane shows what comes next, not a form for
  // a commit that has nothing in it. Amend is excluded — an amend with no new
  // files is still a commit being written.
  const showEmptyState = !!(embedded && emptyState && !isConflict && totalChanged === 0 && !amend)
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
  const stageOne = (paths: string[]) => handle(() => window.gitAPI.stage(paths))
  const unstageOne = (paths: string[]) => handle(() => window.gitAPI.unstage(paths))
  const discardOne = async (path: string) => {
    if (!window.confirm(t('panel.discard.confirm', path))) return
    handle(() => window.gitAPI.discardFile(path))
  }
  const toggleAllStaged = () => handle(() =>
    allStaged ? window.gitAPI.unstage(changes.staged.map(x => x.path)) : window.gitAPI.stageAll())
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
    <div className={`rp-content rp-staging st2 ${compact ? 'st2--compact' : ''} ${compactRow ? 'st2--row' : ''} ${tiny ? 'st2--tiny' : ''} ${trimTop ? 'st2--trimtop' : ''} ${splitLists ? 'st2--splitlists' : ''}`} ref={stRootRef}>
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
      {branchStrip && <BranchStrip {...branchStrip} />}

      {/* ── Nothing to stage: the pane says what comes next instead of nothing.
          Only the panel supplies this; the desktop keeps its quiet pane. ── */}
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
            <span className="stx-count">{t('panel.filesChanged')}</span>
            <span className="stx-staged-badge">
              {t('panel.stagedOf', changes.staged.length, totalChanged)}
            </span>
            <div className="stx-spring" />
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
                        <button className="st-action" title={t('panel.file.copyPath')}
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(f.path) }}><IcoCopy /></button>
                        <button className="st-action st-open-diff" title={t('panel.openDiff')}
                          onClick={e => { e.stopPropagation(); selectFile({ path: f.path, area: staged ? 'staged' : 'unstaged' }) }}><IcoOpenDiff /></button>
                        {onOpenStagingEditor && <button className="st-action st-hunk-editor" title={t('panel.hunkEditor')} onClick={e => { e.stopPropagation(); onOpenStagingEditor(f.path) }}><IcoHunks /></button>}
                        <button className="st-action st-discard" title={t('panel.discard')} onClick={e => { e.stopPropagation(); discardOne(f.path) }}>↺</button>
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
      {!embedded && (<>
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
      <div className="st2-resize" onMouseDown={onResizeDown}><div className="st2-resize-grip" /></div>

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
          {!isConflict && (
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
              className={`st2-commit-btn ${tiny ? 'st2-commit-btn--mini' : ''} ${compact && !tiny ? 'st2-commit-btn--short' : ''} ${commitReady ? 'ready' : ''}`}
              disabled={!commitReady || committing}
              onClick={doCommit}
              title={compact ? commitLabel : '⌘↵'}
            >
              {tiny ? <IcoCheck /> : <><IcoCommit /> {compact ? t('panel.commit.short') : commitLabel}</>}
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
    if (isConflict && onConflictFinish) {
      const action = (conflictMode === 'rebase' || conflictMode === 'cherry-pick' || conflictMode === 'revert') ? 'rebase' : 'merge'
      onConflictFinish(action, full)
      setMessage('')
    } else {
      const finalMessage = signoff ? `${full}\n\nSigned-off-by: ` : full
      const r = await window.gitAPI.commit(finalMessage, amend)
      if (r.success) {
        showToast(t('toast.commitOk'))
        setMessage(''); setAmend(false); setSelectedDiff(null)
        onProposalConsumed?.()
        await load(); onCommitSuccess()
      } else showToast(t('toast.commitErr', r.error ?? ''), 'err')
    }
    setCommitting(false)
  }
}

// ── Conflict Panel ──────────────────────────────────────────────
function ConflictPanel({
  conflictFiles,
  conflictKinds,
  conflictMode,
  onConflictFinish,
  onConflictAbort,
  onOpenResolver,
  showToast,
  onCommitSuccess
}: {
  conflictFiles: string[]
  conflictKinds: Record<string, ConflictKind>
  conflictMode: string
  onConflictFinish: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort: () => void
  onOpenResolver: (file: string) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  onCommitSuccess: () => void
}) {
  const { t } = useLang()
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [resolvedFiles, setResolvedFiles] = useState<{ path: string }[]>([])

  // Load merge message once on mount — separate from the file list so that
  // resolving the last file (which empties conflictFiles) doesn't overwrite
  // any edits the user made to the message.
  useEffect(() => {
    window.gitAPI.getMergeMessage().then(r => {
      if (r.message) setCommitMsg(r.message)
    })
  }, [])

  useEffect(() => {
    window.gitAPI.getWorkingChanges().then(r => {
      if (r.staged) {
        const actuallyResolved = r.staged.filter(f => !conflictFiles.includes(f.path))
        setResolvedFiles(actuallyResolved)
      }
    })
  }, [conflictFiles])

  // Resolve a file by taking one whole side (writes + stages it), or mark a
  // manually-edited file as resolved (stages it). Editing the file in an editor
  // does NOT clear its unmerged state — it must be staged, which is what gates
  // "Continue". Refresh afterwards so the conflict list updates.
  const takeSide = async (file: string, side: 'ours' | 'theirs') => {
    const r = await (window.gitAPI as any).resolveConflictSide(file, side)
    if (r && r.success === false) showToast(r.error ?? t('rp2.resolveFailed'), 'err')
    else { showToast(`✓ ${file} — ${side === 'ours' ? 'Current' : 'Incoming'}`); onCommitSuccess() }
  }
  const markResolved = async (file: string) => {
    const r = await window.gitAPI.markResolved(file)
    if (r && r.success === false) showToast(r.error ?? t('rp.failed'), 'err')
    else { showToast(t('rp2.markedResolved', file)); onCommitSuccess() }
  }

  async function doCommit() {
    setCommitting(true)
    const action = (conflictMode === 'rebase' || conflictMode === 'cherry-pick' || conflictMode === 'revert') ? 'rebase' : 'merge'
    // If it's a merge, we might need to actually run commit or the continue command
    onConflictFinish(action, commitMsg)
    setCommitting(false)
  }

  const allResolved = conflictFiles.length === 0

  return (
    <div className="rp-content rp-conflict-mode">
      <div className="rp-conflict-header">
        <span className="cr-warning">⚠️</span>
        <span className="cr-title">{t('rp.conflictsInProgress')} <strong>{conflictMode}</strong></span>
      </div>

      <div className="rp-section">
        <div className="rp-section-header">
          <span className="rp-section-title">{t('rp.conflictedFiles')} ({conflictFiles.length})</span>
        </div>
        <div className="rp-file-list">
          {conflictFiles.length === 0 && <div className="rp-empty">{t('rp.allResolved')}</div>}
          {conflictFiles.map(f => {
            const kind = conflictKinds[f]
            const sides = SIDE_HAS_VERSION[kind ?? 'unknown']
            // When one side has no version of the path, taking it deletes the
            // file — resolveConflictWithSide falls back to `git rm`. Saying
            // "Incoming" there described the wrong outcome.
            const contentChoice = sides.ours && sides.theirs
            return (
              <div key={f} className={`rp-file-row rp-file-conflicted${contentChoice ? '' : ' rp-file-conflicted--existence'}`}>
                <span className="rp-file-status" style={{ color: 'var(--attention)' }}>!</span>
                <span className="rp-file-path" style={{ flex: 1, cursor: 'pointer' }}
                  title={t('rp2.openInEditor')} onClick={() => onOpenResolver(f)}>{f}</span>
                {kind && kind !== 'unknown' && (
                  <span className="rp-cf-kind" title={`${t('rp2.conflictKind', kind)} — ${t('rp2.conflictKindTitle')}`}>
                    {t('rp2.conflictKind', kind)}
                  </span>
                )}
                <div className="rp-conflict-actions">
                  <button className="rp-cf-btn" title={t('rp2.keepOurs')}
                    onClick={e => { e.stopPropagation(); takeSide(f, 'ours') }}>
                    {contentChoice ? 'Current' : (sides.ours ? 'Keep' : 'Delete')}
                  </button>
                  <button className="rp-cf-btn" title={t('rp2.keepTheirs')}
                    onClick={e => { e.stopPropagation(); takeSide(f, 'theirs') }}>
                    {contentChoice ? 'Incoming' : (sides.theirs ? 'Keep' : 'Delete')}
                  </button>
                  <button className="rp-cf-btn rp-cf-btn--ok" title={t('rp2.markResolvedTitle')}
                    onClick={e => { e.stopPropagation(); markResolved(f) }}>✓</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="rp-section">
        <div className="rp-section-header">
          <span className="rp-section-title">{t('rp.resolvedFiles')} ({resolvedFiles.length})</span>
        </div>
        <div className="rp-file-list">
          {resolvedFiles.length === 0 && <div className="rp-empty">{t('rp.noResolved')}</div>}
          {resolvedFiles.map(f => (
            <div key={f.path} className="rp-file-row rp-file-resolved">
              <span className="rp-file-status" style={{ color: 'var(--success)' }}>✓</span>
              <span className="rp-file-path">{f.path}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rp-commit-area" style={{ marginTop: 'auto' }}>
        <textarea
          className="rp-commit-input"
          placeholder={t('rp.commitPlaceholder')}
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
        />
        <div className="rp-commit-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            className="rp-btn rp-btn-abort"
            style={{ flex: 1, backgroundColor: 'var(--surface-sunken)', color: 'var(--danger)' }}
            onClick={onConflictAbort}
          >
            {t('rp.abortMode', conflictMode)}
          </button>
          <button
            className="rp-btn rp-btn-commit"
            style={{ flex: 1, backgroundColor: allResolved ? 'var(--success-emphasis)' : 'var(--surface-sunken)', color: allResolved ? 'var(--text-on-emphasis)' : 'var(--text-secondary)' }}
            disabled={!allResolved || !commitMsg.trim() || committing}
            onClick={doCommit}
          >
            {committing ? t('rp.inProgress') : t('rp.commitMode', conflictMode)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Right Panel root ──────────────────────────────────────────
interface RightPanelProps {
  selectedCommit: CommitNode | null
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  onSelectCommit: (hash: string) => void
  currentBranch?: string
  wipCount?: number
  onViewWip?: () => void
  conflictFiles?: string[]
  // path → unmerged state. Absent/empty ⇒ the host does not report it and no
  // kind is shown, rather than every file being labelled "both modified".
  conflictKinds?: Record<string, ConflictKind>
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
  onOpenResolver?: (file: string) => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onOpenStagingEditor?: (file: string) => void
  githubRepo?: IssueRepo | null
  /** Right-click on a file in a commit: link to it on the remote. */
  onOpenFileOnRemote?: (hash: string, filePath: string) => void
  onCopyFileLink?: (hash: string, filePath: string) => void
  /** Put this file back the way it was at this commit. Asks first. */
  onRestoreFile?: (hash: string, filePath: string) => void
  /**
   * Show this file's history — the host decides where a view goes: a tab in the
   * app, an editor tab in the panel. Omitted ⇒ the button disappears rather
   * than opening nothing.
   */
  onOpenFileHistory?: (filePath: string) => void
  /** Apply a message to a commit that is not the tip — see CommitDetail. */
  onRewordMessage?: (hash: string, message: string) => void | Promise<void>
  // Agent-proposed commit (MCP propose_commit): message preloaded into the
  // form + proposed file list shown for one-click staging. Review only —
  // nothing is staged or committed until the user acts.
  commitProposal?: { message: string; files: string[] } | null
  onCommitProposalConsumed?: () => void
  // VS Code panel: use the compact single-list (checkbox) staging layout
  // instead of the desktop's Unstaged/Staged two-section view.
  embedded?: boolean
  // Branch strip above the file list (v1.22.0). Omitted ⇒ no strip, so hosts
  // that cannot supply branch actions are unaffected.
  branchStrip?: BranchStripProps
  /** What the staging pane shows on a clean tree — the panel supplies it. */
  emptyState?: { state: NextStepsState; actions: NextStepsActions }
}

export default function RightPanel({
  selectedCommit, onCommitSuccess, showToast, onSelectCommit, currentBranch, wipCount, onViewWip,
  conflictFiles, conflictKinds, conflictMode, onConflictFinish, onConflictAbort, onOpenResolver, onOpenFileDiff, onOpenStagingEditor, githubRepo,
  onOpenFileOnRemote, onCopyFileLink, onRestoreFile, onOpenFileHistory,
  onRewordMessage, commitProposal, onCommitProposalConsumed, embedded, branchStrip, emptyState
}: RightPanelProps) {
  const isWip = selectedCommit?.hash === '__WIP__'
  const hasCommit = !!selectedCommit && !isWip
  const isConflict = conflictMode !== null && conflictMode !== undefined

  const hasUnresolvedConflicts = isConflict && (conflictFiles?.length ?? 0) > 0
  const allConflictsResolved = isConflict && (conflictFiles?.length ?? 0) === 0

  return (
    <div className="right-panel">
      {hasUnresolvedConflicts ? (
        <ConflictPanel
          conflictFiles={conflictFiles ?? []}
          conflictKinds={conflictKinds ?? {}}
          conflictMode={conflictMode!}
          onConflictFinish={onConflictFinish!}
          onConflictAbort={onConflictAbort!}
          onOpenResolver={onOpenResolver!}
          showToast={showToast}
          onCommitSuccess={onCommitSuccess}
        />
      ) : (isWip || allConflictsResolved) && !hasCommit ? (
        <StagingView
          onCommitSuccess={onCommitSuccess}
          showToast={showToast}
          currentBranch={currentBranch}
          conflictMode={allConflictsResolved ? conflictMode : null}
          conflictFiles={conflictFiles}
          onConflictFinish={onConflictFinish}
          onConflictAbort={onConflictAbort}
          onOpenFileDiff={onOpenFileDiff}
          onOpenStagingEditor={onOpenStagingEditor}
          commitProposal={commitProposal}
          onProposalConsumed={onCommitProposalConsumed}
          embedded={embedded}
          branchStrip={branchStrip}
          emptyState={emptyState}
        />
      ) : hasCommit ? (
        <CommitDetail
          commit={selectedCommit}
          onSelectCommit={onSelectCommit}
          wipCount={wipCount}
          onViewWip={onViewWip}
          onOpenFileDiff={onOpenFileDiff}
          onAmendSuccess={onCommitSuccess}
          githubRepo={githubRepo}
          onOpenFileOnRemote={onOpenFileOnRemote}
          onCopyFileLink={onCopyFileLink}
          onRestoreFile={onRestoreFile}
          onOpenFileHistory={onOpenFileHistory}
          onRewordMessage={onRewordMessage}
          showToast={showToast}
        />
      ) : null}
    </div>
  )
}
