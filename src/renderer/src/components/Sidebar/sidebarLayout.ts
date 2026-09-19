/**
 * List or tree, per side bar view, remembered (#276).
 *
 * A ref name is a path, so LOCAL and REMOTE have always been trees and TAGS
 * has always been flat — each the right answer for somebody and the wrong one
 * for somebody else, with no way to say which. The shape is a choice now, one
 * per view, kept on this machine.
 *
 * The default per view is what that view already did, so nothing moved for
 * anyone the day this arrived.
 */

export type SbLayout = 'list' | 'tree'

/** The views whose names hold slashes — the only ones a tree says anything about. */
export type SbLayoutView = 'local' | 'remote' | 'tags'

const KEY = 'gv:sb-layout:'

const DEFAULTS: Record<SbLayoutView, SbLayout> = {
  local: 'tree',
  remote: 'tree',
  tags: 'list',
}

export function readLayout(view: SbLayoutView): SbLayout {
  try {
    const v = localStorage.getItem(KEY + view)
    return v === 'list' || v === 'tree' ? v : DEFAULTS[view]
  } catch { return DEFAULTS[view] }
}

export function writeLayout(view: SbLayoutView, layout: SbLayout): void {
  try { localStorage.setItem(KEY + view, layout) } catch { /* private mode */ }
}

/**
 * Does anything in this list read as a path? A toggle over `main`, `dev` and
 * `wip` promises a tree that would be the same list with nothing in front of
 * it — so the toggle is not offered.
 */
export function hasPaths(names: readonly string[]): boolean {
  return names.some(n => n.includes('/'))
}

/**
 * The one filter the side bar's field applies, wherever it is applied (#276).
 *
 * Case-insensitive substring over the whole name, which is the rule the
 * branch filter has always used and the one a path makes sense under:
 * `feat/ui` finds `feat/ui-cards`, and `ui` finds it too.
 */
export function matchesFilter(text: string, query: string): boolean {
  const q = query.trim().toLowerCase()
  return !q || text.toLowerCase().includes(q)
}
