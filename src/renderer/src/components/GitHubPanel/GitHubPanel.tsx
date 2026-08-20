import { useState, useEffect, useCallback } from 'react'
import { Icon } from '../Icon/Icon'
import GithubRow, { type GithubLabel } from './GithubRow'
import './GitHubPanel.css'
import { useLang } from '../../i18n/LanguageContext'
import { Brand } from '../BrandMark/BrandMark'

interface PR {
  number: number
  title: string
  draft: boolean
  author: string
  createdAt: string
  comments: number
  labels: GithubLabel[]
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
  labels: GithubLabel[]
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
            : prs.map(pr => (
                <GithubRow key={pr.number} item={{ ...pr, kind: 'pr' }}
                  onOpen={url => window.gitAPI.openExternal(url)} />
              ))
        )}

        {!noRepo && !noAuth && !error && !loading && tab === 'issues' && (
          issues.length === 0
            ? <div className="ghp-state">{t('gh.panel.noIssues')}</div>
            : issues.map(issue => (
                <GithubRow key={issue.number} item={{ ...issue, kind: 'issue' }}
                  onOpen={url => window.gitAPI.openExternal(url)}
                  onCreateBranch={onCreateBranchFromIssue
                    ? () => onCreateBranchFromIssue({ number: issue.number, title: issue.title, url: issue.url })
                    : undefined} />
              ))
        )}
      </div>
    </div>
  )
}
