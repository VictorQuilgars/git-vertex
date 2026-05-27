import React, { useState, useEffect, useCallback } from 'react'
import { CommitNode, FileChange, WorkingChanges } from '../../types'
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
          <span className="fh-title">Historique — {filepath.split('/').pop()}</span>
          <button className="fh-close" onClick={onClose}>×</button>
        </div>
        <div className="fh-path">{filepath}</div>
        <div className="fh-list">
          {loading && <div className="fh-empty">Chargement…</div>}
          {!loading && history.length === 0 && <div className="fh-empty">Aucun commit trouvé</div>}
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
  const [lines, setLines] = useState<BlameLine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.gitAPI.getBlame(commitHash, filepath).then(r => {
      setLines(r.lines ?? [])
      setLoading(false)
    })
  }, [commitHash, filepath])

  if (loading) return <div className="rp-blame-loading">Chargement du blame…</div>
  if (!lines.length) return <div className="rp-blame-loading">Aucune donnée de blame</div>

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
function CommitDetail({ commit, onSelectCommit }: { commit: CommitNode; onSelectCommit: (hash: string) => void }) {
  const [files, setFiles] = useState<FileChange[]>([])
  const [diff, setDiff] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [parsedDiff, setParsedDiff] = useState<FileDiff[]>([])
  const [view, setView] = useState<'files' | 'diff' | 'blame'>('files')
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null)

  useEffect(() => {
    setFiles([]); setDiff(''); setSelectedFile(null); setView('files')
    Promise.all([
      window.gitAPI.getCommitFiles(commit.hash),
      window.gitAPI.getDiff(commit.hash)
    ]).then(([fr, dr]) => {
      setFiles(fr.files ?? [])
      const d = dr.diff ?? ''
      setDiff(d)
      setParsedDiff(parseDiff(d))
    })
  }, [commit.hash])

  const selectFile = (path: string) => {
    setSelectedFile(path)
    if (view === 'files') setView('diff')
  }

  const fileForDiff = parsedDiff.find(f => f.to === selectedFile)

  return (
    <div className="rp-content">
      {/* Commit info */}
      <div className="rp-commit-info">
        <div className="rp-commit-hash">
          <code>{commit.shortHash}</code>
          <button className="rp-copy" title="Copier le hash" onClick={() => navigator.clipboard.writeText(commit.hash)}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5z"/></svg>
          </button>
        </div>
        <div className="rp-commit-msg">{commit.message}</div>
        <div className="rp-commit-author">
          <div className="rp-avatar" style={{ background: getAvatarColor(commit.authorEmail) }}>
            {initials(commit.author)}
          </div>
          <div className="rp-author-info">
            <span className="rp-author-name">{commit.author}</span>
            <span className="rp-author-date">{fmtDate(commit.date)}</span>
          </div>
        </div>
        {commit.refs.length > 0 && (
          <div className="rp-refs">
            {commit.refs.map((r, i) => {
              const isHead = r.includes('HEAD')
              const isTag = r.startsWith('tag:')
              const isRemote = r.includes('origin/') || r.includes('remotes/')
              const text = r.replace('tag: ', '').replace('HEAD -> ', '★ ')
              const cls = isHead ? 'rp-ref-head' : isTag ? 'rp-ref-tag' : isRemote ? 'rp-ref-remote' : 'rp-ref-local'
              return <span key={i} className={`rp-ref ${cls}`}>{text}</span>
            })}
          </div>
        )}
      </div>

      {/* Files / diff / blame toggle */}
      <div className="rp-tabs">
        <button className={`rp-tab ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}>
          {files.length} fichier{files.length !== 1 ? 's' : ''}
        </button>
        {selectedFile && (
          <button className={`rp-tab ${view === 'diff' ? 'active' : ''}`} onClick={() => setView('diff')}>
            Diff
          </button>
        )}
        {selectedFile && (
          <button className={`rp-tab ${view === 'blame' ? 'active' : ''}`} onClick={() => setView('blame')}>
            Blame
          </button>
        )}
      </div>

      {view === 'files' && (
        <div className="rp-file-list">
          {files.map((f, i) => {
            const meta = STATUS_META[f.status] ?? STATUS_META['?']
            return (
              <div
                key={i}
                className={`rp-file-row ${selectedFile === f.path ? 'active' : ''}`}
                onClick={() => selectFile(f.path)}
              >
                <span className="rp-file-badge" style={{ color: meta.color }}>{meta.label}</span>
                <span className="rp-file-path">{f.path}</span>
                <span className="rp-file-stats">
                  {f.additions > 0 && <span className="rp-add">+{f.additions}</span>}
                  {f.deletions > 0 && <span className="rp-del">-{f.deletions}</span>}
                </span>
                <button
                  className="rp-history-btn"
                  title="Historique de ce fichier"
                  onClick={e => { e.stopPropagation(); setFileHistoryPath(f.path) }}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.643 3.143L.427 1.927A.25.25 0 0 0 0 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 0 0 .177-.427L2.715 4.215a6.5 6.5 0 1 1-1.18 4.458.75.75 0 1 0-1.493.154 8.001 8.001 0 1 0 1.6-5.684zM7.75 4a.75.75 0 0 1 .75.75v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.75.75 0 0 1 7 8.25v-3.5A.75.75 0 0 1 7.75 4z"/>
                  </svg>
                </button>
              </div>
            )
          })}
          {files.length === 0 && <div className="rp-empty">Aucun fichier modifié</div>}
        </div>
      )}

      {fileHistoryPath && (
        <FileHistoryModal
          filepath={fileHistoryPath}
          onClose={() => setFileHistoryPath(null)}
          onSelectCommit={onSelectCommit}
        />
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
        <BlameView
          commitHash={commit.hash}
          filepath={selectedFile}
          onSelectCommit={onSelectCommit}
        />
      )}
    </div>
  )
}

// ── Staging view ──────────────────────────────────────────────
interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

function StagingView({ onCommitSuccess, showToast }: {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}) {
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [commitMsg, setCommitMsg] = useState('')
  const [amend, setAmend] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [selectedDiff, setSelectedDiff] = useState<SelectedDiffFile | null>(null)
  const [diffRaw, setDiffRaw] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)

  const load = useCallback(async () => {
    const r = await window.gitAPI.getWorkingChanges()
    setChanges(r as WorkingChanges)
  }, [])

  useEffect(() => { load() }, [load])

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
  const canCommit = changes.staged.length > 0 || amend
  const parsedDiff = parseDiff(diffRaw)

  return (
    <div className="rp-content rp-staging">
      {/* Staged */}
      <div className="st-section">
        <div className="st-header">
          <span className="st-dot" style={{ background: '#3fb950' }} />
          <span>Indexé <strong>{changes.staged.length}</strong></span>
          <div style={{ flex: 1 }} />
          {changes.staged.length > 0 && (
            <button className="st-link" onClick={() => handle(() => window.gitAPI.unstage(changes.staged.map(f => f.path)))}>
              Tout désindexer
            </button>
          )}
          <button className="st-refresh" onClick={load} title="Rafraîchir">↺</button>
        </div>
        <div className="st-file-list">
          {changes.staged.length === 0
            ? <div className="st-empty">Aucun fichier indexé</div>
            : changes.staged.map(f => {
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
                  <button className="st-action st-unstage" title="Désindexer" onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.unstage([f.path])) }}>−</button>
                </div>
              )
            })
          }
        </div>
      </div>

      {/* Unstaged */}
      <div className="st-section">
        <div className="st-header">
          <span className="st-dot" style={{ background: '#ffa657' }} />
          <span>Non indexé <strong>{totalUnstaged}</strong></span>
          <div style={{ flex: 1 }} />
          {totalUnstaged > 0 && (
            <button className="st-link st-green" onClick={() => handle(() => window.gitAPI.stageAll())}>
              Tout indexer
            </button>
          )}
        </div>
        <div className="st-file-list">
          {totalUnstaged === 0
            ? <div className="st-empty">Répertoire propre ✓</div>
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
                    <button className="st-action st-stage" title="Indexer ce fichier" onClick={e => { e.stopPropagation(); handle(() => window.gitAPI.stage([f.path])) }}>+</button>
                    <button className="st-action st-discard" title="Annuler les modifications" onClick={async e => {
                      e.stopPropagation()
                      if (!window.confirm(`Annuler les modifications de "${f.path}" ?\nCette action est irréversible.`)) return
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
                      {isDir && <span className="st-dir-hint"> (dossier)</span>}
                    </span>
                    <button
                      className="st-action st-stage"
                      title={isDir ? `Indexer tout le dossier "${f}"` : `Indexer "${f}"`}
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
              {selectedDiff.area === 'staged' ? 'Indexé' : 'Non indexé'}
            </span>
            <span className="st-diff-filename">{selectedDiff.path}</span>
            <button className="st-diff-close" title="Fermer" onClick={() => setSelectedDiff(null)}>✕</button>
          </div>
          <div className="st-diff-body">
            {diffLoading && <div className="st-diff-loading">Chargement…</div>}
            {!diffLoading && parsedDiff.length === 0 && <div className="st-diff-loading">Aucun diff</div>}
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
        <textarea
          className="st-textarea"
          placeholder="Message de commit…&#10;&#10;Description optionnelle"
          value={commitMsg}
          onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) doCommit() }}
          rows={3}
        />
        <div className="st-form-footer">
          <label className="st-amend">
            <input type="checkbox" checked={amend} onChange={e => setAmend(e.target.checked)} />
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
        </div>
      </div>
    </div>
  )

  async function doCommit() {
    if (!commitMsg.trim()) return
    setCommitting(true)
    const r = await window.gitAPI.commit(commitMsg.trim(), amend)
    if (r.success) { showToast('Commit créé ✓'); setCommitMsg(''); setAmend(false); setSelectedDiff(null); await load(); onCommitSuccess() }
    else showToast(`Erreur : ${r.error}`, 'err')
    setCommitting(false)
  }
}

// ── Right Panel root ──────────────────────────────────────────
interface RightPanelProps {
  selectedCommit: CommitNode | null
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  onSelectCommit: (hash: string) => void
}

export default function RightPanel({ selectedCommit, onCommitSuccess, showToast, onSelectCommit }: RightPanelProps) {
  const [mode, setMode] = useState<'detail' | 'stage'>('stage')

  return (
    <div className="right-panel">
      {/* Header */}
      <div className="rp-header">
        <button
          className={`rp-mode-btn ${mode === 'detail' ? 'active' : ''}`}
          onClick={() => setMode('detail')}
          disabled={!selectedCommit}
          title="Détails du commit"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z"/>
          </svg>
          Détails
        </button>
        <button
          className={`rp-mode-btn ${mode === 'stage' ? 'active' : ''}`}
          onClick={() => setMode('stage')}
          title="Indexer et commiter"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z"/>
          </svg>
          Commit
        </button>
      </div>

      {mode === 'detail' && !selectedCommit && (
        <div className="rp-placeholder">
          <svg width="40" height="40" viewBox="0 0 16 16" fill="#30363d">
            <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
          </svg>
          <p>Cliquez sur un commit</p>
        </div>
      )}

      {mode === 'detail' && selectedCommit && (
        <CommitDetail commit={selectedCommit} onSelectCommit={onSelectCommit} />
      )}

      {mode === 'stage' && (
        <StagingView onCommitSuccess={onCommitSuccess} showToast={showToast} />
      )}
    </div>
  )
}
