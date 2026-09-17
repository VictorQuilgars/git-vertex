// A selected commit: its message, files, blame, and what the model says of it.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from '../Icon/Icon'
import { CommitNode, FileChange } from '../../types'
import { CenterDiffTarget } from '../CenterFileDiff/CenterFileDiff'
import { useLang } from '../../i18n/LanguageContext'
import { linkifyIssues, IssueRepo } from '../IssueLink/IssueLink'
import { parseAutolinks } from '../../utils/autolinks'
import { useSettings } from '../../contexts/SettingsContext'
import ContextMenu, { MenuItemDef } from '../ContextMenu/ContextMenu'
import './RightPanel.css'
import { hasIssueReferences } from '../IssueLink/IssueLink'
import { GravatarAvatar, StatusBadge, TreeFileRow, buildTree, fmtDate, fmtRelativeDate, selfEmail, type RewordPlan, DiffStat } from './shared'

// ── Blame view ────────────────────────────────────────────────
export interface BlameLine {
  shortHash: string; hash: string; author: string; date: string; lineNum: number; content: string
}

export function hashToColor(hash: string): string {
  let n = 0
  for (let i = 0; i < 6; i++) n = (n * 16 + parseInt(hash[i], 16))
  const hue = n % 360
  return `hsl(${hue}, 55%, 28%)`
}

export function BlameView({ commitHash, filepath, onSelectCommit }: {
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
export function formatPath(path: string): { dir: string; name: string } {
  const parts = path.split('/')
  const name = parts.pop() ?? path
  const dir = parts.join('/')
  if (!dir) return { dir: '', name }
  const MAX = 26
  return { dir: (dir.length > MAX ? dir.slice(0, MAX - 1) + '…' : dir) + '/', name }
}

export const MIN_MSG_H = 48
export const MAX_MSG_H = 400

export function CommitDetail({ commit, onSelectCommit, wipCount, onViewWip, onOpenFileDiff, onAmendSuccess, githubRepo, onRewordMessage, showToast, onOpenFileOnRemote, onCopyFileLink, onRestoreFile, onOpenFileHistory, onCompareWorking }: {
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
   * Compare this commit against the working tree — promoted to a button beside
   * the author, because it is one of the two things a reader does next. The
   * hosts already hold the handler for the graph's menu; the pane offers the
   * same gesture where the commit is being read. Omitted ⇒ no button.
   */
  onCompareWorking?: (hash: string) => void
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
  // "You" instead of the name when the author is the person at the keyboard —
  // by git's own identity, which is the one the commits carry.
  const [isSelf, setIsSelf] = useState(false)
  const [explainGuidance, setExplainGuidance] = useState('')
  const [guidanceOpen, setGuidanceOpen] = useState(false)
  const [cdFileFilter, setCdFileFilter] = useState('')
  useEffect(() => {
    let alive = true
    void selfEmail().then(me => {
      if (alive) setIsSelf(!!me && me === commit.authorEmail?.trim().toLowerCase())
    })
    return () => { alive = false }
  }, [commit.authorEmail])
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

  const runAiExplain = useCallback(async (force = false, guidance?: string) => {
    setAiBusy(true)
    if (force) setAiExplanation(null)
    try {
      const r = await (window.gitAPI as any).aiExplainCommit(commit.hash, force, guidance)
      if (r.error) {
        showToast?.(r.error === 'NO_API_KEY' ? t('panel.aiNoKey') : r.error, 'err')
        return
      }
      setAiExplanation(r.explanation)
      // A guided answer is not the commit's canonical explanation: it answers
      // the guidance. The hosts skip their caches for it; so does this one.
      if (!guidance?.trim()) setCachedExplanation(r.explanation)
      setExplOpen(true)
    } catch (e: any) {
      showToast?.(e?.message ?? 'AI error', 'err')
    } finally {
      setAiBusy(false)
    }
  }, [commit.hash, showToast, t])

  // Marked and inked like every other AI row in the app — this menu hangs off
  // the AI button, so it was never ambiguous, but a row that reaches a model
  // reads the same wherever it is.
  const aiMenuItems: MenuItemDef[] = [
    { label: t('panel.aiRecompose'), action: runAiRecompose, icon: 'ai', tone: 'ai' },
    { label: cachedExplanation ? t('panel.aiExplainAgain') : t('panel.aiExplain'), action: () => runAiExplain(!!cachedExplanation), icon: 'ai', tone: 'ai' },
  ]

  // Parse co-authors from body (name + email)
  const coAuthors = body
    ? [...body.matchAll(/Co-Authored-By:\s*(.+?)\s*<([^>]+)>/gi)].map(m => ({ name: m[1].trim(), email: m[2].trim() }))
    : []
  // Body without co-author lines
  const cleanBody = body
    ? body.replace(/^Co-Authored-By:.*$/gim, '').trim()
    : ''

  // What the one-line header says. Summed here rather than asked for: the
  // per-file counts already arrive with the file list.
  // The filter is a display lens, the staging pane's rule: the header count
  // keeps counting every file, shown or not.
  const cdq = cdFileFilter.trim().toLowerCase()
  const visibleCdFiles = cdq ? files.filter(f => f.path.toLowerCase().includes(cdq)) : files
  const totalAdd = files.reduce((n, f) => n + (f.additions ?? 0), 0)
  const totalDel = files.reduce((n, f) => n + (f.deletions ?? 0), 0)
  const headRefs = commit.refs
    .filter(r => !/^(origin\/HEAD|remotes\/[^/]+\/HEAD)$/.test(r))
    .map(r => {
      const isHead = r.includes('HEAD'), isTag = r.startsWith('tag:')
      const isRemote = r.includes('origin/') || r.includes('remotes/')
      return {
        text: r.replace('tag: ', '').replace('HEAD -> ', '★ '),
        cls: isHead ? 'rp-ref-head' : isTag ? 'rp-ref-tag' : isRemote ? 'rp-ref-remote' : 'rp-ref-local',
      }
    })

  return (
    <div className="rp-content">
      {/* ── WIP banner ── */}
      {wipCount != null && wipCount > 0 && (
        <div className="cd-wip-banner">
          <span>{t('rp2.wipCount', wipCount)}</span>
          <button className="cd-view-change-btn" onClick={onViewWip}>{t('rp.viewChanges')}</button>
        </div>
      )}

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
              <button className="cd-copy-msg" title={t('panel.copyMessage')}
                onClick={e => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(commit.message + (cleanBody ? '\n\n' + cleanBody : ''))
                }}>
                <Icon name="copy" size={12} />
              </button>
              <p className="cd-title">{linkifyIssues(commit.message, githubRepo, autolinks)}</p>
              {cleanBody && <pre className="cd-body">{linkifyIssues(cleanBody, githubRepo, autolinks)}</pre>}
              {/* The honest empty state: the references line says when there is
                  nothing on it, instead of silently being absent — but only
                  where a reference could have been: with no GitHub remote and
                  no autolink rule there is nothing to find, and saying so on
                  every commit is noise in the one place height is scarce. */}
              {(githubRepo || autolinks.length > 0) && !hasIssueReferences(commit.message + '\n' + cleanBody, githubRepo, autolinks) && (
                <div className="cd-no-autolinks">
                  <Icon name="info" size={12} />{t('panel.noAutolinks')}
                </div>
              )}
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
          {/* Author — name and a relative time; the full date is the tooltip, which
              is the one place it is looked for. */}
          <div className="cd-author-block">
            <GravatarAvatar email={commit.authorEmail} name={commit.author} sha={commit.hash} size={32} radius={6} />
            <div className="cd-author-mid">
              <span className="cd-author-name" title={commit.author}>
                {isSelf ? t('panel.you') : commit.author}
              </span>
              <span className="cd-author-meta" title={fmtDate(commit.date, t('graph.dateLocale'))}>
                {fmtRelativeDate(commit.date, t)}
              </span>
            </div>
            {onCompareWorking && (
              <button className="cd-compare-btn" onClick={() => onCompareWorking(commit.hash)}
                title={t('compare.vsWorking')}>
                <Icon name="compare" size={13} />
                <span>{t('panel.compareBtn')}</span>
              </button>
            )}
            {/* The AI action stays, as a secondary control. A proposal the model
                makes is never a filled button — see the design board. */}
            <button
              className="cd-ai-btn"
              title="Recompose commit with AI"
              disabled={aiBusy}
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setAiMenu({ x: rect.right, y: rect.bottom + 4 })
              }}
            >
              <Icon name="ai" size={14} />
            </button>
            {aiMenu && (
              <ContextMenu x={aiMenu.x} y={aiMenu.y} items={aiMenuItems} onClose={() => setAiMenu(null)} />
            )}
          </div>

          {/* One line for what used to take four: the hash, where it lives, the
              branch, and what it cost. Every row of the reference pane carries
              more than one fact, and the second is always the cost. */}
          <div className="cd-head-line">
            <code className="cd-hash" onClick={() => navigator.clipboard.writeText(commit.hash)}
              title={t('panel.copyHash')}>{commit.shortHash}</code>
            {parentShort && (
              <button className="cd-parent-btn" onClick={() => onSelectCommit(commit.parents[0])}
                title={`parent: ${parentShort}`}>
                <Icon name="chevronLeft" size={11} />
              </button>
            )}
            {headRefs.map((r, i) => <span key={i} className={`rp-ref ${r.cls}`}>{r.text}</span>)}
            {files.length > 0 && (
              <span className="cd-head-cost" title={`${files.length} file${files.length !== 1 ? 's' : ''}`}>
                {totalAdd > 0 && <span className="rp-add">+{totalAdd}</span>}
                <span className="cd-head-cost-files"><Icon name="pencil" size={11} />{files.length}</span>
                {totalDel > 0 && <span className="rp-del">−{totalDel}</span>}
              </span>
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

          {/* Explain, inline. The guidance is real — it reaches the prompt —
              which is the only reason the field exists; it is asked for, not
              offered, because most explanations need none and the empty field
              took a full row from every commit. Outlined in the model's
              colour, never filled: it is a proposal, not the pane. */}
          <div className="cd-explain-row">
            {guidanceOpen && (
              <input
                className="cd-explain-input"
                placeholder={t('panel.explainGuidance')}
                value={explainGuidance}
                autoFocus
                onChange={e => setExplainGuidance(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !aiBusy) runAiExplain(true, explainGuidance)
                }}
              />
            )}
            <button className="cd-explain-btn" disabled={aiBusy}
              onClick={() => runAiExplain(true, explainGuidance)}>
              <Icon name="ai" size={12} />
              <span>{aiBusy ? '…' : t('panel.explainBtn')}</span>
            </button>
            <button
              className={`cd-explain-more${guidanceOpen ? ' cd-explain-more--open' : ''}`}
              title={t('panel.explainGuidanceToggle')}
              aria-label={t('panel.explainGuidanceToggle')}
              aria-pressed={guidanceOpen}
              onClick={() => setGuidanceOpen(o => !o)}
            >
              <Icon name="chevronDown" size={11} />
            </button>
          </div>

          {/* Files bar — the header names the list and counts it; the tools are
              icons. The sort button that used to sit here had no onClick: a
              dead control, shipped, of exactly the class panelSurface.test.ts
              polices host methods for. Removed rather than wired — the list
              has no sort state to wire it to. */}
          <div className="cd-files-bar">
            <span className="cd-files-title">{t('panel.filesChanged')}</span>
            <span className="cd-files-count">{files.length}</span>
            <div className="cd-files-spring" />
            <button className="cd-tool-btn" title={t('panel.copyFileList')}
              onClick={() => navigator.clipboard.writeText(files.map(f => f.path).join('\n'))}>
              <Icon name="copy" size={12} />
            </button>
            <div className="cd-view-toggle">
              <button className={`cd-view-btn ${!cdTreeMode ? 'active' : ''}`} title="Path"
                onClick={() => { setView('files'); setCdTreeMode(false); localStorage.setItem('cd-tree-mode', 'false') }}>
                <Icon name="list" size={11} />
              </button>
              <button className={`cd-view-btn ${cdTreeMode ? 'active' : ''}`} title="Tree"
                onClick={() => setCdTreeMode(v => { localStorage.setItem('cd-tree-mode', String(!v)); return !v })}>
                <Icon name="listTree" size={11} />
              </button>
            </div>
            <label className="cd-viewall">
              <input type="checkbox" checked={viewAll} onChange={e => setViewAll(e.target.checked)} />
              <span>{t('rp.allFiles')}</span>
            </label>
          </div>
          {/* The filter is a field, always there — the staging pane's rule,
              applied to the commit's list. */}
          <div className="st-filter st-filter--always">
            <Icon name="search" size={12} />
            <input type="text" className="st-filter-input"
              placeholder={t('panel.filter.placeholder')} value={cdFileFilter}
              onChange={e => setCdFileFilter(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setCdFileFilter('') } }} />
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
                ? buildTree(visibleCdFiles.map(f => ({ path: f.path, status: f.status ?? 'M' }))).map(node => (
                    <TreeFileRow key={node.fullPath} node={node} depth={0}
                      onAction={() => {}}
                      actionIcon=""
                      actionTitle=""
                      onSelect={p => { setSelectedFile(p); onOpenFileDiff?.({ type: 'commit', commitHash: commit.hash, filePath: p }) }}
                      onContextMenu={(e, p) => { e.preventDefault(); setFileMenu({ x: e.clientX, y: e.clientY, path: p }) }}
                      isSelected={selectedFile === node.fullPath}
                    />
                  ))
                : visibleCdFiles.map((f, i) => {
                    const { dir, name } = formatPath(f.path)
                    const s = f.status ?? 'M'
                    return (
                      <div key={i}
                        className={`rp-file-row ${selectedFile === f.path ? 'active' : ''}`}
                        onClick={() => { setSelectedFile(f.path); onOpenFileDiff?.({ type: 'commit', commitHash: commit.hash, filePath: f.path }) }}
                        onContextMenu={e => { e.preventDefault(); setFileMenu({ x: e.clientX, y: e.clientY, path: f.path }) }}
                      >
                        <StatusBadge status={s} className="rp-file-badge" />
                        {/* Name strong, folder weak: a file is found by its name,
                            and the folder is where it was found. */}
                        <span className="rp-file-path">
                          <span className="rp-file-name">{name}</span>
                          {dir && <span className="rp-file-dir">{dir}</span>}
                        </span>
                        {/* The cost, right-aligned. The data has been on the row
                            since the Working Changes parity lot; it was drawn in
                            the staging view and not here. */}
                        <DiffStat additions={f.additions} deletions={f.deletions} />
                        {/* The row's actions, on hover — the same three the
                            reference shows, instead of only a context menu. */}
                        <span className="rp-file-actions">
                          {onOpenFileHistory && (
                            <button className="rp-file-act" title={t('panel.history')}
                              onClick={e => { e.stopPropagation(); onOpenFileHistory(f.path) }}>
                              <Icon name="history" size={11} />
                            </button>
                          )}
                          {onOpenFileOnRemote && (
                            <button className="rp-file-act" title={t('panel.file.openOnRemote')}
                              onClick={e => { e.stopPropagation(); onOpenFileOnRemote(commit.hash, f.path) }}>
                              <Icon name="externalLink" size={11} />
                            </button>
                          )}
                          <button className="rp-file-act" title={t('panel.file.copyPath')}
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(f.path) }}>
                            <Icon name="copy" size={11} />
                          </button>
                        </span>
                      </div>
                    )
                  })
              }
              {files.length === 0 && (
                <div className="rp-empty">
                  {filesLoading ? t('panel.loading') : t('panel.noFileChanged')}
                </div>
              )}
              {files.length > 0 && visibleCdFiles.length === 0 && (
                <div className="rp-empty">{t('panel.filter.noMatch', cdFileFilter.trim())}</div>
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
