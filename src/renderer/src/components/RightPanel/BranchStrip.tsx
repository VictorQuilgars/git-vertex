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
import { Icon } from '../Icon/Icon'
import ContextMenu from '../ContextMenu/ContextMenu'
import { issueRefLabel, type IssueRef } from '../../utils/issueRef'
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
  /**
   * Compare the working tree against HEAD — the staging pane's header button.
   * Carried here because the host already gathers everything about the current
   * branch in this one object. Absent ⇒ no button.
   */
  onCompareWorking?: () => void
  /** Issue linked to this branch, if any (v1.21.0 metadata). */
  issue?: IssueRef | null
  onAssociateIssue?: () => void
  onOpenIssue?: (ref: IssueRef) => void
  /** The pull request this branch offers, if any — see prIntentFor. */
  pr?: PRIntent | null
  /** Everything else lands in the ⋮ menu. */
  menuState?: Partial<BranchMenuState>
  menuActions?: BranchMenuActions
}

const IcoPush = () => (<Icon name="push" size={13} />)
const IcoPull = () => (<Icon name="download" size={13} />)
const IcoFetch = () => (<Icon name="refresh" size={13} />)
const IcoDots = () => (<Icon name="kebab" size={12} />)
const IcoLink = () => (<Icon name="link" size={12} />)

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
        <Icon name="branch" size={12} className="bstrip-icon" />
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
          onClick={() => p.issue && p.onOpenIssue ? p.onOpenIssue(p.issue) : p.onAssociateIssue!()}
          title={p.issue ? (p.issue.title || issueRefLabel(p.issue)) : t('sb.branch.associateIssue')}
        >
          <IcoLink />
          {p.issue
            ? <><span className="bstrip-issue-num">{issueRefLabel(p.issue)}</span>
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
