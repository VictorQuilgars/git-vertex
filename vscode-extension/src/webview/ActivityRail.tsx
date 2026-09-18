import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../../../src/renderer/src/components/Icon/Icon'
import type { SidebarView } from '../../../src/renderer/src/components/Sidebar/Sidebar'
import type { TranslationKey } from '../../../src/renderer/src/i18n/translations'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import ContextMenu from '../../../src/renderer/src/components/ContextMenu/ContextMenu'

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
// 12px vertical padding + the pinned kanban button + breathing room.
const reserved = (stride: number) => 12 + stride + 6

export default function ActivityRail({
  active, onSelect, compact,
}: {
  active: SidebarView | null
  onSelect: (v: SidebarView) => void
  /** The 36px rail of a narrow panel: smaller buttons, same icons. */
  compact?: boolean
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

  return (
    <div className={`gv-rail${compact ? ' gv-rail--compact' : ''}`} ref={railRef}>
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
          <Icon name="kebab" />
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
