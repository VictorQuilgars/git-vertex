import { ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../../i18n/LanguageContext'
import { findAutolinks, type Autolink } from '../../utils/autolinks'
import './IssueLink.css'

export interface IssueRepo { owner: string; repo: string }

interface IssueInfo {
  number: number
  title: string
  state: 'open' | 'closed'
  isPR: boolean
  merged: boolean
  url: string
}

// Module-level cache: one fetch per issue per session, shared across all links
const issueCache = new Map<string, IssueInfo | null>()
const issuePending = new Map<string, Promise<IssueInfo | null>>()

function fetchIssue(repo: IssueRepo, number: number): Promise<IssueInfo | null> {
  const key = `${repo.owner}/${repo.repo}#${number}`
  if (issueCache.has(key)) return Promise.resolve(issueCache.get(key)!)
  const pending = issuePending.get(key)
  if (pending) return pending
  const p = (window.gitAPI as any).githubGetIssue(repo.owner, repo.repo, number)
    .then((r: any) => {
      const info: IssueInfo | null = r?.issue ?? null
      issueCache.set(key, info)
      issuePending.delete(key)
      return info
    })
    .catch(() => {
      issuePending.delete(key)
      return null
    })
  issuePending.set(key, p)
  return p
}

function stateMeta(info: IssueInfo): { color: string; labelKey: string } {
  if (info.isPR && info.merged) return { color: '#a371f7', labelKey: 'issue.merged' }
  if (info.state === 'open') return { color: '#3fb950', labelKey: 'issue.open' }
  if (info.isPR) return { color: '#f85149', labelKey: 'issue.closed' }
  return { color: '#a371f7', labelKey: 'issue.closed' }
}

export function IssueLink({ repo, number }: { repo: IssueRepo; number: number }) {
  const { t } = useLang()
  const [info, setInfo] = useState<IssueInfo | null | undefined>(undefined)
  const [tipPos, setTipPos] = useState<{ left: number; bottom: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchorRef = useRef<HTMLAnchorElement | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  const onEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (!rect) return
      setTipPos({
        left: Math.min(rect.left, window.innerWidth - 380),
        bottom: window.innerHeight - rect.top + 6,
      })
      fetchIssue(repo, number).then(i => { if (mounted.current) setInfo(i) })
    }, 350)
  }
  const onLeave = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setTipPos(null)
  }

  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const url = info?.url ?? `https://github.com/${repo.owner}/${repo.repo}/issues/${number}`
    ;(window.gitAPI as any).openExternal(url)
  }

  return (
    <span className="issue-link-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <a ref={anchorRef} className="issue-link" onClick={open} onDoubleClick={e => e.stopPropagation()}>#{number}</a>
      {tipPos && createPortal(
        <span className="issue-tooltip" style={{ left: tipPos.left, bottom: tipPos.bottom }} onClick={e => e.stopPropagation()}>
          {info === undefined ? (
            <span className="issue-tooltip-loading">{(t as any)('issue.loading')}</span>
          ) : info === null ? (
            <span className="issue-tooltip-loading">#{number} — {repo.owner}/{repo.repo}</span>
          ) : (
            <>
              <span className="issue-tooltip-head">
                <span className="issue-state-dot" style={{ background: stateMeta(info).color }} />
                <span className="issue-state-label" style={{ color: stateMeta(info).color }}>
                  {(t as any)(stateMeta(info).labelKey)}
                </span>
                <span className="issue-tooltip-kind">{info.isPR ? 'PR' : 'Issue'} #{info.number}</span>
              </span>
              <span className="issue-tooltip-title">{info.title}</span>
            </>
          )}
        </span>,
        document.body
      )}
    </span>
  )
}

/**
 * A reference that is not `#123` — a Jira ticket, a Linear issue, anything the
 * user configured. It gets a link and no hover card: we know where it goes, and
 * nothing about what is on the other side.
 */
function PlainAutolink({ text, url }: { text: string; url: string }) {
  return (
    <a
      className="issue-link"
      onClick={e => { e.stopPropagation(); e.preventDefault(); (window.gitAPI as any).openExternal(url) }}
      onDoubleClick={e => e.stopPropagation()}
    >{text}</a>
  )
}

/**
 * Linkify a commit message.
 *
 * `#123` keeps its rich card, resolved against the repository's own remote —
 * that is the one reference we can look up. Configured `autolinks` cover
 * everything else, and are matched by the same rules (not mid-word, not after a
 * slash, digits only). A repository with no GitHub remote still gets its
 * autolinks: they have nothing to do with the forge.
 */
export function linkifyIssues(
  text: string,
  repo: IssueRepo | null | undefined,
  autolinks: Autolink[] = [],
): ReactNode {
  if (!text) return text
  const links = [...autolinks]
  // `#` is only meaningful when we know which repository it points at.
  if (repo) links.push({ prefix: '#', url: '#' })
  const found = findAutolinks(text, links)
  if (found.length === 0) return text

  const parts: ReactNode[] = []
  let last = 0
  for (const m of found) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(m.url === '#' && repo
      ? <IssueLink key={`${m.index}-${m.number}`} repo={repo} number={m.number} />
      : <PlainAutolink key={`${m.index}-${m.number}`} text={m.text} url={m.url} />)
    last = m.index + m.text.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
