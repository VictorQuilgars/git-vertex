// Branch strip inside the staging panel (v1.22.0).
//
// v1.21.0 gathered every branch action behind one "⋮", but left that ⋮ on the
// toolbar and in the sidebar — i.e. out of view exactly while you are working
// in the staging panel. The tools that do this keep the branch, its sync state and its
// actions pinned above the file list; this is that strip.
//
// It owns no logic: the menu comes from buildBranchMenu, the actions come from
// the host. Anything the host does not supply simply does not render.
import { useState } from 'react'
import ContextMenu from '../ContextMenu/ContextMenu'
import { buildBranchMenu, type BranchMenuActions, type BranchMenuState } from '../ContextMenu/branchMenu'
import type { PRIntent } from '../ContextMenu/prIntent'
import { useLang } from '../../i18n/LanguageContext'
import './BranchStrip.css'

export interface BranchStripProps {
  branch: string
  ahead?: number
  behind?: number
  /** Branch has no upstream yet → the sync button publishes instead of pushing. */
  noUpstream?: boolean
  onPush?: () => void
  onPull?: () => void
  onFetch?: () => void
  /** Issue linked to this branch, if any (v1.21.0 metadata). */
  issue?: { number: number; title?: string } | null
  onAssociateIssue?: () => void
  onOpenIssue?: (number: number) => void
  /** The pull request this branch offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  /** Everything else lands in the ⋮ menu. */
  menuState?: Partial<BranchMenuState>
  menuActions?: BranchMenuActions
}

const IcoPush = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="21" x2="12" y2="9" /><polyline points="7 14 12 9 17 14" /><polyline points="3 3 21 3" /></svg>)
const IcoPull = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="3" x2="12" y2="15" /><polyline points="7 10 12 15 17 10" /><polyline points="3 21 21 21" /></svg>)
const IcoFetch = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>)
const IcoDots = () => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a1.25 1.25 0 1 1 0-2.5A1.25 1.25 0 0 1 8 4Zm0 5.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm1.25 4a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0Z" /></svg>)
const IcoLink = () => (<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25Zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0Z" /></svg>)

export default function BranchStrip(p: BranchStripProps) {
  const { t } = useLang()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const items = p.menuActions
    ? buildBranchMenu(
        { name: p.branch, display: p.branch, current: true, remote: false, pr: p.pr ?? undefined },
        { currentBranch: p.branch, issue: p.issue, ...p.menuState },
        p.menuActions,
        t
      )
    : []

  return (
    <div className="bstrip">
      <div className="bstrip-row">
        <svg className="bstrip-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z" />
        </svg>
        <span className="bstrip-name" title={p.branch}>{p.branch || '—'}</span>

        {/* Ahead/behind is why you would reach for push or pull at all, so it
            sits next to them rather than only in a tooltip. */}
        {(!!p.ahead || !!p.behind) && (
          <span className="bstrip-track">
            {!!p.ahead && <span className="bstrip-ahead">↑{p.ahead}</span>}
            {!!p.behind && <span className="bstrip-behind">↓{p.behind}</span>}
          </span>
        )}
        {p.noUpstream && <span className="bstrip-noupstream" title={t('panel.strip.noUpstream')}>⚠</span>}

        <span className="bstrip-spring" />

        {p.onPull && (
          <button className="bstrip-btn" title={t('sb.branch.pull')} onClick={p.onPull}><IcoPull /></button>
        )}
        {p.onPush && (
          <button className="bstrip-btn" title={p.noUpstream ? t('panel.strip.publish') : t('sb.branch.push')}
            onClick={p.onPush}><IcoPush /></button>
        )}
        {p.onFetch && (
          <button className="bstrip-btn" title={t('sb.branch.fetch')} onClick={p.onFetch}><IcoFetch /></button>
        )}
        {items.length > 0 && (
          <button className="bstrip-btn" title={t('sb.branch.menu')}
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: r.left, y: r.bottom + 3 })
            }}><IcoDots /></button>
        )}
      </div>

      {/* Associate Issue as a visible call to action, not a menu entry —
          Showing it in the panel is what makes it get used. */}
      {p.onAssociateIssue && (
        <button
          className={`bstrip-issue${p.issue ? ' bstrip-issue--linked' : ''}`}
          onClick={() => p.issue && p.onOpenIssue ? p.onOpenIssue(p.issue.number) : p.onAssociateIssue!()}
          title={p.issue ? (p.issue.title || `#${p.issue.number}`) : t('sb.branch.associateIssue')}
        >
          <IcoLink />
          {p.issue
            ? <><span className="bstrip-issue-num">#{p.issue.number}</span>
                {p.issue.title && <span className="bstrip-issue-title">{p.issue.title}</span>}</>
            : <span>{t('sb.branch.associateIssue')}</span>}
          {p.issue && (
            <span className="bstrip-issue-change" title={t('panel.strip.changeIssue')}
              onClick={e => { e.stopPropagation(); p.onAssociateIssue!() }}>⋯</span>
          )}
        </button>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
