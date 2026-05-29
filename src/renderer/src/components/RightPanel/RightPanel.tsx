import React, { useState, useEffect, useCallback } from 'react'
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
function CommitDetail({ commit, onSelectCommit }: { commit: CommitNode; onSelectCommit: (hash: string) => void }) {
  const { t } = useLang()
  const [files, setFiles] = useState<FileChange[]>([])
  const [body, setBody] = useState('')
  const [parsedDiff, setParsedDiff] = useState<FileDiff[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [view, setView] = useState<'files' | 'diff' | 'blame'>('files')
  const [fileHistoryPath, setFileHistoryPath] = useState<string | null>(null)

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

  return (
    <div className="rp-content">
      {/* ── Commit header ── */}
      <div className="cd-header">
        <div className="cd-hash-row">
          <span className="cd-label">commit:</span>
          <code className="cd-hash" onClick={() => navigator.clipboard.writeText(commit.hash)}
            title={t('panel.copyHash')}>{commit.shortHash}</code>
          {parentShort && <><span className="cd-label" style={{ marginLeft: 12 }}>parent:</span>
            <code className="cd-hash cd-hash-parent"
              onClick={() => onSelectCommit(commit.parents[0])}>{parentShort}</code>
          </>}
        </div>
      </div>

      {/* ── Commit message + body ── */}
      <div className="cd-message-block">
        <p className="cd-title">{commit.message}</p>
        {body && (
          <pre className="cd-body">{body}</pre>
        )}
      </div>

      {/* ── Author ── */}
      <div className="cd-author-block">
        <div className="cd-avatar-lg" style={{ background: getAvatarColor(commit.authorEmail) }}>
          {initials(commit.author)}
        </div>
        <div className="cd-author-info">
          <span className="cd-author-name">{commit.author}</span>
          <span className="cd-author-meta">authored {fmtDate(commit.date)}</span>
        </div>
      </div>

      {/* ── Refs ── */}
      {commit.refs.length > 0 && (
        <div className="cd-refs">
          {commit.refs
            .filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
            .map((r, i) => {
              const isHead = r.includes('HEAD')
              const isTag = r.startsWith('tag:')
              const isRemote = r.includes('origin/') || r.includes('remotes/')
              const text = r.replace('tag: ', '').replace('HEAD -> ', '★ ')
              const cls = isHead ? 'rp-ref-head' : isTag ? 'rp-ref-tag' : isRemote ? 'rp-ref-remote' : 'rp-ref-local'
              return <span key={i} className={`rp-ref ${cls}`}>{text}</span>
            })}
        </div>
      )}

      {/* ── Files section ── */}
      <div className="cd-files-bar">
        <span className="cd-files-count">
          {files.length} {files.length !== 1 ? 'fichiers modifiés' : 'fichier modifié'}
        </span>
        <div className="cd-files-tabs">
          <button className={`cd-files-tab ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}>Path</button>
          {selectedFile && <button className={`cd-files-tab ${view === 'diff' ? 'active' : ''}`} onClick={() => setView('diff')}>Diff</button>}
          {selectedFile && <button className={`cd-files-tab ${view === 'blame' ? 'active' : ''}`} onClick={() => setView('blame')}>Blame</button>}
        </div>
      </div>

      {view === 'files' && (
        <div className="rp-file-list">
          {files.map((f, i) => {
            const meta = STATUS_META[f.status] ?? STATUS_META['?']
            const parts = f.path.split('/')
            const fileName = parts.pop() ?? f.path
            const dir = parts.join('/')
            return (
              <div key={i}
                className={`rp-file-row ${selectedFile === f.path ? 'active' : ''}`}
                onClick={() => { setSelectedFile(f.path); setView('diff') }}
              >
                <span className="rp-file-badge" style={{ color: meta.color }}>{meta.label}</span>
                <span className="rp-file-path">
                  {dir && <span className="rp-file-dir">{dir}/</span>}
                  <span className="rp-file-name">{fileName}</span>
                </span>
                <span className="rp-file-stats">
                  {f.additions > 0 && <span className="rp-add">+{f.additions}</span>}
                  {f.deletions > 0 && <span className="rp-del">-{f.deletions}</span>}
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
  )
}

// ── Staging view ──────────────────────────────────────────────
interface SelectedDiffFile { path: string; area: 'staged' | 'unstaged' }

function StagingView({ onCommitSuccess, showToast }: {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { t } = useLang()
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
        </div>
      </div>
    </div>
  )

  async function doCommit() {
    if (!commitMsg.trim()) return
    setCommitting(true)
    const r = await window.gitAPI.commit(commitMsg.trim(), amend)
    if (r.success) { showToast(t('toast.commitOk')); setCommitMsg(''); setAmend(false); setSelectedDiff(null); await load(); onCommitSuccess() }
    else showToast(t('toast.commitErr', r.error ?? ''), 'err')
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
  const isWip = selectedCommit?.hash === '__WIP__'
  const hasCommit = !!selectedCommit && !isWip

  return (
    <div className="right-panel">
      {/* WIP or no commit → staging view */}
      {(isWip || !selectedCommit) && (
        <StagingView onCommitSuccess={onCommitSuccess} showToast={showToast} />
      )}
      {/* Real commit → detail view */}
      {hasCommit && (
        <CommitDetail commit={selectedCommit} onSelectCommit={onSelectCommit} />
      )}
    </div>
  )
}
