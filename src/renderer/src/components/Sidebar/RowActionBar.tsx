// The one-click acts a side bar row shows on hover and on keyboard focus (#274).
import React from 'react'
import { Icon, type IconName } from '../Icon/Icon'
import type { RowActionId } from './rowActions'

/**
 * What each act is drawn and called as. The icon is the vocabulary the rest
 * of the app already uses for the same act — a pull is the download arrow in
 * the toolbar too — so a row teaches nothing new.
 */
const LOOK: Record<RowActionId, { icon: IconName; key: string; danger?: boolean }> = {
  pull: { icon: 'download', key: 'sb.row.pull' },
  push: { icon: 'push', key: 'sb.row.push' },
  // Publishing IS a push — `push --set-upstream`. The cloud said "the
  // remote", which is the section's own mark, not an act. The two never
  // appear on one row (a branch has an upstream or it has not), so one
  // arrow for both reads as the same gesture rather than as two.
  publish: { icon: 'push', key: 'sb.row.publish' },
  fetch: { icon: 'refresh', key: 'sb.row.fetch' },
  switch: { icon: 'switchBranch', key: 'sb.row.switch' },
  card: { icon: 'info', key: 'sb.row.card' },
  open: { icon: 'externalLink', key: 'sb.row.open' },
  apply: { icon: 'download', key: 'sb.row.apply' },
  pop: { icon: 'pop', key: 'sb.row.pop' },
  delete: { icon: 'trash', key: 'sb.row.delete', danger: true },
}

/**
 * `handlers` decides what is drawn as much as `actions` does: an act the
 * state calls for but the host never wired is left out rather than drawn dead
 * — the rule every menu in this panel already follows.
 *
 * The buttons are real buttons in the DOM whatever the pointer is doing, so
 * the keyboard reaches them; CSS is what hides them until the row is hovered
 * or something inside it has the focus.
 */
export function RowActionBar({ actions, handlers, t, label }: {
  actions: readonly RowActionId[]
  handlers: Partial<Record<RowActionId, (() => void) | undefined>>
  t: (k: any, ...a: any[]) => string
  /** What the row is, for the screen reader: "Pull: feat/x". */
  label: string
}) {
  const shown = actions.filter(a => handlers[a])
  if (!shown.length) return null
  return (
    <span className="sb-row-actions">
      {shown.map(id => {
        const look = LOOK[id]
        const name = t(look.key)
        return (
          <button key={id} type="button"
            className={`sb-row-action${look.danger ? ' sb-row-action--danger' : ''}`}
            title={name} aria-label={`${name}: ${label}`}
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); handlers[id]?.() }}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            onDoubleClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <Icon name={look.icon} size={12} />
          </button>
        )
      })}
    </span>
  )
}
