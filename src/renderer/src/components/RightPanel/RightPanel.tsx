import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CommitNode, FileChange, WorkingChanges } from '../../types'
import { useLang } from '../../i18n/LanguageContext'
import './RightPanel.css'

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

// ── Shared helpers ────────────────────────────────────────────
function getAvatarColor(str: string) {
  const colors = ['#00bfff','#ff6b6b','#51cf66','#ffd43b','#cc5de8','#ff922b','#20c997','#f06595']
  let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(h) % colors.length]
}
function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) }
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

function CommitDetail({ commit, onSelectCommit, wipCount, onViewWip }: {
  commit: CommitNode
  onSelectCommit: (hash: string) => void
  wipCount?: number
  onViewWip?: () => void
}) {
  const { t } = useLang()
  const [files, setFiles] = useState<FileChange[]>([])
  const [body, setBody] = useState('')
  const [parsedDiff, setParsedDiff] = useState<FileDiff[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [view, setView] = useState<'files' | 'diff' | 'blame'>('files')
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null)
  const [viewAll, setViewAll] = useState(false)
  const [msgHeight, setMsgHeight] = useState(120)
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
    Promise.all([
      window.gitAPI.getCommitFiles(commit.hash),
      window.gitAPI.getDiff(commit.hash),
      (window.gitAPI as any).getCommitBody(commit.hash),
    ]).then(([fr, dr, br]: any[]) => {
      setFiles(fr.files ?? [])
      setParsedDiff(parseDiff(dr.diff ?? ''))
      setBody(br.body ?? '')
    })
  }, [commit.hash])

  const fileForDiff = parsedDiff.find(f => f.to === selectedFile)
  const parentShort = commit.parents?.[0]?.slice(0, 7) ?? null

  // Parse co-authors from body
  const coAuthors = body
    ? [...body.matchAll(/Co-Authored-By:\s*(.+?)\s*<[^>]+>/gi)].map(m => m[1].trim())
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
        <button className="cd-ai-btn" onClick={async () => {
          // Amend with AI — same as StagingView AI generation
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z"/></svg>
          Recompose avec l'IA
          <span className="cd-ai-arrow">▼</span>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="cd-scroll">
        {/* Zone 1 — commit message (dark) */}
        <div className="cd-message-block" style={{ height: msgHeight, minHeight: MIN_MSG_H, maxHeight: MAX_MSG_H }}>
          <p className="cd-title">{commit.message}</p>
          {cleanBody && <pre className="cd-body">{cleanBody}</pre>}
        </div>

        {/* Resize handle */}
        <div className="cd-resize-handle" onMouseDown={onResizeMouseDown}>
          <div className="cd-resize-grip" />
        </div>

        {/* Zone 2 — commit info (lighter) */}
        <div className="cd-info-zone">
          {/* Author */}
          <div className="cd-author-block">
            <div className="cd-avatar-sq" style={{ background: getAvatarColor(commit.authorEmail) }}>
              {initials(commit.author)}
            </div>
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
                <span key={i} className="cd-coauthor">{a}</span>
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
          <div className="cd-files-count-row">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="#e3b341">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
            </svg>
            <span className="cd-files-count-text">
              {files.length} {files.length !== 1 ? 'modified' : 'modified'}
            </span>
          </div>

          {/* Files bar */}
          <div className="cd-files-bar">
            <button className="cd-sort-btn" title="Trier">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 4.75a.75.75 0 0 1 .75-.75h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 2 4.75ZM2 8a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5A.75.75 0 0 1 2 8Zm0 3.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75Z"/>
              </svg>
            </button>
            <div className="cd-view-toggle">
              <button className={`cd-view-btn ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5A.5.5 0 0 1 2.5 2h11a.5.5 0 0 1 0 1H3v10h9.5a.5.5 0 0 1 0 1h-10A.5.5 0 0 1 2 13.5v-11Z"/></svg>
                Path
              </button>
              <button className={`cd-view-btn`} onClick={() => {}}>
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
              {files.map((f, i) => {
                const { dir, name } = formatPath(f.path)
                return (
                  <div key={i}
                    className={`rp-file-row ${selectedFile === f.path ? 'active' : ''}`}
                    onClick={() => { setSelectedFile(f.path); setView('diff') }}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="#e3b341" className="rp-file-pencil">
                      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z"/>
                    </svg>
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
              })}
              {files.length === 0 && <div className="rp-empty">{t('panel.loading')}</div>}
            </div>
          )}

          {fileHistoryPath && (
            <FileHistoryModal filepath={fileHistoryPath}
              onClose={() => setFileHistoryPath(null)} onSelectCommit={onSelectCommit} />
          )}

          {view === 'diff' && fileForDiff && (
            <div className="rp-diff-view">
              <div className="rp-diff-filename">{selectedFile}</div>
              {fileForDiff.hunks.map((hunk, hi) => (
                <div key={hi} className="rp-hunk">
                  <div className="rp-hunk-header">{hunk.header}</div>
                  <table className="rp-diff-table"><tbody>
                    {hunk.lines.map((line, li) => (
                      <tr key={li} className={`rp-dl rp-dl-${line.type}`}>
                        <td className="rp-ln">{line.type !== 'add' ? line.oldLine : ''}</td>
                        <td className="rp-ln">{line.type !== 'remove' ? line.newLine : ''}</td>
                        <td className="rp-lm">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</td>
                        <td className="rp-lc"><code>{line.content}</code></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              ))}
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

// ── Staging view ──────────────────────────────────────────────
interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

function StagingView({ onCommitSuccess, showToast, conflictMode, conflictFiles, onConflictFinish, onConflictAbort }: {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  conflictMode?: string | null
  conflictFiles?: string[]
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
}) {
  const { t } = useLang()
  const isConflict = !!conflictMode
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [commitMsg, setCommitMsg] = useState('')
  const [amend, setAmend] = useState(false)
  const [amendFiles, setAmendFiles] = useState<FileChange[]>([])

  const toggleAmend = useCallback(async (checked: boolean) => {
    setAmend(checked)
    if (checked) {
      const [msgRes, filesRes] = await Promise.all([
        window.gitAPI.getLastCommitMessage(),
        window.gitAPI.getCommitFiles('HEAD'),
      ])
      setCommitMsg(msgRes.message ?? '')
      setAmendFiles(filesRes.files ?? [])
    } else {
      setCommitMsg('')
      setAmendFiles([])
    }
  }, [])
  const [committing, setCommitting] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiffFile | null>(null)
  const [diffRaw, setDiffRaw] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)

  const load = useCallback(async () => {
    const r = await window.gitAPI.getWorkingChanges()
    setChanges(r as WorkingChanges)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isConflict) {
      window.gitAPI.getMergeMessage().then(r => { if (r.message) setCommitMsg(r.message) })
    }
  }, [isConflict])

  const generateMessage = async () => {
    setGenerating(true)
    try {
      const r = await window.gitAPI.aiGenerateCommitMessage()
      if (!r) {
        showToast(t('panel.gen.empty'), 'err')
      } else if (r.error === 'NO_API_KEY') {
        showToast(t('panel.gen.noKey'), 'err')
      } else if (r.error) {
        showToast(t('panel.gen.failed', r.error ?? ''), 'err')
      } else if (r.message) {
        setCommitMsg(r.message)
      } else {
        showToast(t('panel.gen.empty'), 'err')
      }
    } catch (e: any) {
      showToast(t('panel.gen.unexpected', e?.message ?? e), 'err')
    } finally {
      setGenerating(false)
    }
  }

  const handle = async (fn: () => Promise<any>, reload = true) => {
    await fn()
    if (reload) {
      await load()
      // Refresh diff if selected file is still around
      if (selectedDiff) fetchDiff(selectedDiff)
    }
  }

  const fetchDiff = useCallback(async (file: SelectedDiffFile) => {
    setDiffLoading(true)
    const r = await window.gitAPI.getWorkingFileDiff(file.path, file.area === 'staged')
    setDiffRaw(r.diff ?? '')
    setDiffLoading(false)
  }, [])

  const selectFile = (file: SelectedDiffFile) => {
    setSelectedDiff(file)
    fetchDiff(file)
  }

  const totalUnstaged = changes.unstaged.length + changes.untracked.length
  const stagedPaths = new Set(changes.staged.map(f => f.path))
  const amendOnly = amendFiles.filter(f => !stagedPaths.has(f.path))
  const canCommit = changes.staged.length > 0 || amend
  const parsedDiff = parseDiff(diffRaw)

  return (
    <div className="rp-content rp-staging">
      {/* Staged */}
      <div className="st-section">
        <div className="st-header">
          <span className="st-dot" style={{ background: '#3fb950' }} />
          <span>{t('panel.staged')} <strong>{changes.staged.length + amendOnly.length}</strong></span>
          <div style={{ flex: 1 }} />
          {changes.staged.length > 0 && (
            <button className="st-link" onClick={() => handle(() => window.gitAPI.unstage(changes.staged.map(f => f.path)))}>
              {t('panel.unstageAll')}
            </button>
          )}
          <button className="st-refresh" onClick={load} title={t('panel.refresh')}>↺</button>
        </div>
        <div className="st-file-list">
          {changes.staged.length === 0 && amendOnly.length === 0
            ? <div className="st-empty">{t('panel.noStaged')}</div>
            : <>
              {changes.staged.map(f => {
                const meta = STATUS_META[f.status] ?? STATUS_META['?']
                const isSelected = selectedDiff?.path === f.path && selectedDiff.area === 'staged'
                return (
                  <div
                    key={f.path}
                    className={`st-file-row st-clickable ${isSelected ? 'st-selected' : ''}`}
                    onClick={() => selectFile({ path: f.path, area: 'staged' })}
                  >
                    <span className="st-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="st-path">{f.path}</span>
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
      </div>

      {/* Unstaged */}
      <div className="st-section">
        <div className="st-header">
          <span className="st-dot" style={{ background: '#ffa657' }} />
          <span>{t('panel.unstaged')} <strong>{totalUnstaged}</strong></span>
          <div style={{ flex: 1 }} />
          {totalUnstaged > 0 && (
            <button className="st-link st-green" onClick={() => handle(() => window.gitAPI.stageAll())}>
              {t('panel.stageAll')}
            </button>
          )}
        </div>
        <div className="st-file-list">
          {totalUnstaged === 0
            ? <div className="st-empty">{t('panel.noChanges')}</div>
            : <>
              {changes.unstaged.map(f => {
                const meta = STATUS_META[f.status] ?? STATUS_META['?']
                const isSelected = selectedDiff?.path === f.path && selectedDiff.area === 'unstaged'
                return (
                  <div
                    key={f.path}
                    className={`st-file-row st-clickable ${isSelected ? 'st-selected' : ''}`}
                    onClick={() => selectFile({ path: f.path, area: 'unstaged' })}
                  >
                    <span className="st-badge" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="st-path" title={f.path}>{f.path}</span>
                    <button className="st-action st-stage" title={t('panel.discard')} onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.stage([f.path])) }}>+</button>
                    <button className="st-action st-discard" title={t('panel.discard')} onClick={async e => {
                      e.stopPropagation()
                      if (!window.confirm(t('panel.discard.confirm', f.path))) return
                      handle(() => window.gitAPI.discardFile(f.path))
                    }}>↺</button>
                  </div>
                )
              })}
              {changes.untracked.map(f => {
                const isDir = f.endsWith('/')
                return (
                  <div key={f} className="st-file-row">
                    <span className="st-badge" style={{ color: '#3fb950' }}>{isDir ? '📁' : '?'}</span>
                    <span className="st-path" title={f}>
                      {f}
                      {isDir && <span className="st-dir-hint"> {t('panel.folder')}</span>}
                    </span>
                    <button
                      className="st-action st-stage"
                      title={isDir ? t('panel.stage.folder', f) : t('panel.stage.file', f)}
                      onClick={() => handle(() => window.gitAPI.stage([f]))}
                    >+</button>
                  </div>
                )
              })}
            </>
          }
        </div>
      </div>

      {/* Diff panel */}
      {selectedDiff && (
        <div className="st-diff-panel">
          <div className="st-diff-header">
            <span className={`st-diff-area-badge ${selectedDiff.area === 'staged' ? 'st-diff-staged' : 'st-diff-unstaged'}`}>
              {selectedDiff.area === 'staged' ? t('panel.staged') : t('panel.unstaged')}
            </span>
            <span className="st-diff-filename">{selectedDiff.path}</span>
            <button className="st-diff-close" title={t('panel.close')} onClick={() => setSelectedDiff(null)}>✕</button>
          </div>
          <div className="st-diff-body">
            {diffLoading && <div className="st-diff-loading">{t('panel.loading')}</div>}
            {!diffLoading && parsedDiff.length === 0 && <div className="st-diff-loading">{t('panel.noDiff')}</div>}
            {!diffLoading && parsedDiff.map((file, fi) =>
              file.hunks.map((hunk, hi) => (
                <div key={`${fi}-${hi}`}>
                  <div className="rp-hunk-header">{hunk.header}</div>
                  <table className="rp-diff-table"><tbody>
                    {hunk.lines.map((line, li) => (
                      <tr key={li} className={`rp-dl rp-dl-${line.type}`}>
                        <td className="rp-ln">{line.type !== 'add' ? line.oldLine : ''}</td>
                        <td className="rp-ln">{line.type !== 'remove' ? line.newLine : ''}</td>
                        <td className="rp-lm">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</td>
                        <td className="rp-lc"><code>{line.content}</code></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Commit form */}
      <div className="st-form">
        <div className="st-textarea-wrap">
          <textarea
            className="st-textarea"
            placeholder={t('panel.commitMsg.placeholder')}
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit() }}
            rows={3}
          />
          <button
            className={`st-ai-btn ${generating ? 'st-ai-loading' : ''}`}
            title={t('panel.generate.tooltip')}
            onClick={generateMessage}
            disabled={generating}
          >
            {generating ? '…' : '✨'}
          </button>
        </div>
        <div className="st-form-footer">
          {isConflict ? (
            <>
              <button
                className="st-commit-btn"
                style={{ background: '#21262d', color: '#f85149', borderColor: '#f85149', flex: '0 0 auto' }}
                onClick={onConflictAbort}
              >
                Annuler
              </button>
              <button
                className={`st-commit-btn ${commitMsg.trim() && !conflictFiles?.length ? 'ready' : ''}`}
                disabled={!!conflictFiles?.length || !commitMsg.trim() || committing}
                onClick={doCommit}
                title="⌘↵"
              >
                {committing ? 'En cours…' : 'Commit & Merge'}
              </button>
            </>
          ) : (
            <>
              <label className="st-amend">
                <input type="checkbox" checked={amend} onChange={e => toggleAmend(e.target.checked)} />
                Amend
              </label>
              <button
                className={`st-commit-btn ${canCommit && commitMsg.trim() ? 'ready' : ''}`}
                disabled={!commitMsg.trim() || committing}
                onClick={doCommit}
                title="⌘↵"
              >
                {committing ? 'En cours…' : `Commit${changes.staged.length > 0 ? ` (${changes.staged.length})` : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )

  async function doCommit() {
    if (!commitMsg.trim()) return
    setCommitting(true)
    if (isConflict && onConflictFinish) {
      const action = (conflictMode === 'rebase' || conflictMode === 'cherry-pick' || conflictMode === 'revert') ? 'rebase' : 'merge'
      onConflictFinish(action, commitMsg)
    } else {
      const r = await window.gitAPI.commit(commitMsg.trim(), amend)
      if (r.success) { showToast(t('toast.commitOk')); setCommitMsg(''); setAmend(false); setSelectedDiff(null); await load(); onCommitSuccess() }
      else showToast(t('toast.commitErr', r.error ?? ''), 'err')
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
  wipCount?: number
  onViewWip?: () => void
  conflictFiles?: string[]
  conflictMode?: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onConflictFinish?: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort?: () => void
  onOpenResolver?: (file: string) => void
}

export default function RightPanel({
  selectedCommit, onCommitSuccess, showToast, onSelectCommit, wipCount, onViewWip,
  conflictFiles, conflictMode, onConflictFinish, onConflictAbort, onOpenResolver
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
      ) : (isWip || !selectedCommit || allConflictsResolved) && !hasCommit ? (
        <StagingView
          onCommitSuccess={onCommitSuccess}
          showToast={showToast}
          conflictMode={allConflictsResolved ? conflictMode : null}
          conflictFiles={conflictFiles}
          onConflictFinish={onConflictFinish}
          onConflictAbort={onConflictAbort}
        />
      ) : hasCommit ? (
        <CommitDetail
          commit={selectedCommit}
          onSelectCommit={onSelectCommit}
          wipCount={wipCount}
          onViewWip={onViewWip}
        />
      ) : null}
    </div>
  )
}
