// What the panel's views share: the diff parser, the file tree, the avatars,
// the date formats. Split out of RightPanel.tsx, which held four components
// and everything they had in common in one 2,300-line file.

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
import BranchStrip, { type BranchStripProps } from './BranchStrip'
import './RightPanel.css'
import WorkingChangesEmpty, { type NextStepsState, type NextStepsActions } from './WorkingChangesEmpty'
import { hasIssueReferences } from '../IssueLink/IssueLink'


// Whether each side actually holds a version of the path. Where one does not,
// choosing that side removes the file (resolveConflictWithSide falls back to
// `git rm -f`), so the button has to say Delete rather than Current/Incoming.
export const SIDE_HAS_VERSION: Record<ConflictKind, { ours: boolean; theirs: boolean }> = {
  'both-modified':   { ours: true,  theirs: true  },
  'both-added':      { ours: true,  theirs: true  },
  'both-deleted':    { ours: false, theirs: false },
  'added-by-us':     { ours: true,  theirs: false },
  'added-by-them':   { ours: false, theirs: true  },
  'deleted-by-us':   { ours: false, theirs: true  },
  'deleted-by-them': { ours: true,  theirs: false },
  'unknown':         { ours: true,  theirs: true  },
}


export function detectLang(filename: string): string | undefined {
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

export function hl(content: string, lang?: string): string {
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
export interface RewordPlan { canReword: boolean; isHead: boolean; rewrites: number; reason?: string }

export interface DiffLine { type: 'add' | 'remove' | 'context'; content: string; oldLine?: number; newLine?: number }
export interface DiffHunk { header: string; lines: DiffLine[] }
export interface FileDiff { from: string; to: string; hunks: DiffHunk[] }

export function parseDiff(raw: string): FileDiff[] {
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
export interface TreeNode {
  name: string
  fullPath: string
  isFile: boolean
  status?: string
  children: TreeNode[]
}

export function buildTree(files: { path: string; status: string }[]): TreeNode[] {
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

export const TreePencil = () => (
  <Icon name="pencil" size={12} />
)

export function treeStats(node: TreeNode): { mod: number; add: number; del: number } {
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
export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  const m = STATUS_META[status ?? 'M'] ?? STATUS_META['?']
  return <span className={`st-badge ${className ?? ''}`} style={{ color: m.color }}>{m.label}</span>
}

export function TreeFileRow({ node, depth, onAction, actionIcon, actionTitle, onSelect, isSelected, onContextMenu }: {
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
export function getAvatarColor(str: string) {
  const colors = ['#00bfff','#ff6b6b','#51cf66','#ffd43b','#cc5de8','#ff922b','#20c997','#f06595']
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}
export function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }

export function GravatarAvatar({ email, name, sha, size = 36, radius = 6 }: {
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
export function fmtDate(s: string, locale: string) {
  try { return new Date(s).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) } catch { return s }
}
/**
 * "il y a 7 heures", the way the author line reads in the reference pane. The
 * full date is the tooltip — it is the one place someone looks for it. Reuses
 * the graph's relative-time keys rather than growing a second set.
 */
// The signed-in identity, by git's own config rather than a forge account: it
// works offline and it is the same identity the commits carry. One fetch per
// webview session — module state, like the issue cache above.
export let selfEmailCache: string | null | undefined
export async function selfEmail(): Promise<string | null> {
  if (selfEmailCache !== undefined) return selfEmailCache ?? null
  try {
    const cfg = await (window.gitAPI as any).gitGetGlobalConfig()
    selfEmailCache = cfg?.userEmail?.trim().toLowerCase() || null
  } catch { selfEmailCache = null }
  return selfEmailCache ?? null
}
/** Test-only: the cache outlives a jsdom render, tests do not. */
export function __resetSelfEmailCache(): void { selfEmailCache = undefined }

export function fmtRelativeDate(s: string, t: (k: any, ...a: any[]) => string): string {
  try {
    const sec = Math.floor((Date.now() - new Date(s).getTime()) / 1000)
    if (!Number.isFinite(sec)) return ''
    if (sec < 60) return t('graph.time.now')
    const min = Math.floor(sec / 60)
    if (min < 60) return t('graph.time.min', min)
    const h = Math.floor(min / 60)
    if (h < 24) return t('graph.time.hours', h)
    const j = Math.floor(h / 24)
    if (j < 30) return t('graph.time.days', j)
    const mo = Math.floor(j / 30)
    if (mo < 12) return t('graph.time.months', mo)
    return t('graph.time.years', Math.floor(mo / 12))
  } catch { return '' }
}
export const STATUS_META: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: 'var(--accent)' }, A: { label: 'A', color: 'var(--success)' },
  D: { label: 'D', color: 'var(--danger)' }, R: { label: 'R', color: 'var(--purple-text)' },
  '!': { label: '!', color: 'var(--attention)' }, '?': { label: '?', color: 'var(--text-secondary)' },
}

// ── File History modal ────────────────────────────────────────

export function DiffStat({ additions, deletions }: { additions?: number; deletions?: number }) {
  if (additions === undefined && deletions === undefined) return null
  return (
    <span className="st-numstat" title={`+${additions ?? 0} / −${deletions ?? 0}`}>
      {!!additions && <span className="st-numstat-add">+{additions}</span>}
      {!!deletions && <span className="st-numstat-del">−{deletions}</span>}
    </span>
  )
}
