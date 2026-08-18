import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
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
  /**
   * Start work on an issue: create the branch it suggests and link the two.
   * Omitted ⇒ the row's menu disappears, so a host that cannot create a branch
   * does not offer to.
   */
  onCreateBranchFromIssue?: (issue: { number: number; title: string; url: string }) => void
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
    >{done ? '✓' : <Icon name="link" size={12} />}</button>
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
          <Icon name="arrowSwitch" size={10} />
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
              <Icon name="comment" size={11} />
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

function IssueItem({ issue, onCreateBranch }: {
  issue: Issue
  onCreateBranch?: () => void
}) {
  const { t } = useLang()
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
    <div className="ghp-item"
      onClick={() => window.gitAPI.openExternal(issue.url)}
      onContextMenu={onCreateBranch
        ? e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }) }
        : undefined}
      title={t('gh.panel.openIn')}>
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
              <Icon name="comment" size={11} />
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
    {ctx && onCreateBranch && (
      <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)}
        items={[{ label: t('gh.issue.createBranch'), action: onCreateBranch }]} />
    )}
    </>
  )
}

export default function GitHubPanel({ repoPath, onCreateBranchFromIssue }: Props) {
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
            <Icon name="refresh" size={13} />
          </button>
        )}
      </div>

      {!noRepo && !noAuth && (
        <div className="ghp-tabs">
          <button className={`ghp-tab ${tab === 'prs' ? 'active' : ''}`} onClick={() => setTab('prs')}>
            <Icon name="pullRequest" size={13} />
            {t('gh.panel.tabPRs')}
            {prs.length > 0 && <span className="ghp-count">{prs.length}</span>}
          </button>
          <button className={`ghp-tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>
            <Icon name="issue" size={13} />
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
            : issues.map(issue => (
                <IssueItem key={issue.number} issue={issue}
                  onCreateBranch={onCreateBranchFromIssue
                    && (() => onCreateBranchFromIssue({ number: issue.number, title: issue.title, url: issue.url }))} />
              ))
        )}
      </div>
    </div>
  )
}
