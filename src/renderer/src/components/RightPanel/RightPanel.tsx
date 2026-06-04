import React, { useState, useEffect, useCallback, useRef } from 'react'
import hljs from 'highlight.js'
import { CommitNode, FileChange, WorkingChanges } from '../../types'
import { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import { useLang } from '../../i18n/LanguageContext'
import { aiAvatarDataUri } from '../../utils/aiAvatars'
import './RightPanel.css'

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
  <svg width="12" height="12" viewBox="0 0 16 16" fill="#e3b341" style={{ flexShrink: 0 }}>
    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
  </svg>
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

function TreeFileRow({ node, depth, onAction, actionIcon, actionTitle, onSelect, isSelected }: {
  node: TreeNode; depth: number
  onAction: (paths: string[]) => void
  actionIcon: string; actionTitle: string
  onSelect?: (path: string) => void
  isSelected?: boolean
}) {
  const [open, setOpen] = React.useState(true)
  const indent = depth * 10

  if (node.isFile) {
    const s = node.status ?? 'M'
    return (
      <div
        className={`st-tr st-clickable ${isSelected ? 'st-selected' : ''}`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => onSelect?.(node.fullPath)}
      >
        {s === 'A' ? <span className="st-fsi st-fsi-add">+</span>
          : s === 'D' ? <span className="st-fsi st-fsi-del">−</span>
          : <TreePencil />}
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
            title={`${actionTitle} dossier`}
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
      color: '#fff', fontWeight: 700, fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  )
}
function fmtDate(s: string) {
  try { return new Date(s).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return s }
}
const STATUS_META: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: '#58a6ff' }, A: { label: 'A', color: '#3fb950' },
  D: { label: 'D', color: '#f85149' }, R: { label: 'R', color: '#d2a8ff' },
  '!': { label: '!', color: '#ffa657' }, '?': { label: '?', color: '#8b949e' },
}

// ── File History modal ────────────────────────────────────────
function FileHistoryModal({ filepath, onClose, onSelectCommit }: {
  filepath: string
  onClose: () => void
  onSelectCommit: (hash: string) => void
}) {
  const { t } = useLang()
  const [history, setHistory] = useState<{ hash: string; shortHash: string; message: string; author: string; date: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.gitAPI.getFileHistory(filepath).then(r => {
      setHistory(r.commits ?? [])
      setLoading(false)
    })
  }, [filepath])

  return (
    <div className="fh-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="fh-modal">
        <div className="fh-header">
          <span className="fh-title">{t('panel.fileHistory', filepath.split('/').pop() ?? '')}</span>
          <button className="fh-close" onClick={onClose}>×</button>
        </div>
        <div className="fh-path">{filepath}</div>
        <div className="fh-list">
          {loading && <div className="fh-empty">{t('panel.loading')}</div>}
          {!loading && history.length === 0 && <div className="fh-empty">{t('panel.noHistory')}</div>}
          {history.map(c => (
            <div key={c.hash} className="fh-row" onClick={() => { onSelectCommit(c.hash); onClose() }}>
              <code className="fh-hash">{c.shortHash}</code>
              <div className="fh-info">
                <span className="fh-msg">{c.message}</span>
                <span className="fh-meta">{c.author} · {fmtDate(c.date)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

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

function CommitDetail({ commit, onSelectCommit, wipCount, onViewWip, onOpenFileDiff, onAmendSuccess }: {
  commit: CommitNode
  onSelectCommit: (hash: string) => void
  wipCount?: number
  onViewWip?: () => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  onAmendSuccess?: () => void
}) {
  const { t } = useLang()
  const [files, setFiles] = useState<FileChange[]>([])
  const [body, setBody] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [view, setView] = useState<'files' | 'blame'>('files')
  const [cdTreeMode, setCdTreeMode] = useState(() => localStorage.getItem('cd-tree-mode') === 'true')
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null)
  const [viewAll, setViewAll] = useState(false)
  const [msgHeight, setMsgHeight] = useState(120)
  const [amendEditing, setAmendEditing] = useState(false)
  const [amendMsg, setAmendMsg] = useState('')
  const [amendLoading, setAmendLoading] = useState(false)
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
    Promise.all([
      window.gitAPI.getCommitFiles(commit.hash),
      (window.gitAPI as any).getCommitBody(commit.hash),
    ]).then(([fr, br]: any[]) => {
      setFiles(fr.files ?? [])
      setBody(br.body ?? '')
    })
  }, [commit.hash])

  const parentShort = commit.parents?.[0]?.slice(0, 7) ?? null
  const isHeadCommit = commit.refs.some(r => r.includes('HEAD'))

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
          <span>{wipCount} fichier{wipCount !== 1 ? 's' : ''} modifié{wipCount !== 1 ? 's' : ''} en cours</span>
          <button className="cd-view-change-btn" onClick={onViewWip}>Voir les changements</button>
        </div>
      )}

      {/* ── Hash + AI row ── */}
      <div className="cd-top-row">
        <div className="cd-hash-info">
          <span className="cd-label">commit:</span>
          <code className="cd-hash" onClick={() => navigator.clipboard.writeText(commit.hash)}
            title={t('panel.copyHash')}>{commit.shortHash}</code>
        </div>
        <button className="cd-ai-btn">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z"/></svg>
          <span className="cd-ai-label">Recompose commit with AI</span>
          <span className="cd-ai-sep" />
          <span className="cd-ai-arrow">▼</span>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="cd-scroll">
        {/* Zone 1 — commit message (dark) */}
        <div
          className={`cd-message-block${amendEditing ? ' cd-message-block--editing' : ''}${!amendEditing && isHeadCommit ? ' cd-message-block--amendable' : ''}`}
          style={amendEditing ? undefined : { height: msgHeight, minHeight: MIN_MSG_H, maxHeight: MAX_MSG_H }}
          onClick={!amendEditing && isHeadCommit ? () => {
            const full = commit.message + (body ? '\n\n' + body : '')
            setAmendMsg(full)
            setAmendEditing(true)
          } : undefined}
          title={!amendEditing && isHeadCommit ? t('panel.clickToAmend') : undefined}
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
              <p className="cd-title">{commit.message}</p>
              {cleanBody && <pre className="cd-body">{cleanBody}</pre>}
            </>
          )}
        </div>

        {/* Amend action buttons */}
        {amendEditing && (
          <div className="cd-amend-actions">
            <button
              className="cd-amend-confirm"
              disabled={amendLoading || !amendMsg.trim()}
              onClick={async () => {
                setAmendLoading(true)
                try {
                  await (window.gitAPI as any).amendMessage(amendMsg.trim())
                  setAmendEditing(false)
                  onAmendSuccess?.()
                } catch (err) {
                  console.error('amend failed', err)
                } finally {
                  setAmendLoading(false)
                }
              }}
            >
              {amendLoading ? '…' : t('panel.amendConfirm')}
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
              <span className="cd-author-meta">authored {fmtDate(commit.date)}</span>
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
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="#e3b341" style={{ flexShrink: 0 }}>
                    <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
                  </svg>
                  <span className="cd-count-mod">{nMod} modified</span>
                </>}
                {nAdd > 0 && <span className="cd-count-add">+ {nAdd} added</span>}
                {nDel > 0 && <span className="cd-count-del">− {nDel} deleted</span>}
              </div>
            )
          })()}

          {/* Files bar */}
          <div className="cd-files-bar">
            <button className="cd-sort-btn" title="Trier">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z"/>
              </svg>
            </button>
            <div className="cd-view-toggle">
              <button className={`cd-view-btn ${!cdTreeMode ? 'active' : ''}`} onClick={() => { setView('files'); setCdTreeMode(false); localStorage.setItem('cd-tree-mode', 'false') }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 0 1H3v10h9.5a.5.5 0 0 1 0 1h-10A.5.5 0 0 1 2 13.5v-11Z"/></svg>
                Path
              </button>
              <button className={`cd-view-btn ${cdTreeMode ? 'active' : ''}`} onClick={() => setCdTreeMode(v => { localStorage.setItem('cd-tree-mode', String(!v)); return !v })}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5a.75.75 0 0 0 0 1.5h5.5a.75.75 0 0 0 0-1.5h-5.5zm0 4a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5zm0 4a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5zm9.5-8a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3zm0 4a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3zm0 4a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3z"/></svg>
                Tree
              </button>
            </div>
            <label className="cd-viewall">
              <input type="checkbox" checked={viewAll} onChange={e => setViewAll(e.target.checked)} />
              <span>Tous les fichiers</span>
            </label>
          </div>

          {/* File list */}
          {view === 'files' && (
            <div className="rp-file-list">
              {cdTreeMode
                ? buildTree(files.map(f => ({ path: f.path, status: f.status ?? 'M' }))).map(node => (
                    <TreeFileRow key={node.fullPath} node={node} depth={0}
                      onAction={() => {}}
                      actionIcon=""
                      actionTitle=""
                      onSelect={p => { setSelectedFile(p); onOpenFileDiff?.({ type: 'commit', commitHash: commit.hash, filePath: p }) }}
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
                      >
                        {s === 'A'
                          ? <span className="rp-fsi rp-fsi-add">+</span>
                          : s === 'D'
                          ? <span className="rp-fsi rp-fsi-del">−</span>
                          : s === 'R'
                          ? <span className="rp-fsi rp-fsi-ren">R</span>
                          : <svg width="12" height="12" viewBox="0 0 16 16" fill="#e3b341" className="rp-file-pencil">
                              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
                            </svg>
                        }
                        <span className="rp-file-path">
                          {dir && <span className="rp-file-dir">{dir}</span>}
                          <span className="rp-file-name">{name}</span>
                        </span>
                        <button className="rp-history-btn" title={t('panel.history')}
                          onClick={e => { e.stopPropagation(); setFileHistoryPath(f.path) }}>
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M1.643 3.143L.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684zM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4z"/>
                          </svg>
                        </button>
                      </div>
                    )
                  })
              }
              {files.length === 0 && <div className="rp-empty">{t('panel.loading')}</div>}
            </div>
          )}

          {fileHistoryPath && (
            <FileHistoryModal filepath={fileHistoryPath}
              onClose={() => setFileHistoryPath(null)} onSelectCommit={onSelectCommit} />
          )}

          {view === 'blame' && selectedFile && (
            <BlameView commitHash={commit.hash} filepath={selectedFile} onSelectCommit={onSelectCommit} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Staging view (GitKraken-style commit panel) ───────────────
interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

const SUMMARY_LIMIT = 72

// Inline icons (currentColor)
const IcoTrash = () => (<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15Z"/></svg>)
const IcoSpark = ({ size = 14 }: { size?: number }) => (<svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor"><path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z"/></svg>)
const IcoSort = () => (<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M4.25 2a.75.75 0 0 1 .75.75v8.69l1.22-1.22a.75.75 0 1 1 1.06 1.06l-2.5 2.5a.75.75 0 0 1-1.06 0l-2.5-2.5a.75.75 0 1 1 1.06-1.06l1.22 1.22V2.75A.75.75 0 0 1 4.25 2Zm5 1h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5Zm0 3.5h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1 0-1.5Zm0 3.5h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1 0-1.5Z"/></svg>)
const IcoPathView = () => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75Zm0 4A.75.75 0 0 1 2.75 7h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 7.75Zm0 4a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"/></svg>)
const IcoTreeView = () => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 2.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Zm5 0a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5ZM6 7.75A.75.75 0 0 1 6.75 7h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 6 7.75Zm.75 3.75a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5h-7.5ZM2.5 5.5a.75.75 0 0 0-1.5 0v6.75c0 .414.336.75.75.75H4.5a.75.75 0 0 0 0-1.5H2.5V5.5Z"/></svg>)
const IcoCommit = () => (<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M10.95 7.25a3.001 3.001 0 0 0-5.9 0H1.75a.75.75 0 0 0 0 1.5h3.3a3.001 3.001 0 0 0 5.9 0h3.3a.75.75 0 0 0 0-1.5h-3.3ZM8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/></svg>)
const IcoStash = () => (<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 1A1.75 1.75 0 0 0 1 2.75v7.5C1 11.216 1.784 12 2.75 12h2.5a.75.75 0 0 0 0-1.5h-2.5a.25.25 0 0 1-.25-.25V6h11v.25a.75.75 0 0 0 1.5 0v-3.5A1.75 1.75 0 0 0 13.25 1H2.75Zm10.75 3.5h-11v-1.75a.25.25 0 0 1 .25-.25h10.5a.25.25 0 0 1 .25.25V4.5ZM10 11.25a.75.75 0 0 1 .75-.75h1.69l-.97-.97a.75.75 0 1 1 1.06-1.06l2.25 2.25a.75.75 0 0 1 0 1.06l-2.25 2.25a.75.75 0 1 1-1.06-1.06l.97-.97h-1.69a.75.75 0 0 1-.75-.75Z"/></svg>)
const IcoCloud = () => (<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M4.406 3.342A5.53 5.53 0 0 1 8 2c2.69 0 4.923 2 5.166 4.579C14.758 6.804 16 8.137 16 9.773 16 11.569 14.502 13 12.687 13H3.781C1.708 13 0 11.366 0 9.318c0-1.763 1.266-3.223 2.942-3.593.143-.863.698-1.878 1.464-2.383Zm4.843 5.804a.75.75 0 0 0 1.06-1.06L8.53 5.946a.75.75 0 0 0-1.06 0L5.69 8.086a.75.75 0 1 0 1.06 1.06l.75-.75v3.073a.75.75 0 0 0 1.5 0V8.396l.75.75Z"/></svg>)
const IcoChevron = ({ open }: { open: boolean }) => (<svg className={`st2-chev ${open ? 'open' : ''}`} width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>)

function StagingView({ onCommitSuccess, showToast, currentBranch, conflictMode, conflictFiles, onConflictFinish, onConflictAbort, onOpenFileDiff }: {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  currentBranch?: string
  conflictMode?: string | null
  conflictFiles?: string[]
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
}) {
  const { t } = useLang()
  const isConflict = !!conflictMode
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const [amendFiles, setAmendFiles] = useState<FileChange[]>([])
  const [treeMode, setTreeMode] = useState(() => localStorage.getItem('st-tree-mode') === 'true')
  const [sortAsc, setSortAsc] = useState(true)
  const [unstagedOpen, setUnstagedOpen] = useState(true)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [signoff, setSignoff] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiffFile | null>(null)
  const [formHeight, setFormHeight] = useState(() => parseInt(localStorage.getItem('st-form-h') || '300'))
  const dragRef = useRef<{ y: number; h: number } | null>(null)

  const splitMessage = (full: string) => {
    const lines = full.split('\n')
    setSummary(lines[0] ?? '')
    setDescription(lines.slice(1).join('\n').replace(/^\n+/, ''))
  }

  const toggleAmend = useCallback(async (checked: boolean) => {
    setAmend(checked)
    if (checked) {
      const [msgRes, filesRes] = await Promise.all([
        window.gitAPI.getLastCommitMessage(),
        window.gitAPI.getCommitFiles('HEAD'),
      ])
      const full = msgRes.message ?? ''
      const lines = full.split('\n')
      setSummary(lines[0] ?? '')
      setDescription(lines.slice(1).join('\n').replace(/^\n+/, ''))
      setAmendFiles(filesRes.files ?? [])
    } else {
      setSummary(''); setDescription('')
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
    window.gitAPI.onRepoChanged(handler)
    window.gitAPI.onWorkingChanged(handler)
    return () => {
      window.gitAPI.offRepoChanged(handler)
      window.gitAPI.offWorkingChanged(handler)
    }
  }, [load])

  useEffect(() => {
    if (isConflict) {
      window.gitAPI.getMergeMessage().then(r => { if (r.message) splitMessage(r.message) })
    }
  }, [isConflict])

  const onResizeDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { y: e.clientY, h: formHeight }
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      // dragging up grows the form, down shrinks it
      const next = Math.min(560, Math.max(150, dragRef.current.h - (ev.clientY - dragRef.current.y)))
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
  }, [formHeight])

  const generateMessage = async () => {
    setGenerating(true)
    try {
      const r = await window.gitAPI.aiGenerateCommitMessage()
      if (!r) showToast(t('panel.gen.empty'), 'err')
      else if (r.error === 'NO_API_KEY') showToast(t('panel.gen.noKey'), 'err')
      else if (r.error) showToast(t('panel.gen.failed', r.error ?? ''), 'err')
      else if (r.message) splitMessage(r.message)
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

  const sortFiles = <T extends { path: string }>(arr: T[]) =>
    [...arr].sort((a, b) => sortAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path))

  const totalUnstaged = changes.unstaged.length + changes.untracked.length
  const stagedPaths = new Set(changes.staged.map(f => f.path))
  const amendOnly = amendFiles.filter(f => !stagedPaths.has(f.path))
  const stagedCount = changes.staged.length + amendOnly.length
  const totalChanged = changes.staged.length + totalUnstaged
  const canCommit = changes.staged.length > 0 || amend

  const toggleTree = () => setTreeMode(v => { localStorage.setItem('st-tree-mode', String(!v)); return !v })

  const sortedStaged = sortFiles(changes.staged)
  const sortedUnstaged = sortFiles(changes.unstaged)
  const sortedUntracked = sortFiles(changes.untracked.map(p => ({ path: p }))).map(x => x.path)

  const stagedTree = buildTree(sortedStaged.map(f => ({ path: f.path, status: f.status })))
  const unstagedTree = buildTree([
    ...sortedUnstaged.map(f => ({ path: f.path, status: f.status })),
    ...sortedUntracked.map(f => ({ path: f, status: '?' })),
  ])

  const remaining = SUMMARY_LIMIT - summary.length
  const branchName = currentBranch || 'HEAD'

  // Dynamic commit-button label following the commit flow.
  const commitLabel = (() => {
    if (committing) return t('panel.commit.inProgress')
    if (isConflict) return 'Commit & Merge'
    if (!canCommit) return t('panel.commit.stageFirst')      // nothing staged
    if (!summary.trim()) return t('panel.commit.typeMessage') // staged, no message
    if (amend && changes.staged.length === 0) return t('panel.commit.amend')
    const n = changes.staged.length
    return t('panel.commit.changes', String(n), n !== 1 ? 's' : '')
  })()
  const commitReady = isConflict
    ? (!!summary.trim() && !conflictFiles?.length)
    : (canCommit && !!summary.trim())

  return (
    <div className="rp-content rp-staging st2">
      {/* ── Top bar ── */}
      <div className="st2-topbar">
        <button className="st2-icon-btn st2-danger" title={t('panel.discardAll')} onClick={discardAll} disabled={totalChanged === 0}>
          <IcoTrash />
        </button>
        <div className="st2-topbar-mid">
          <span className="st2-changecount">{totalChanged} {totalChanged === 1 ? t('panel.fileChange') : t('panel.fileChanges')}</span>
          <span className="st2-on">{t('panel.on')}</span>
          <span className="st2-branch-chip" title={branchName}>{branchName}</span>
        </div>
        <button className="st2-icon-btn st2-ai" title={t('panel.generate.tooltip')} onClick={generateMessage} disabled={generating}>
          <IcoSpark />
        </button>
      </div>

      {/* ── Sort + view toggle ── */}
      <div className="st2-viewbar">
        <button className="st2-icon-btn st2-sort" title={t('panel.sort')} onClick={() => setSortAsc(s => !s)}>
          <IcoSort />
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
                : treeMode
                  ? unstagedTree.map(node => (
                      <TreeFileRow key={node.fullPath} node={node} depth={0}
                        onAction={paths => handle(() => window.gitAPI.stage(paths))}
                        actionIcon="+" actionTitle={t('panel.stage.file', node.fullPath)}
                        onSelect={p => selectFile({ path: p, area: 'unstaged' })}
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
                            <span className="st-badge" style={{ color: '#3fb950' }}>{isDir ? '📁' : '?'}</span>
                            <span className="st-path" title={f}>
                              {f}{isDir && <span className="st-dir-hint"> {t('panel.folder')}</span>}
                            </span>
                            <button className="st-action st-stage"
                              title={isDir ? t('panel.stage.folder', f) : t('panel.stage.file', f)}
                              onClick={() => handle(() => window.gitAPI.stage([f]))}>+</button>
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
                : treeMode
                  ? stagedTree.map(node => (
                      <TreeFileRow key={node.fullPath} node={node} depth={0}
                        onAction={paths => handle(() => window.gitAPI.unstage(paths))}
                        actionIcon="−" actionTitle={t('panel.unstaged')}
                        onSelect={p => selectFile({ path: p, area: 'staged' })}
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
                            <button className="st-action st-unstage" title={t('panel.unstaged')} onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.unstage([f.path])) }}>−</button>
                          </div>
                        )
                      })}
                      {amendOnly.map(f => {
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

      {/* ── Resize handle ── */}
      <div className="st2-resize" onMouseDown={onResizeDown}><div className="st2-resize-grip" /></div>

      {/* ── Commit area ── */}
      <div className="st2-commit" style={{ height: formHeight }}>
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

        {/* Amend */}
        {!isConflict && (
          <label className="st2-amend">
            <input type="checkbox" checked={amend} onChange={e => toggleAmend(e.target.checked)} />
            <span>{t('panel.amendPrevious')}</span>
          </label>
        )}

        {/* Message box */}
        <div className="st2-msgbox">
          <div className="st2-summary-row">
            <input
              className="st2-summary"
              placeholder={t('panel.commit.summary')}
              value={summary}
              onChange={e => setSummary(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit() }}
            />
            <span className={`st2-counter ${remaining < 0 ? 'over' : ''}`}>{remaining}</span>
            <button className={`st2-msg-ai ${generating ? 'loading' : ''}`} title={t('panel.generate.tooltip')}
              onClick={generateMessage} disabled={generating}>
              <IcoSpark size={13} />
            </button>
          </div>
          <textarea
            className="st2-description"
            placeholder={t('panel.commit.description')}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit() }}
          />
        </div>

        {/* Options + Compose with AI */}
        <div className="st2-options-row">
          <button className="st2-options-toggle" onClick={() => setOptionsOpen(o => !o)}>
            <IcoChevron open={optionsOpen} /> {t('panel.commitOptions')}
          </button>
          <button className="st2-compose" onClick={generateMessage} disabled={generating}>
            <IcoSpark size={13} /> {t('panel.composeAI')}
          </button>
        </div>
        {optionsOpen && (
          <div className="st2-options">
            <label className="st2-amend">
              <input type="checkbox" checked={signoff} onChange={e => setSignoff(e.target.checked)} />
              <span>{t('panel.signoff')}</span>
            </label>
          </div>
        )}

        </div>{/* end st2-commit-scroll */}

        {/* Dynamic commit button (+ abort in conflict mode) */}
        <div className="st2-commit-actions">
          {isConflict && (
            <button className="st2-commit-btn st2-abort" onClick={onConflictAbort}>{t('panel.abort')}</button>
          )}
          <button
            className={`st2-commit-btn ${commitReady ? 'ready' : ''}`}
            disabled={!commitReady || committing}
            onClick={doCommit}
            title="⌘↵"
          >
            <IcoCommit /> {commitLabel}
          </button>
        </div>
      </div>
    </div>
  )

  async function doCommit() {
    if (!summary.trim()) return
    const full = summary.trim() + (description.trim() ? `\n\n${description.trim()}` : '')
    setCommitting(true)
    if (isConflict && onConflictFinish) {
      const action = (conflictMode === 'rebase' || conflictMode === 'cherry-pick' || conflictMode === 'revert') ? 'rebase' : 'merge'
      onConflictFinish(action, full)
      setSummary(''); setDescription('')
    } else {
      const message = signoff ? `${full}\n\nSigned-off-by: ` : full
      const r = await window.gitAPI.commit(message, amend)
      if (r.success) {
        showToast(t('toast.commitOk'))
        setSummary(''); setDescription(''); setAmend(false); setSelectedDiff(null)
        await load(); onCommitSuccess()
      } else showToast(t('toast.commitErr', r.error ?? ''), 'err')
    }
    setCommitting(false)
  }
}

// ── Conflict Panel ──────────────────────────────────────────────
function ConflictPanel({
  conflictFiles,
  conflictMode,
  onConflictFinish,
  onConflictAbort,
  onOpenResolver,
  showToast,
  onCommitSuccess
}: {
  conflictFiles: string[]
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
        <span className="cr-title">Conflits en cours : <strong>{conflictMode}</strong></span>
      </div>

      <div className="rp-section">
        <div className="rp-section-header">
          <span className="rp-section-title">Fichiers en conflit ({conflictFiles.length})</span>
        </div>
        <div className="rp-file-list">
          {conflictFiles.length === 0 && <div className="rp-empty">Tous les conflits sont résolus</div>}
          {conflictFiles.map(f => (
            <div key={f} className="rp-file-row rp-file-conflicted" onClick={() => onOpenResolver(f)}>
              <span className="rp-file-status" style={{ color: '#ffa657' }}>!</span>
              <span className="rp-file-path">{f}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rp-section">
        <div className="rp-section-header">
          <span className="rp-section-title">Fichiers résolus ({resolvedFiles.length})</span>
        </div>
        <div className="rp-file-list">
          {resolvedFiles.length === 0 && <div className="rp-empty">Aucun fichier résolu</div>}
          {resolvedFiles.map(f => (
            <div key={f.path} className="rp-file-row rp-file-resolved">
              <span className="rp-file-status" style={{ color: '#3fb950' }}>✓</span>
              <span className="rp-file-path">{f.path}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rp-commit-area" style={{ marginTop: 'auto' }}>
        <textarea
          className="rp-commit-input"
          placeholder="Message de commit..."
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
        />
        <div className="rp-commit-actions" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            className="rp-btn rp-btn-abort"
            style={{ flex: 1, backgroundColor: '#21262d', color: '#f85149' }}
            onClick={onConflictAbort}
          >
            Annuler le {conflictMode}
          </button>
          <button
            className="rp-btn rp-btn-commit"
            style={{ flex: 1, backgroundColor: allResolved ? '#2ea043' : '#21262d', color: allResolved ? '#fff' : '#8b949e' }}
            disabled={!allResolved || !commitMsg.trim() || committing}
            onClick={doCommit}
          >
            {committing ? 'En cours…' : 'Commit & Merge'}
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
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
  onOpenResolver?: (file: string) => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
}

export default function RightPanel({
  selectedCommit, onCommitSuccess, showToast, onSelectCommit, currentBranch, wipCount, onViewWip,
  conflictFiles, conflictMode, onConflictFinish, onConflictAbort, onOpenResolver, onOpenFileDiff
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
        />
      ) : hasCommit ? (
        <CommitDetail
          commit={selectedCommit}
          onSelectCommit={onSelectCommit}
          wipCount={wipCount}
          onViewWip={onViewWip}
          onOpenFileDiff={onOpenFileDiff}
          onAmendSuccess={onCommitSuccess}
        />
      ) : null}
    </div>
  )
}
