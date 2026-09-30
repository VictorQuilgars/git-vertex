/**
 * A key per side bar view (#277): `1` to `9`, in the rail's order.
 *
 * Why digits, and why bare:
 *
 * - The graph already owns plain LETTERS — `w` `h` `u` `t`, `/`, `?` — and the
 *   sheet `?` opens promises "plain keys, never a chord". Digits are the one
 *   row of plain keys nothing here uses, and there are exactly nine views.
 * - A chord would collide in VS Code. The webview forwards every keydown to
 *   the workbench, which owns ⌘1–9 / Ctrl+1–9 (focus an editor group) and
 *   Alt+1–9 on Windows and Linux (open the nth editor); on a Mac, Alt+digit is
 *   a character (¡ ™ £). A bare digit is bound to nothing in the workbench
 *   while the focus is in a webview.
 * - Never while typing: a digit in the filter field, the commit message or a
 *   prompt is a digit.
 *
 * The desktop has no rail, but it has the same views stacked in one column;
 * the same keys bring each one into view there (STACKED_SECTION).
 */
import type { SidebarView } from './types'

/** The rail's order — the panel's ActivityRail draws its icons in it. */
export const SIDEBAR_VIEWS: readonly SidebarView[] = [
  'overview', 'ai', 'worktrees', 'branches', 'remotes', 'stash', 'tags', 'prs', 'issues',
]

/** The key that opens a view, as it is shown. */
export function keyForView(view: SidebarView): string {
  return String(SIDEBAR_VIEWS.indexOf(view) + 1)
}

/**
 * The section a view is in the desktop's stacked column, or null for a view
 * that is a whole tab there rather than a section of one (`overview` is the
 * list tab itself, `ai` the AI tab).
 */
export const STACKED_SECTION: Record<SidebarView, string | null> = {
  overview: null, ai: null,
  worktrees: 'worktrees', branches: 'local', remotes: 'remotes', stash: 'stash',
  tags: 'tags', prs: 'prs', issues: 'issues',
}

/** Something that has the keyboard for itself: a dialog, a menu, a drawer, the panel's settings. */
const OWNS_KEYS = '.dlg-overlay, .gv-settings-overlay, [role="dialog"], [role="menu"], .ctx-menu, .pdrawer'

/**
 * The view a key press asks for, or null when it asks for none — a chord, a
 * held key, a field being typed in, or something on top that has the keys.
 */
export function viewForKey(e: KeyboardEvent): SidebarView | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null
  if (!/^[1-9]$/.test(e.key)) return null
  const el = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return null
  if (typeof document !== 'undefined' && document.querySelector(OWNS_KEYS)) return null
  return SIDEBAR_VIEWS[Number(e.key) - 1] ?? null
}
