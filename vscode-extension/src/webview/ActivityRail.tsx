import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import type { SidebarView } from '../../../src/renderer/src/components/Sidebar/Sidebar'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import ContextMenu from '../../../src/renderer/src/components/ContextMenu/ContextMenu'

// Vertical activity rail. Always visible on the left of the
// panel; each icon toggles the resizable side-panel for one Sidebar view.
// The kanban icon at the bottom is a placeholder for a future project-management
// feature (see the competitive analysis in docs-private/).

interface RailItem {
  view: SidebarView
  labelKey: string
  fallback: string
  icon: React.ReactNode
}




const ITEMS: RailItem[] = [
  {
    view: 'overview', labelKey: 'rail.overview', fallback: 'Overview',
    icon: <Icon name="home" />,
  },
  {
    view: 'agents', labelKey: 'rail.agents', fallback: 'Agents',
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
]

const KANBAN_ICON = <Icon name="panel" />

// One icon slot = 34px button + 2px flex gap.
const STRIDE = 36
// Rail chrome that is never part of the scrollable icon column:
// 12px vertical padding + the pinned kanban button (34) + breathing room.
const RESERVED = 12 + STRIDE + 6

export default function ActivityRail({
  active, onSelect,
}: {
  active: SidebarView | null
  onSelect: (v: SidebarView) => void
}) {
  const { t } = useLang()
  const label = (key: string, fallback: string) => {
    const s = t(key)
    return s === key ? fallback : s
  }

  // When the panel is too short to show every icon, the ones that don't fit
  // move into a "…" overflow menu — icons keep their fixed size, never shrink.
  const railRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(ITEMS.length)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    const compute = () => {
      const forIcons = el.clientHeight - RESERVED
      let n = Math.floor(forIcons / STRIDE)
      if (n < ITEMS.length) n = Math.max(0, n - 1) // reserve a slot for the "…" button
      setVisible(Math.min(ITEMS.length, Math.max(0, n)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const shown = ITEMS.slice(0, visible)
  const hidden = ITEMS.slice(visible)
  const activeHidden = hidden.some(i => i.view === active)

  const openMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: r.right + 4, y: r.top })
  }

  return (
    <div className="gv-rail" ref={railRef}>
      {shown.map(item => (
        <button
          key={item.view}
          className={`gv-rail-btn ${active === item.view ? 'gv-rail-btn--active' : ''}`}
          title={label(item.labelKey, item.fallback)}
          aria-label={label(item.labelKey, item.fallback)}
          aria-pressed={active === item.view}
          onClick={() => onSelect(item.view)}
        >
          {item.icon}
        </button>
      ))}
      {hidden.length > 0 && (
        <button
          className={`gv-rail-btn ${activeHidden ? 'gv-rail-btn--active' : ''}`}
          title={label('rail.more', 'More…')}
          aria-label={label('rail.more', 'More…')}
          onClick={openMenu}
        >
          {I('M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z')}
        </button>
      )}
      <div className="gv-rail-spacer" />
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
            label: label(item.labelKey, item.fallback),
            checked: active === item.view,
            action: () => onSelect(item.view),
          }))}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
