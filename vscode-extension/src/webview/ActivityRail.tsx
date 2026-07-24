import React, { useEffect, useRef, useState } from 'react'
import type { SidebarView } from '../../../src/renderer/src/components/Sidebar/Sidebar'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import ContextMenu from '../../../src/renderer/src/components/ContextMenu/ContextMenu'

// GitKraken-style vertical activity rail. Always visible on the left of the
// panel; each icon toggles the resizable side-panel for one Sidebar view.
// The kanban icon at the bottom is a placeholder for a future project-management
// feature (see docs-private/gitkraken-analysis.md § Project management).

interface RailItem {
  view: SidebarView
  labelKey: string
  fallback: string
  icon: React.ReactNode
}

const I = (d: string) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
)

const RobotIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5.5" width="10" height="7.5" rx="1.8" />
    <path d="M8 3.2V5.5" />
    <circle cx="8" cy="2.4" r="1" fill="currentColor" stroke="none" />
    <circle cx="6.2" cy="9" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="9.8" cy="9" r="0.9" fill="currentColor" stroke="none" />
    <path d="M1.5 8.5v2M14.5 8.5v2" />
  </svg>
)

// Worktree = a checked-out working copy: a framed "repo window" with a commit
// node on a branch line. Deliberately a framed/outlined shape so it never reads
// like the filled branch fork next to it in the rail.
const WorktreeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="11" rx="1.8" />
    <path d="M8 5v2M8 9.2v1.8" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)

const ITEMS: RailItem[] = [
  {
    view: 'overview', labelKey: 'rail.overview', fallback: 'Overview',
    icon: I('M6.906.664a1.749 1.749 0 0 1 2.187 0l5.25 4.2c.415.332.657.835.657 1.367v7.019A1.75 1.75 0 0 1 13.25 15h-3.5a.75.75 0 0 1-.75-.75V9.5h-2v4.75a.75.75 0 0 1-.75.75h-3.5A1.75 1.75 0 0 1 1 13.25V6.23c0-.531.242-1.034.657-1.366Z'),
  },
  {
    view: 'agents', labelKey: 'rail.agents', fallback: 'Agents',
    icon: <RobotIcon />,
  },
  {
    view: 'worktrees', labelKey: 'rail.worktrees', fallback: 'Worktrees',
    icon: <WorktreeIcon />,
  },
  {
    view: 'branches', labelKey: 'rail.branches', fallback: 'Branches',
    icon: I('M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z'),
  },
  {
    view: 'remotes', labelKey: 'rail.remotes', fallback: 'Remotes',
    icon: I('M4.5 13a3.5 3.5 0 0 1-.5-6.96 4.5 4.5 0 0 1 8.72-1.04A3.25 3.25 0 0 1 12 13H4.5Z'),
  },
  {
    view: 'stash', labelKey: 'rail.stash', fallback: 'Stash',
    icon: I('M1 3.5A1.5 1.5 0 0 1 2.5 2h8.75a.75.75 0 0 1 0 1.5H2.5a.5.5 0 0 0 0 1H8a1 1 0 0 1 1 1v3.75a.75.75 0 0 1-1.5 0V6H2.5A1.5 1.5 0 0 1 1 4.5v-1Zm3 9A1.5 1.5 0 0 1 2.5 11h1.25a.75.75 0 0 0 0-1.5H2.5A1.5 1.5 0 0 1 1 8v-.5a.75.75 0 0 1 1.5 0V8a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-.5a.75.75 0 0 1 1.5 0V8a1.5 1.5 0 0 1-1.5 1.5H4.5v1H14a.75.75 0 0 1 0 1.5H4.5v.5a.75.75 0 0 1-1.5 0v-.5Z'),
  },
  {
    view: 'tags', labelKey: 'rail.tags', fallback: 'Tags',
    icon: I('M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z'),
  },
]

const KANBAN_ICON = I('M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25ZM11.75 3a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-1.5 0v-7.5a.75.75 0 0 1 .75-.75Zm-8.25.75a.75.75 0 0 1 1.5 0v5.5a.75.75 0 0 1-1.5 0v-5.5ZM8 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 3Z')

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
          title={label('rail.more', 'Plus…')}
          aria-label={label('rail.more', 'Plus…')}
          onClick={openMenu}
        >
          {I('M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z')}
        </button>
      )}
      <div className="gv-rail-spacer" />
      <button
        className="gv-rail-btn gv-rail-btn--soon"
        title={label('rail.board', 'Board (bientôt)')}
        aria-label={label('rail.board', 'Board (bientôt)')}
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
