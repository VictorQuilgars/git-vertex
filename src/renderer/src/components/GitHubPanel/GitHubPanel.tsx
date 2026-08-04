import { useState, useEffect, useCallback } from 'react'
import './GitHubPanel.css'
import { useLang } from '../../i18n/LanguageContext'
import { Brand } from '../BrandMark/BrandMark'

interface Label { name: string; color: string }

interface PR {
  number: number
  title: string
  draft: boolean
  author: string
  createdAt: string
  comments: number
  labels: Label[]
  url: string
  headRef: string
  baseRef: string
  // Set in cross-repo mode: which repository this item belongs to
  repoLabel?: string
}

interface Issue {
  number: number
  title: string
  author: string
  createdAt: string
  comments: number
  labels: Label[]
  url: string
  repoLabel?: string
}

interface Props {
  repoPath: string | null
}

function timeAgo(dateStr: string, t: (key: any, ...args: any[]) => string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return t('github.justNow')
  if (diff < 3600) return t('time.min', Math.floor(diff / 60))
  if (diff < 86400) return t('time.hour', Math.floor(diff / 3600))
  if (diff < 2592000) return t('time.day', Math.floor(diff / 86400))
  if (diff < 31536000) return t('time.month', Math.floor(diff / 2592000))
  return t('time.year', Math.floor(diff / 31536000))
}

function LabelChip({ label }: { label: Label }) {
  const bg = `#${label.color}22`
  const border = `#${label.color}66`
  const color = `#${label.color}`
  return (
    <span className="ghp-label" style={{ background: bg, borderColor: border, color }}>
      {label.name}
    </span>
  )
}

/**
 * Copy the forge's own URL for a row. GitHub hands us `html_url` with every
 * item, so this copies what the forge said rather than rebuilding it — the
 * builder is for the cases where nobody handed us one.
 */
function CopyLinkButton({ url }: { url: string }) {
  const { t } = useLang()
  const [done, setDone] = useState(false)
  return (
    <button
      className="ghp-copy-link"
      title={t('gh.panel.copyLink')}
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(url)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >{done ? '✓' : '🔗'}</button>
  )
}

function PRItem({ pr }: { pr: PR }) {
  const { t } = useLang()
  return (
    <div className="ghp-item" onClick={() => window.gitAPI.openExternal(pr.url)} title={t('gh.panel.openIn')}>
      <div className="ghp-item-top">
        {pr.repoLabel && <span className="ghp-repo-badge">{pr.repoLabel}</span>}
        <span className="ghp-number">#{pr.number}</span>
        {pr.draft && <span className="ghp-badge ghp-draft">{t('gh.panel.draft')}</span>}
        <span className="ghp-title">{pr.title}</span>
        <CopyLinkButton url={pr.url} />
      </div>
      <div className="ghp-item-meta">
        <span className="ghp-refs">
          <code>{pr.headRef}</code>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 9l3-3-3-3"/><path d="M2 12V6a2 2 0 0 1 2-2h8"/></svg>
          <code>{pr.baseRef}</code>
        </span>
        <span className="ghp-dot">·</span>
        <span className="ghp-author">@{pr.author}</span>
        <span className="ghp-dot">·</span>
        <span className="ghp-time">{timeAgo(pr.createdAt, t)}</span>
        {pr.comments > 0 && (
          <>
            <span className="ghp-dot">·</span>
            <span className="ghp-comments">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z"/>
              </svg>
              {pr.comments}
            </span>
          </>
        )}
      </div>
      {pr.labels.length > 0 && (
        <div className="ghp-labels">
          {pr.labels.slice(0, 4).map(l => <LabelChip key={l.name} label={l} />)}
        </div>
      )}
    </div>
  )
}

function IssueItem({ issue }: { issue: Issue }) {
  const { t } = useLang()
  return (
    <div className="ghp-item" onClick={() => window.gitAPI.openExternal(issue.url)} title={t('gh.panel.openIn')}>
      <div className="ghp-item-top">
        {issue.repoLabel && <span className="ghp-repo-badge">{issue.repoLabel}</span>}
        <span className="ghp-number">#{issue.number}</span>
        <span className="ghp-title">{issue.title}</span>
        <CopyLinkButton url={issue.url} />
      </div>
      <div className="ghp-item-meta">
        <span className="ghp-author">@{issue.author}</span>
        <span className="ghp-dot">·</span>
        <span className="ghp-time">{timeAgo(issue.createdAt, t)}</span>
        {issue.comments > 0 && (
          <>
            <span className="ghp-dot">·</span>
            <span className="ghp-comments">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Z"/>
              </svg>
              {issue.comments}
            </span>
          </>
        )}
      </div>
      {issue.labels.length > 0 && (
        <div className="ghp-labels">
          {issue.labels.slice(0, 4).map(l => <LabelChip key={l.name} label={l} />)}
        </div>
      )}
    </div>
  )
}

export default function GitHubPanel({ repoPath }: Props) {
  const { t } = useLang()
  const [tab, setTab] = useState<'prs' | 'issues'>('prs')
  const [owner, setOwner] = useState<string | null>(null)
  const [repo, setRepo] = useState<string | null>(null)
  const [noRepo, setNoRepo] = useState(false)
  const [noAuth, setNoAuth] = useState(false)

  const [prs, setPRs] = useState<PR[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!repoPath) return
    setNoRepo(false)
    window.gitAPI.githubDetectRepo().then((r: any) => {
      if (!r.owner) { setNoRepo(true); return }
      setOwner(r.owner)
      setRepo(r.repo)
    })
  }, [repoPath])

  const load = useCallback(async (o: string, r: string) => {
    setLoading(true)
    setError(null)
    try {
      if (tab === 'prs') {
        const res = await (window.gitAPI as any).githubListPRs(o, r)
        if (res.error === 'not_authenticated') { setNoAuth(true); return }
        if (res.error) { setError(t('gh.panel.error', res.error)); return }
        setPRs(res.prs ?? [])
      } else {
        const res = await (window.gitAPI as any).githubListIssues(o, r)
        if (res.error === 'not_authenticated') { setNoAuth(true); return }
        if (res.error) { setError(t('gh.panel.error', res.error)); return }
        setIssues(res.issues ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [tab, t])

  useEffect(() => {
    if (owner && repo) load(owner, repo)
  }, [owner, repo, tab, load])

  return (
    <div className="ghp-panel">
      <div className="ghp-header">
        <Brand name="github" size={14} />
        <span className="ghp-repo-name">
          {owner && repo ? `${owner}/${repo}` : 'GitHub'}
        </span>
        <div style={{ flex: 1 }} />
        {owner && repo && !noAuth && (
          <button className="ghp-refresh" onClick={() => load(owner, repo)} title={t('gh.panel.refresh')}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ animation: loading ? 'ghp-spin 0.8s linear infinite' : 'none' }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          </button>
        )}
      </div>

      {!noRepo && !noAuth && (
        <div className="ghp-tabs">
          <button className={`ghp-tab ${tab === 'prs' ? 'active' : ''}`} onClick={() => setTab('prs')}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"/>
            </svg>
            {t('gh.panel.tabPRs')}
            {prs.length > 0 && <span className="ghp-count">{prs.length}</span>}
          </button>
          <button className={`ghp-tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
            </svg>
            {t('gh.panel.tabIssues')}
            {issues.length > 0 && <span className="ghp-count">{issues.length}</span>}
          </button>
        </div>
      )}

      <div className="ghp-body">
        {noRepo && <div className="ghp-state">{t('gh.panel.noRepo')}</div>}
        {noAuth && <div className="ghp-state">{t('gh.panel.noAuth')}</div>}
        {error && <div className="ghp-state ghp-err">{error}</div>}

        {!noRepo && !noAuth && !error && loading && (
          <div className="ghp-state">{t('gh.panel.loading')}</div>
        )}

        {!noRepo && !noAuth && !error && !loading && tab === 'prs' && (
          prs.length === 0
            ? <div className="ghp-state">{t('gh.panel.noPRs')}</div>
            : prs.map(pr => <PRItem key={pr.number} pr={pr} />)
        )}

        {!noRepo && !noAuth && !error && !loading && tab === 'issues' && (
          issues.length === 0
            ? <div className="ghp-state">{t('gh.panel.noIssues')}</div>
            : issues.map(issue => <IssueItem key={issue.number} issue={issue} />)
        )}
      </div>
    </div>
  )
}
