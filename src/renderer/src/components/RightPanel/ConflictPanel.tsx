// A merge, rebase, cherry-pick or revert stopped on conflicts.

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
import { SIDE_HAS_VERSION } from './shared'

// ── Conflict Panel ──────────────────────────────────────────────
export function ConflictPanel({
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
