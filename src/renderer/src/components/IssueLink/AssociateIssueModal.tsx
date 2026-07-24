// "Associate Issue with Branch" (v1.21.0) — picks the GitHub issue a branch is
// working on. The link is local metadata (see useBranchMeta): git has nowhere
// to store it and we deliberately do not push anything to GitHub here.
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import type { LinkedIssue } from '../../hooks/useBranchMeta'
import './AssociateIssueModal.css'

interface RepoRef { owner: string; repo: string }

interface Issue {
  number: number
  title: string
  state?: string
  url?: string
  html_url?: string
}

export default function AssociateIssueModal({ branch, current, onPick, onClose }: {
  branch: string
  /** Issue already linked to this branch, if any. */
  current: LinkedIssue | null
  /** Called with null to clear the link. */
  onPick: (issue: LinkedIssue | null) => void
  onClose: () => void
}) {
  const { t } = useLang()
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const detected: RepoRef | null = await (window.gitAPI as any).githubDetectRepo()
        if (!detected?.owner) {
          if (alive) setError(t('issue.assoc.noGithub'))
          return
        }
        const res = await (window.gitAPI as any).githubListIssues(detected.owner, detected.repo)
        if (!alive) return
        const list: Issue[] = res?.issues ?? res ?? []
        setIssues(Array.isArray(list) ? list : [])
      } catch {
        if (alive) setError(t('issue.assoc.loadFailed'))
      }
    })()
    return () => { alive = false }
  }, [t])

  // Filter on both number and title so "42" and "login bug" both work.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !issues) return issues ?? []
    return issues.filter(i => String(i.number).includes(q) || i.title?.toLowerCase().includes(q))
  }, [issues, query])

  // A bare number that matches nothing lets the user link an issue the list
  // does not carry (closed, or a repo whose issues we cannot enumerate).
  const manualNumber = /^#?(\d{1,6})$/.exec(query.trim())?.[1]
  const canUseManual = manualNumber && !shown.some(i => i.number === Number(manualNumber))

  const pick = (issue: Issue) => onPick({
    number: issue.number,
    title: issue.title,
    url: issue.html_url ?? issue.url,
  })

  return (
    <div className="dlg-overlay" onMouseDown={onClose}>
      <div className="aim-box" onMouseDown={e => e.stopPropagation()}>
        <div className="aim-head">
          <span className="aim-title">{t('issue.assoc.title')}</span>
          <code className="aim-branch">{branch}</code>
        </div>

        {current && (
          <div className="aim-current">
            <span>{t('issue.assoc.currentlyLinked', current.number)}</span>
            <button className="aim-unlink" onClick={() => onPick(null)}>{t('issue.assoc.unlink')}</button>
          </div>
        )}

        <input
          className="aim-search"
          autoFocus
          placeholder={t('issue.assoc.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
        />

        <div className="aim-list">
          {error && <div className="aim-msg aim-msg--err">{error}</div>}
          {!error && issues === null && <div className="aim-msg">{t('issue.assoc.loading')}</div>}
          {!error && issues !== null && shown.length === 0 && !canUseManual && (
            <div className="aim-msg">{t('issue.assoc.empty')}</div>
          )}
          {shown.map(i => (
            <button key={i.number} className="aim-item" onClick={() => pick(i)}>
              <span className="aim-num">#{i.number}</span>
              <span className="aim-item-title">{i.title}</span>
            </button>
          ))}
          {canUseManual && (
            <button className="aim-item aim-item--manual"
              onClick={() => onPick({ number: Number(manualNumber) })}>
              {t('issue.assoc.linkNumber', Number(manualNumber))}
            </button>
          )}
        </div>

        <div className="aim-actions">
          <button className="aim-btn" onClick={onClose}>{t('dlg.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
