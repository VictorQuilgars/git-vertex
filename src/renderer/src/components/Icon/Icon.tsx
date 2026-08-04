// The Git Vertex icon set — 25 domain icons, drawn in the same hand as the mark.
//
// Grid 24, stroke 1.7, round caps. Nodes are open RINGS, arrival points are
// filled — the vocabulary of the symbol itself, so an icon and the logo read as
// one drawing.
//
// ── Two things this file fixes in the board it comes from ───────────────────
//
// 1. Node radii were 1.7, 1.8, 1.9 and 2.1 across six icons for what is the
//    same thing: a commit. And the arrival point was r=1 in `graph` but r=1.9 in
//    `merge`. All normalised to 1.9. The larger circles that remain (commit 3.4,
//    history 3.4, issue and ai 7.5) are subjects, not nodes, and stay.
//
// 2. Stroke 1.7 on a 24 grid renders at 1.13px when the icon is drawn at 16 —
//    under the pixel, so it greys out. `strokeFor` below thickens the stroke as
//    the size drops, holding a rendered 1.5px. The geometry is authored once.
//
//    That has a limit: thickening closes tight gaps. `hunk` and `commandPalette`
//    carry lines 3 and 3.5 units apart, which at 16px leave 0.5px and 0.8px of
//    daylight. Both are listed in DENSE below and refuse to go under 20px — ask
//    for a smaller size and you get 20, rather than a smudge.
//
// Colours: everything inherits `currentColor` except the few strokes that carry
// meaning — a conflict is always the conflict colour, a diff's + and - are
// always add and remove. Those come from tokens, so they follow the theme.

interface Ink {
  aqua: string; iris: string; conflict: string; add: string; del: string
}

const INK: Ink = {
  aqua: 'var(--accent-static)',
  iris: 'var(--purple-soft)',
  conflict: 'var(--conflict)',
  add: 'var(--success)',
  del: 'var(--danger)',
}

const PAINT: Record<string, (C: Ink) => JSX.Element> = {
  agent: (C: Ink) => <><rect x="4.5" y="9" width="15" height="11.5" rx="3"/><path d="M12 5.5V9M2.5 13.5v3M21.5 13.5v3"/><circle cx="12" cy="4.4" r="1.5" fill="currentColor" stroke="none"/><circle cx="9.3" cy="14.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="14.7" cy="14.5" r="1.5" fill="currentColor" stroke="none"/></>,
  ai: (C: Ink) => <><circle cx="12" cy="12" r="8" strokeDasharray="0 4.19"/><path d="M8.8 12a3.2 3.2 0 1 0 6.4 0a3.2 3.2 0 1 0 -6.4 0ZM10.7 12a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z" fill="currentColor" stroke="none" fillRule="evenodd"/></>,
  blame: (C: Ink) => <><path d="M5 4v16M9.5 7h10M9.5 12h10M9.5 17h10"/><circle cx="5" cy="12" r="1.9" stroke={C.aqua}/></>,
  commandPalette: (C: Ink) => <><rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M7 11h10M7 14.5h5"/></>,
  commit: (C: Ink) => <><circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v6M12 15.5v6"/></>,
  compare: (C: Ink) => <><path d="M7 4v16M17 4v16"/><path d="M9.5 9h5M12.7 7l2 2-2 2M14.5 15h-5M11.3 13l-2 2 2 2"/></>,
  conflict: (C: Ink) => <><path d="M12 4v16" strokeDasharray="2.4 2.8" stroke={C.conflict}/><path d="M7 8l-3.5 4L7 16M17 8l3.5 4L17 16"/></>,
  diff: (C: Ink) => <><path d="M12 3v18"/><path d="M4.5 9h5M7 6.5v5" stroke={C.add}/><path d="M14.5 15.5h5" stroke={C.del}/></>,
  download: (C: Ink) => <><path d="M12 3.5V15M8 11.2l4 4 4-4M5 20h14"/></>,
  graph: (C: Ink) => <><path d="M8 6.5v13M8 13c0-5 8-3 8-6.5"/><circle cx="8" cy="4.5" r="1.9"/><circle cx="16" cy="4.5" r="1.9"/><circle cx="8" cy="19.5" r="1.9" fill="currentColor" stroke="none"/></>,
  history: (C: Ink) => <><path d="M6.5 3h6.5L17.5 7.5V21H6.5z"/><circle cx="12" cy="13.5" r="3.4"/><path d="M12 11.8v1.7l1.4.9"/></>,
  hunk: (C: Ink) => <><path d="M8 4H5v16h3M16 4h3v16h-3"/><path d="M10 9h5M10 12h5M10 15h3"/></>,
  issue: (C: Ink) => <><circle cx="12" cy="12" r="7.5"/><path d="M12 8v4.5"/><circle cx="12" cy="15.8" r="1" fill="currentColor" stroke="none"/></>,
  merge: (C: Ink) => <><path d="M7 5l5 12M17 5l-5 12v4"/><circle cx="7" cy="5" r="1.9"/><circle cx="17" cy="5" r="1.9"/><circle cx="12" cy="18" r="1.9" fill="currentColor" stroke="none"/></>,
  pullRequest: (C: Ink) => <><circle cx="6" cy="6" r="1.9"/><path d="M6 8.2v7.6"/><circle cx="6" cy="18" r="1.9" fill="currentColor" stroke="none"/><path d="M11.5 6H15a3 3 0 0 1 3 3v6.6"/><circle cx="18" cy="18" r="1.9"/></>,
  rebase: (C: Ink) => <><path d="M4 15.5h16"/><circle cx="7" cy="15.5" r="1.9"/><circle cx="13" cy="15.5" r="1.9"/><path d="M7 11.5c2-6 8-6 10 0M17 8V11.5h-3.5"/></>,
  reflog: (C: Ink) => <><path d="M6 7.2A7.6 7.6 0 1 1 4.4 13"/><path d="M6.5 3.8v3.6H2.9"/><circle cx="11.9" cy="12" r="1.9"/></>,
  repo: (C: Ink) => <><path d="M6.5 3H19v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z"/><circle cx="8.3" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.3" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="8.3" cy="16.5" r="1.2" fill="currentColor" stroke="none"/></>,
  staging: (C: Ink) => <><path d="M5 14v5.5h14V14"/><path d="M12 4.5V13M8.8 7.7L12 4.5l3.2 3.2"/></>,
  stash: (C: Ink) => <><rect x="4.5" y="13" width="15" height="7" rx="1.5"/><path d="M10 16.5h4M12 4v5.5M9.8 7.3L12 9.5l2.2-2.2"/></>,
  tag: (C: Ink) => <><path d="M4.5 5v6l9 9 6-6-9-9h-6z"/><circle cx="8.2" cy="8.7" r="1.5"/></>,
  terminal: (C: Ink) => <><rect x="3" y="4.5" width="18" height="15" rx="1.5"/><path d="M7 9.5l3 2.8-3 2.8M13 15.5h4"/></>,
  undo: (C: Ink) => <><path d="M4 9.5h10.5a5 5 0 0 1 0 10H9M7.5 6L4 9.5 7.5 13"/></>,
  vscode: (C: Ink) => <><rect x="4.5" y="3" width="15" height="18" rx="1.5"/><path d="M9.5 3v18"/><path d="M13.5 10l-1.8 2.2 1.8 2.2M16.8 10l1.8 2.2-1.8 2.2"/></>,
  worktree: (C: Ink) => <><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M12 7.5v2.6M12 13.9v2.6"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/></>,
}

export type IconName = keyof typeof PAINT

/** Icons that stop being legible when the stroke is thickened for a small size. */
const DENSE = new Set<string>(['hunk', 'commandPalette'])

/**
 * A 1.7 stroke on a 24 grid is 1.7px at 24 and 1.13px at 16. Hold a rendered
 * 1.5px below 24, which means growing the authored width as the size falls.
 */
function strokeFor(size: number): number {
  return Math.max(1.7, (1.5 * 24) / size)
}

interface Props {
  name: IconName
  size?: number
  className?: string
  /** Decorative by default. Give it a label when the icon is the only naming. */
  title?: string
}

export function Icon({ name, size = 16, className, title }: Props) {
  const s = DENSE.has(name) ? Math.max(size, 20) : size
  return (
    <svg
      className={className}
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(s)}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PAINT[name](INK)}
    </svg>
  )
}

export const ICON_NAMES = Object.keys(PAINT) as IconName[]
