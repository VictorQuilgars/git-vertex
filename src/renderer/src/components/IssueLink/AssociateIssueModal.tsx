// "Associate Issue with Branch" (v1.21.0) — picks the work a branch is doing.
// The link is local metadata (see useBranchMeta): git has nowhere to store it
// and we deliberately do not push anything to the tracker here.
//
// The list it offers is GitHub's, because that is the only tracker we can
// enumerate. The typed reference below it is not a fallback for that list — it
// is the *only* path for anything else, and it is why this dialog is not called
// "pick a GitHub issue".
import { useEffect, useMemo, useState } from 'react'
import { useLang } from '../../i18n/LanguageContext'
import { useSettings } from '../../contexts/SettingsContext'
import { parseAutolinks } from '../../utils/autolinks'
import { issueRefLabel, parseIssueRefInput } from '../../utils/issueRef'
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
  const { get } = useSettings()
  // The reference patterns already configured in Settings › GitHub. They are
  // what gives a typed reference somewhere to point, with no integration.
  const autolinks = useMemo(() => parseAutolinks(get('autolinks', '')), [get])
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

  // Anything that reads as a reference can be linked, whether or not the list
  // carries it: a closed GitHub issue, a repository whose issues we cannot
  // enumerate, or a tracker we have no API for at all. A configured autolink
  // pattern gives it a URL; without one it is still a reference worth holding.
  const manual = useMemo(() => parseIssueRefInput(query, autolinks), [query, autolinks])
  const canUseManual = manual && !(
    manual.provider === 'github' && shown.some(i => String(i.number) === manual.key)
  )

  const pick = (issue: Issue) => onPick({
    provider: 'github',
    key: String(issue.number),
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
            <span>{t('issue.assoc.currentlyLinked', issueRefLabel(current))}</span>
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
          {canUseManual && manual && (
            <button className="aim-item aim-item--manual" onClick={() => onPick(manual)}>
              {t('issue.assoc.linkNumber', issueRefLabel(manual))}
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
