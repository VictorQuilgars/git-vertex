import { ReactNode, useEffect, useRef, useState } from 'react'
import { findAutolinks, type Autolink } from '../../utils/autolinks'
import GithubHoverCard, { useHoverCard } from '../GitHubPanel/GithubHoverCard'
import type { GithubLabel, GithubRowItem } from '../GitHubPanel/GithubRow'
import './IssueLink.css'

export interface IssueRepo { owner: string; repo: string }

interface IssueInfo {
  number: number
  title: string
  state: 'open' | 'closed'
  isPR: boolean
  merged: boolean
  url: string
  body?: string
  labels?: GithubLabel[]
  assignees?: string[]
  author?: string
  draft?: boolean
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

/**
 * The `#123` reference shows THE hover card — GithubHoverCard, the same one a
 * sidebar row opens — on a different anchor, fed by `githubGetIssue` instead
 * of a list item (#95 §3). Two cards for one thing drifted: the reference's
 * used to be a two-line state tooltip while the row's rendered the body, the
 * labels and the people. What the reference alone knows that a sidebar list
 * never carries — closed and merged states — the card now says too.
 */
export function IssueLink({ repo, number }: { repo: IssueRepo; number: number }) {
  const [info, setInfo] = useState<IssueInfo | null | undefined>(undefined)
  const hover = useHoverCard(350)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const onEnter = (e: React.MouseEvent) => {
    hover.enter(e)
    fetchIssue(repo, number).then(i => { if (mounted.current) setInfo(i) })
  }

  const open = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    e?.preventDefault()
    const url = info?.url ?? `https://github.com/${repo.owner}/${repo.repo}/issues/${number}`
    ;(window.gitAPI as any).openExternal(url)
  }

  // A reference that resolved to nothing gets no card rather than an empty
  // frame — the card's own rule. The link still opens the browser.
  const item: GithubRowItem | null = info ? {
    kind: info.isPR ? 'pr' : 'issue',
    number: info.number,
    title: info.title,
    url: info.url,
    body: info.body,
    labels: info.labels,
    assignees: info.assignees,
    author: info.author,
    draft: info.draft,
    state: info.state,
    merged: info.merged,
  } : null

  return (
    <span className="issue-link-wrap" onMouseEnter={onEnter} onMouseLeave={hover.leaveRow}>
      <a className="issue-link" onClick={open} onDoubleClick={e => e.stopPropagation()}>#{number}</a>
      {hover.pos && item && (
        <GithubHoverCard item={item} pos={hover.pos} inside={hover.inside}
          onClose={hover.close}
          onOpen={url => (window.gitAPI as any).openExternal(url)}
          onActivate={() => open()} />
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
/**
 * Whether `text` carries any reference linkifyIssues would render — the same
 * list, so the "no autolinks found" line can never disagree with the links.
 */
export function hasIssueReferences(
  text: string,
  repo: IssueRepo | null | undefined,
  autolinks: Autolink[] = [],
): boolean {
  if (!text) return false
  const links = [...autolinks]
  if (repo) links.push({ prefix: '#', url: '#' })
  return findAutolinks(text, links).length > 0
}

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
