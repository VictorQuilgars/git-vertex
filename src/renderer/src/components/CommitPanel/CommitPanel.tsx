import React, { useState, useEffect, useCallback } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import './CommitPanel.css'

interface WorkingFile {
  path: string
  status: string
}

interface WorkingChanges {
  staged: WorkingFile[]
  unstaged: WorkingFile[]
  untracked: string[]
}

interface CommitPanelProps {
  onCommitSuccess: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  M: { label: 'M', color: '#58a6ff' },
  A: { label: 'A', color: '#3fb950' },
  D: { label: 'D', color: '#f85149' },
  R: { label: 'R', color: '#d2a8ff' },
  '!': { label: '!', color: '#ffa657' },
  '?': { label: '?', color: '#8b949e' },
}

function FileRow({
  file, status, staged, selected, onToggleSelect, onStage, onUnstage, onDiscard
}: {
  file: string
  status: string
  staged: boolean
  selected: boolean
  onToggleSelect: () => void
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
}) {
  const { t } = useLang()
  const meta = STATUS_LABELS[status] ?? STATUS_LABELS['?']
  return (
    <div className={`file-row ${selected ? 'selected' : ''}`} onClick={onToggleSelect}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        onClick={e => e.stopPropagation()}
        className="file-checkbox"
      />
      <span className="file-status-badge" style={{ color: meta.color }}>{meta.label}</span>
      <span className="file-row-path" title={file}>{file}</span>
      <div className="file-row-actions">
        {!staged && onStage && (
          <button className="icon-btn stage-btn" title={t('cp.fileStage')} onClick={e => { e.stopPropagation(); onStage() }}>
            +
          </button>
        )}
        {staged && onUnstage && (
          <button className="icon-btn unstage-btn" title={t('cp.fileUnstage')} onClick={e => { e.stopPropagation(); onUnstage() }}>
            −
          </button>
        )}
        {!staged && onDiscard && (
          <button className="icon-btn discard-btn" title={t('cp.fileDiscard')} onClick={e => { e.stopPropagation(); onDiscard() }}>
            ↺
          </button>
        )}
      </div>
    </div>
  )
}

export default function CommitPanel({ onCommitSuccess, showToast }: CommitPanelProps) {
  const { t } = useLang()
  const [changes, setChanges] = useState<WorkingChanges>({ staged: [], unstaged: [], untracked: [] })
  const [selectedStaged, setSelectedStaged] = useState<Set<string>>(new Set())
  const [selectedUnstaged, setSelectedUnstaged] = useState<Set<string>>(new Set())
  const [commitMessage, setCommitMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const result = await window.gitAPI.getWorkingChanges()
    setChanges(result as WorkingChanges)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleStaged = (path: string) => {
    setSelectedStaged(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const toggleUnstaged = (path: string) => {
    setSelectedUnstaged(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const handleStageFile = async (path: string) => {
    await window.gitAPI.stage([path])
    await load()
  }

  const handleStageSelected = async () => {
    const files = [...selectedUnstaged]
    if (!files.length) return
    await window.gitAPI.stage(files)
    setSelectedUnstaged(new Set())
    await load()
  }

  const handleStageAll = async () => {
    await window.gitAPI.stageAll()
    setSelectedUnstaged(new Set())
    await load()
  }

  const handleUnstageFile = async (path: string) => {
    await window.gitAPI.unstage([path])
    await load()
  }

  const handleUnstageSelected = async () => {
    const files = [...selectedStaged]
    if (!files.length) return
    await window.gitAPI.unstage(files)
    setSelectedStaged(new Set())
    await load()
  }

  const handleUnstageAll = async () => {
    const all = changes.staged.map(f => f.path)
    if (!all.length) return
    await window.gitAPI.unstage(all)
    setSelectedStaged(new Set())
    await load()
  }

  const handleDiscard = async (path: string) => {
    if (!window.confirm(t('cp.discardConfirm', path))) return
    const result = await window.gitAPI.discardFile(path)
    if (result.success) await load()
    else showToast(`Erreur : ${result.error}`, 'err')
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) { showToast('Le message de commit est requis', 'err'); return }
    if (changes.staged.length === 0 && !amend) { showToast(t('cp.noStaged'), 'err'); return }
    setCommitting(true)
    const result = await window.gitAPI.commit(commitMessage.trim(), amend)
    if (result.success) {
      showToast(t('cp.commitOk'))
      setCommitMessage('')
      setAmend(false)
      await load()
      onCommitSuccess()
    } else {
      showToast(t('cp.commitErr', result.error), 'err')
    }
    setCommitting(false)
  }

  const totalUnstaged = changes.unstaged.length + changes.untracked.length
  const canCommit = changes.staged.length > 0 || amend

  return (
    <div className="commit-panel">
      {/* ── Staged files ──────────────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="section-dot staged-dot" />
            {t('cp.stagedLabel')} · <strong>{changes.staged.length}</strong>
          </span>
          <div className="section-actions">
            {selectedStaged.size > 0 && (
              <button className="action-link" onClick={handleUnstageSelected}>
                {t('cp.unstageSelected', selectedStaged.size)}
              </button>
            )}
            {changes.staged.length > 0 && (
              <button className="action-link" onClick={handleUnstageAll}>{t('cp.unstageAll')}</button>
            )}
            <button className="refresh-btn" onClick={load} title={t('cp.refresh')}>
              {loading ? '⟳' : '↺'}
            </button>
          </div>
        </div>
        <div className="file-list">
          {changes.staged.length === 0 ? (
            <div className="empty-hint">{t('cp.noStaged')}</div>
          ) : (
            changes.staged.map(f => (
              <FileRow
                key={f.path}
                file={f.path}
                status={f.status}
                staged={true}
                selected={selectedStaged.has(f.path)}
                onToggleSelect={() => toggleStaged(f.path)}
                onUnstage={() => handleUnstageFile(f.path)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Unstaged / untracked ──────────────────────── */}
      <div className="section">
        <div className="section-header">
          <span className="section-title">
            <span className="section-dot unstaged-dot" />
            {t('cp.unstagedLabel')} · <strong>{totalUnstaged}</strong>
          </span>
          <div className="section-actions">
            {selectedUnstaged.size > 0 && (
              <button className="action-link" onClick={handleStageSelected}>
                {t('cp.stageSelected', selectedUnstaged.size)}
              </button>
            )}
            {totalUnstaged > 0 && (
              <button className="action-link stage-all-btn" onClick={handleStageAll}>{t('cp.stageAll')}</button>
            )}
          </div>
        </div>
        <div className="file-list">
          {totalUnstaged === 0 ? (
            <div className="empty-hint">{t('cp.cleanTree')}</div>
          ) : (
            <>
              {changes.unstaged.map(f => (
                <FileRow
                  key={f.path}
                  file={f.path}
                  status={f.status}
                  staged={false}
                  selected={selectedUnstaged.has(f.path)}
                  onToggleSelect={() => toggleUnstaged(f.path)}
                  onStage={() => handleStageFile(f.path)}
                  onDiscard={() => handleDiscard(f.path)}
                />
              ))}
              {changes.untracked.map(f => (
                <FileRow
                  key={f}
                  file={f}
                  status="?"
                  staged={false}
                  selected={selectedUnstaged.has(f)}
                  onToggleSelect={() => toggleUnstaged(f)}
                  onStage={() => handleStageFile(f)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Commit form ───────────────────────────────── */}
      <div className="commit-form">
        <textarea
          className="commit-message-input"
          placeholder={t('cp.msgPlaceholder')}
          value={commitMessage}
          onChange={e => setCommitMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleCommit()
          }}
          rows={4}
        />
        <div className="commit-form-footer">
          <label className="amend-label">
            <input
              type="checkbox"
              checked={amend}
              onChange={e => setAmend(e.target.checked)}
            />
            <span>{t('cp.amend')}</span>
          </label>
          <button
            className={`commit-btn ${canCommit && commitMessage.trim() ? 'ready' : ''}`}
            onClick={handleCommit}
            disabled={!commitMessage.trim() || committing}
            title={t('cp.createCommitTitle')}
          >
            {committing ? t('cp.committing') : `Commit${canCommit ? ` (${changes.staged.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
