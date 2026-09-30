import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import type { SidebarView } from '../../../src/renderer/src/components/Sidebar/Sidebar'
import type { TranslationKey } from '../../../src/renderer/src/i18n/translations'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import ContextMenu from '../../../src/renderer/src/components/ContextMenu/ContextMenu'
import { shortCount, type SidebarCounts } from '../../../src/renderer/src/components/Sidebar/sidebarCounts'
import { keyForView } from '../../../src/renderer/src/components/Sidebar/viewKeys'
import type { SidePlacement } from './panelLayout'

// Vertical activity rail. Always visible on the left of the
// panel; each icon toggles the resizable side-panel for one Sidebar view.
// The kanban icon at the bottom is a placeholder for a future project-management
// feature (see the competitive analysis in docs-private/).

interface RailItem {
  view: SidebarView
  // A real key, not a string: the fallback below hides a missing one, so
  // nothing but the compiler can tell a typo from a key nobody added yet.
  labelKey: TranslationKey
  fallback: string
  icon: React.ReactNode
}

const ITEMS: RailItem[] = [
  {
    view: 'overview', labelKey: 'rail.overview', fallback: 'Overview',
    icon: <Icon name="home" />,
  },
  // One entry for everything the model does here: what it has written (#70)
  // and what is running (the agents list, which lived on its own icon and was
  // the same robot head twice over).
  {
    view: 'ai', labelKey: 'rail.ai', fallback: 'AI',
    icon: <Icon name="agent" />,
  },
  {
    view: 'worktrees', labelKey: 'rail.worktrees', fallback: 'Worktrees',
    icon: <Icon name="worktree" />,
  },
  {
    view: 'branches', labelKey: 'rail.branches', fallback: 'Branches',
    icon: <Icon name="branch" />,
  },
  {
    view: 'remotes', labelKey: 'rail.remotes', fallback: 'Remotes',
    icon: <Icon name="cloud" />,
  },
  {
    view: 'stash', labelKey: 'rail.stash', fallback: 'Stash',
    icon: <Icon name="stash" />,
  },
  {
    view: 'tags', labelKey: 'rail.tags', fallback: 'Tags',
    icon: <Icon name="tag" />,
  },
  {
    view: 'prs', labelKey: 'rail.prs', fallback: 'Pull Requests',
    icon: <Icon name="pullRequest" />,
  },
  {
    view: 'issues', labelKey: 'rail.issues', fallback: 'Issues',
    icon: <Icon name="issue" />,
  },
]

const KANBAN_ICON = <Icon name="panel" />

// One icon slot = the button + 2px of flex gap: 34px buttons on the wide
// rail, 30px on the narrow one a side-bar column gets.
const STRIDE = 36
const STRIDE_COMPACT = 32
// Rail chrome that is never part of the scrollable icon column:
// 12px vertical padding + the two pinned buttons at the foot (the side view's
// placement, the kanban) + breathing room.
const reserved = (stride: number) => 12 + 2 * stride + 6

const PLACEMENTS: { value: SidePlacement; labelKey: TranslationKey }[] = [
  { value: 'auto', labelKey: 'rail.side.auto' },
  { value: 'docked', labelKey: 'rail.side.docked' },
  { value: 'floating', labelKey: 'rail.side.floating' },
]

export default function ActivityRail({
  active, onSelect, compact, counts, placement, onPlacement,
}: {
  active: SidebarView | null
  onSelect: (v: SidebarView) => void
  /** The 36px rail of a narrow panel: smaller buttons, same icons. */
  compact?: boolean
  /**
   * How many rows each view holds, under its icon (#277) — sidebarCounts, the
   * rule the section headers count with. A zero draws nothing: nine zeros down
   * a rail are noise, and the view says "none" when it is opened.
   */
  counts?: SidebarCounts
  /** Docked, floating, or `auto` — the menu at the rail's foot (#277). */
  placement?: SidePlacement
  onPlacement?: (p: SidePlacement) => void
}) {
  const { t } = useLang()
  const label = (key: TranslationKey, fallback: string) => {
    const s = t(key)
    return s === key ? fallback : s
  }

  // When the panel is too short to show every icon, the ones that don't fit
  // move into a "…" overflow menu — icons keep their fixed size, never shrink.
  const railRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(ITEMS.length)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [placementMenu, setPlacementMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const stride = compact ? STRIDE_COMPACT : STRIDE
    const compute = () => {
      const forIcons = el.clientHeight - reserved(stride)
      let n = Math.floor(forIcons / stride)
      if (n < ITEMS.length) n = Math.max(0, n - 1) // reserve a slot for the "…" button
      setVisible(Math.min(ITEMS.length, Math.max(0, n)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [compact])

  const shown = ITEMS.slice(0, visible)
  const hidden = ITEMS.slice(visible)
  const activeHidden = hidden.some(i => i.view === active)

  const openMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: r.right + 4, y: r.top })
  }
  // What the icon's tooltip and accessible name say: the view, its count,
  // and the key that opens it — the only place the key is shown beside the view.
  const describe = (item: RailItem) => {
    const name = label(item.labelKey, item.fallback)
    const n = counts?.[item.view]
    return `${n === undefined ? name : `${name} (${n})`}\n${t('rail.shortcut', keyForView(item.view))}`
  }

  return (
    <div className={`gv-rail${compact ? ' gv-rail--compact' : ''}`} ref={railRef}>
      {shown.map(item => {
        const n = counts?.[item.view]
        return (
          <button
            key={item.view}
            className={`gv-rail-btn ${active === item.view ? 'gv-rail-btn--active' : ''}`}
            title={describe(item)}
            aria-label={label(item.labelKey, item.fallback)}
            aria-keyshortcuts={keyForView(item.view)}
            aria-pressed={active === item.view}
            onClick={() => onSelect(item.view)}
          >
            {item.icon}
            {!!n && <span className="gv-rail-count" aria-hidden="true">{shortCount(n)}</span>}
          </button>
        )
      })}
      {hidden.length > 0 && (
        <button
          className={`gv-rail-btn ${activeHidden ? 'gv-rail-btn--active' : ''}`}
          title={label('rail.more', 'More…')}
          aria-label={label('rail.more', 'More…')}
          onClick={openMenu}
        >
          <Icon name="kebab" />
        </button>
      )}
      <div className="gv-rail-spacer" />
      {onPlacement && (
        <button
          className="gv-rail-btn"
          title={label('rail.side.placement', 'Side View Placement')}
          aria-label={label('rail.side.placement', 'Side View Placement')}
          aria-haspopup="menu"
          onClick={e => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setPlacementMenu({ x: r.right + 4, y: r.top })
          }}
        >
          <Icon name={placement === 'floating' ? 'layoutLeftFloat' : 'layoutLeft'} />
        </button>
      )}
      <button
        className="gv-rail-btn gv-rail-btn--soon"
        title={label('rail.board', 'Board (coming soon)')}
        aria-label={label('rail.board', 'Board (coming soon)')}
        disabled
      >
        {KANBAN_ICON}
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={hidden.map(item => ({
            label: counts?.[item.view] ? `${label(item.labelKey, item.fallback)} (${counts[item.view]})` : label(item.labelKey, item.fallback),
            checked: active === item.view,
            action: () => onSelect(item.view),
          }))}
          onClose={() => setMenu(null)}
        />
      )}
      {placementMenu && onPlacement && (
        <ContextMenu
          x={placementMenu.x}
          y={placementMenu.y}
          items={PLACEMENTS.map(p => ({
            label: t(p.labelKey),
            checked: (placement ?? 'auto') === p.value,
            action: () => onPlacement(p.value),
          }))}
          onClose={() => setPlacementMenu(null)}
        />
      )}
    </div>
  )
}
