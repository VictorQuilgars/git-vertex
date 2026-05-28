import React, { useState, useEffect, useCallback } from 'react'
import './GitHubPanel.css'
import { useLang } from '../../i18n/LanguageContext'

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
}

interface Issue {
  number: number
  title: string
  author: string
  createdAt: string
  comments: number
  labels: Label[]
  url: string
}

interface Props {
  repoPath: string | null
  onClose: () => void
}

function timeAgo(dateStr: string, lang: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return lang === 'fr' ? "à l'instant" : 'just now'
  if (diff < 3600) {
    const m = Math.floor(diff / 60)
    return lang === 'fr' ? `${m} min` : `${m}m`
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600)
    return lang === 'fr' ? `${h}h` : `${h}h`
  }
  if (diff < 2592000) {
    const d = Math.floor(diff / 86400)
    return lang === 'fr' ? `${d} j` : `${d}d`
  }
  if (diff < 31536000) {
    const mo = Math.floor(diff / 2592000)
    return lang === 'fr' ? `${mo} mois` : `${mo}mo`
  }
  const y = Math.floor(diff / 31536000)
  return lang === 'fr' ? `${y} an${y > 1 ? 's' : ''}` : `${y}y`
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

function PRItem({ pr, lang }: { pr: PR; lang: string }) {
  const { t } = useLang()
  return (
    <div className="ghp-item" onClick={() => window.gitAPI.openExternal(pr.url)} title={t('gh.panel.openIn')}>
      <div className="ghp-item-top">
        <span className="ghp-number">#{pr.number}</span>
        {pr.draft && <span className="ghp-badge ghp-draft">{t('gh.panel.draft')}</span>}
        <span className="ghp-title">{pr.title}</span>
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
        <span className="ghp-time">{timeAgo(pr.createdAt, lang)}</span>
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

function IssueItem({ issue, lang }: { issue: Issue; lang: string }) {
  const { t } = useLang()
  return (
    <div className="ghp-item" onClick={() => window.gitAPI.openExternal(issue.url)} title={t('gh.panel.openIn')}>
      <div className="ghp-item-top">
        <span className="ghp-number">#{issue.number}</span>
        <span className="ghp-title">{issue.title}</span>
      </div>
      <div className="ghp-item-meta">
        <span className="ghp-author">@{issue.author}</span>
        <span className="ghp-dot">·</span>
        <span className="ghp-time">{timeAgo(issue.createdAt, lang)}</span>
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

export default function GitHubPanel({ repoPath, onClose }: Props) {
  const { t, lang } = useLang()
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
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
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
        <button className="ghp-close" onClick={onClose}>×</button>
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
            : prs.map(pr => <PRItem key={pr.number} pr={pr} lang={lang} />)
        )}

        {!noRepo && !noAuth && !error && !loading && tab === 'issues' && (
          issues.length === 0
            ? <div className="ghp-state">{t('gh.panel.noIssues')}</div>
            : issues.map(issue => <IssueItem key={issue.number} issue={issue} lang={lang} />)
        )}
      </div>
    </div>
  )
}
