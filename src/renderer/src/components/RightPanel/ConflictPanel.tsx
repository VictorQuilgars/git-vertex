// A merge, rebase, cherry-pick or revert stopped on conflicts.

import React, { useState, useEffect, useRef } from 'react'
import { ConflictKind } from '../../types'
import { useLang } from '../../i18n/LanguageContext'
import { Icon } from '../Icon/Icon'
import type { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import './RightPanel.css'
import { SIDE_HAS_VERSION } from './shared'
import { batchPlan, resolveBatch } from './conflict-batch'

// ── Conflict Panel ──────────────────────────────────────────────
export function ConflictPanel({
  repoPath,
  conflictFiles,
  conflictKinds,
  conflictMode,
  onConflictFinish,
  onConflictAbort,
  onOpenResolver,
  onOpenFileDiff,
  modelResolved = {},
  onModelResolved,
  onModelUndone,
  showToast,
  onCommitSuccess
}: {
  repoPath?: string
  conflictFiles: string[]
  conflictKinds: Record<string, ConflictKind>
  conflictMode: string
  onConflictFinish: (action: 'rebase' | 'merge', message?: string) => void
  onConflictAbort: () => void
  onOpenResolver: (file: string) => void
  onOpenFileDiff?: (target: CenterDiffTarget) => void
  /** Files the model resolved in this operation, with its explanation (#269). */
  modelResolved?: Record<string, string>
  onModelResolved?: (file: string, explanation: string) => void
  onModelUndone?: (file: string) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
  onCommitSuccess: () => void
}) {
  const { t } = useLang()
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [resolvedFiles, setResolvedFiles] = useState<{ path: string }[]>([])

  // "Resolve all with AI" (#269): the run in progress, the reason each file
  // the model could not resolve is still in conflict, and the optional
  // guidance given to every file.
  const [batch, setBatch] = useState<{ total: number; done: number; running: string[]; stopping: boolean } | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const [guidanceOpen, setGuidanceOpen] = useState(false)
  const [guidance, setGuidance] = useState('')
  const stopRef = useRef(false)
  const mountedRef = useRef(true)
  const repoRef = useRef(repoPath)
  repoRef.current = repoPath
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

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

  const plan = batchPlan(conflictFiles, conflictKinds)

  // The same request the resolver makes for one file, over every file whose
  // content conflicts. Each result is written and staged as it lands, so the
  // lists move while the model works; nothing is committed.
  const resolveAll = async () => {
    if (batch || plan.attempt.length === 0) return
    const files = plan.attempt
    const startedIn = repoRef.current
    stopRef.current = false
    setFailures(prev => Object.fromEntries(Object.entries(prev).filter(([f]) => !files.includes(f))))
    setBatch({ total: files.length, done: 0, running: [], stopping: false })
    const instruction = guidance.trim() || undefined
    const { outcomes, missingKey } = await resolveBatch(files, {
      propose: file => window.gitAPI.aiResolveConflict(file, instruction),
      write: (file, content) => window.gitAPI.resolveConflict(file, content),
      // A proposal is never written into another repository than the one it
      // was asked about: switching away stops the run.
      stopped: () => stopRef.current || !mountedRef.current || repoRef.current !== startedIn,
      onStart: file => setBatch(b => b && { ...b, running: [...b.running, file] }),
      onDone: outcome => {
        if (!mountedRef.current) return
        setBatch(b => b && { ...b, done: b.done + 1, running: b.running.filter(f => f !== outcome.file) })
        if (outcome.status === 'resolved') {
          onModelResolved?.(outcome.file, outcome.explanation)
          onCommitSuccess()
        } else if (outcome.status === 'failed') {
          setFailures(prev => ({ ...prev, [outcome.file]: outcome.error }))
        }
      },
    })
    if (!mountedRef.current) return
    setBatch(null)
    const ok = outcomes.filter(o => o.status === 'resolved').length
    if (missingKey) showToast(t('toast.noAiKey'), 'err')
    else if (outcomes.some(o => o.status === 'not-run')) showToast(t('rp2.aiAllStopped', ok))
    else if (ok === files.length) showToast(t('rp2.aiAllDone', ok))
    else if (ok === 0) showToast(t('rp2.aiAllNone'), 'err')
    else showToast(t('rp2.aiAllPartial', ok, files.length), 'err')
  }

  const stopAll = () => {
    stopRef.current = true
    setBatch(b => b && { ...b, stopping: true })
  }

  // Back to the conflict git wrote: the model's version goes, the file comes
  // back to the list above.
  const undoModel = async (file: string) => {
    const r = await window.gitAPI.restoreConflict(file)
    if (r && r.success === false) { showToast(r.error ?? t('rp.failed'), 'err'); return }
    onModelUndone?.(file)
    showToast(t('rp2.aiUndone', file))
    onCommitSuccess()
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
        <div className="rp-section-header rp-cf-section-header">
          <span className="rp-section-title">{t('rp.conflictedFiles')} ({conflictFiles.length})</span>
          {batch ? (
            <span className="rp-cf-ai" role="status">
              <span className="rp-cf-ai-progress">{t('rp2.aiAllProgress', batch.done, batch.total)}</span>
              <button className="rp-cf-btn" onClick={stopAll} disabled={batch.stopping}>
                {batch.stopping ? t('rp2.aiAllStopping') : t('rp2.aiAllStop')}
              </button>
            </span>
          ) : plan.attempt.length > 0 && (
            <span className="rp-cf-ai">
              <button className="rp-cf-ai-btn" title={t('rp2.aiAllTitle')} onClick={resolveAll}>
                <Icon name="ai" size={12} />
                <span>{t('rp2.aiAll')}</span>
              </button>
              <button className={`rp-cf-ai-more${guidanceOpen ? ' rp-cf-ai-more--open' : ''}`}
                title={t('rp2.aiAllGuidanceTitle')} aria-label={t('rp2.aiAllGuidanceTitle')}
                aria-expanded={guidanceOpen} onClick={() => setGuidanceOpen(o => !o)}>
                <Icon name="chevronDown" size={10} />
              </button>
            </span>
          )}
        </div>
        {guidanceOpen && !batch && plan.attempt.length > 0 && (
          <input
            className="rp-cf-ai-guidance"
            value={guidance}
            placeholder={t('rp2.aiAllGuidance')}
            aria-label={t('rp2.aiAllGuidanceTitle')}
            onChange={e => setGuidance(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') resolveAll() }}
          />
        )}
        <div className="rp-file-list">
          {conflictFiles.length === 0 && <div className="rp-empty">{t('rp.allResolved')}</div>}
          {conflictFiles.map(f => {
            const kind = conflictKinds[f]
            const sides = SIDE_HAS_VERSION[kind ?? 'unknown']
            // When one side has no version of the path, taking it deletes the
            // file — resolveConflictWithSide falls back to `git rm`. Saying
            // "Incoming" there described the wrong outcome.
            const contentChoice = sides.ours && sides.theirs
            const busy = !!batch?.running.includes(f)
            const failure = failures[f]
            return (
              <React.Fragment key={f}>
                <div className={`rp-file-row rp-file-conflicted${contentChoice ? '' : ' rp-file-conflicted--existence'}`}>
                  <span className="rp-file-status" style={{ color: 'var(--attention)' }}>!</span>
                  <span className="rp-file-path" style={{ flex: 1, cursor: 'pointer' }}
                    title={t('rp2.openInEditor')} onClick={() => onOpenResolver(f)}>{f}</span>
                  {kind && kind !== 'unknown' && (
                    <span className="rp-cf-kind" title={`${t('rp2.conflictKind', kind)} — ${t('rp2.conflictKindTitle')}`}>
                      {t('rp2.conflictKind', kind)}
                    </span>
                  )}
                  {busy ? (
                    <span className="rp-cf-busy">{t('rp2.aiAllWorking')}</span>
                  ) : (
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
                  )}
                </div>
                {failure && !busy && (
                  <div className="rp-cf-note rp-cf-note--failed" title={failure}>{t('rp2.aiAllFailed', failure)}</div>
                )}
              </React.Fragment>
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
          {resolvedFiles.map(f => {
            const why = modelResolved[f.path]
            const byModel = why !== undefined
            return (
              <React.Fragment key={f.path}>
                <div className={`rp-file-row rp-file-resolved${byModel ? ' rp-file-resolved--model' : ''}`}>
                  <span className="rp-file-status" style={{ color: 'var(--success)' }}>✓</span>
                  <span className="rp-file-path">{f.path}</span>
                  {byModel && (
                    <>
                      <span className="rp-cf-model" title={t('rp2.aiResolvedTitle')}>{t('rp2.aiResolvedBadge')}</span>
                      <div className="rp-conflict-actions">
                        {onOpenFileDiff && (
                          <button className="rp-cf-btn" title={t('rp2.aiReviewTitle')}
                            onClick={() => onOpenFileDiff({ type: 'working', filePath: f.path, area: 'staged' })}>
                            {t('rp2.aiReview')}
                          </button>
                        )}
                        <button className="rp-cf-btn" title={t('rp2.aiUndoTitle')} onClick={() => undoModel(f.path)}>
                          {t('rp2.aiUndo')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {byModel && why && <div className="rp-cf-note" title={why}>{why}</div>}
              </React.Fragment>
            )
          })}
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
            disabled={!allResolved || !commitMsg.trim() || committing || !!batch}
            onClick={doCommit}
          >
            {committing ? t('rp.inProgress') : t('rp.commitMode', conflictMode)}
          </button>
        </div>
      </div>
    </div>
  )
}
