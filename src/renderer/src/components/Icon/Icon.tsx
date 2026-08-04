// The Git Vertex icon set — 25 domain icons, drawn in the same hand as the mark.
//
// ── The folder IS the source ────────────────────────────────────────────────
//
// Every icon is a real, standalone SVG in ./icons. To change one, edit that
// file. Nothing else: no path to copy into a TypeScript literal, no script to
// re-run, no second place that can drift. Adding one means dropping a .svg in
// the folder and importing it below.
//
// Each file is valid on its own — open it in a browser and it renders, because
// it carries its own viewBox, stroke and caps. Those are ignored once injected
// here: the wrapper below sets them, which is what lets the stroke grow as the
// icon shrinks. Colours that carry meaning are written `var(--token, #fallback)`
// so the token wins in the app and the fallback shows in a standalone preview.
//
// The three build systems that compile this file are configured to load .svg as
// text: electron.vite.config.ts (a pre-load hook), the extension's
// build-webview.js (esbuild's text loader), and jest (svgTransform.js).
//
// ── The set's rules ─────────────────────────────────────────────────────────
//
// Grid 24, stroke 1.7, round caps. Nodes are open RINGS, arrival points are
// filled — the vocabulary of the symbol itself, so an icon and the logo read as
// one drawing. Node radius is 1.9 everywhere; the larger circles (commit and
// history at 3.4, issue and ai at 8) are subjects, not nodes.
//
// `editor` is a code editor as a CATEGORY, not Visual Studio Code the product.
// Microsoft's actual mark lives in components/BrandMark, because a logo that
// belongs to someone else may not be redrawn to match our hand.

import agent from './icons/agent.svg'
import ai from './icons/ai.svg'
import blame from './icons/blame.svg'
import commandPalette from './icons/commandPalette.svg'
import commit from './icons/commit.svg'
import compare from './icons/compare.svg'
import conflict from './icons/conflict.svg'
import diff from './icons/diff.svg'
import download from './icons/download.svg'
import editor from './icons/editor.svg'
import gitflow from './icons/gitflow.svg'
import graph from './icons/graph.svg'
import history from './icons/history.svg'
import hunk from './icons/hunk.svg'
import issue from './icons/issue.svg'
import merge from './icons/merge.svg'
import newBranch from './icons/newBranch.svg'
import pop from './icons/pop.svg'
import pullRequest from './icons/pullRequest.svg'
import push from './icons/push.svg'
import rebase from './icons/rebase.svg'
import redo from './icons/redo.svg'
import reflog from './icons/reflog.svg'
import repo from './icons/repo.svg'
import staging from './icons/staging.svg'
import stash from './icons/stash.svg'
import tag from './icons/tag.svg'
import terminal from './icons/terminal.svg'
import undo from './icons/undo.svg'
import worktree from './icons/worktree.svg'

const SOURCE: Record<string, string> = {
  agent, ai, blame, commandPalette, commit, compare, conflict, diff,
  download, editor, gitflow, graph, history, hunk, issue, merge, newBranch,
  pop, pullRequest, push, rebase, redo, reflog, repo, staging, stash, tag,
  terminal, undo, worktree,
}

export type IconName = keyof typeof SOURCE

/**
 * The shapes inside a file, without its `<svg>` wrapper or comments — the
 * wrapper's own stroke and viewBox belong to the standalone preview, not to the
 * icon as rendered here.
 */
const INNER = /<svg\b[^>]*>([\s\S]*)<\/svg>/
const bodies: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCE).map(([name, src]) => {
    const m = INNER.exec(src)
    if (!m) throw new Error(`Icon: icons/${name}.svg has no <svg> element`)
    return [name, m[1].replace(/<!--[\s\S]*?-->/g, '').trim()]
  }),
)

/** Icons that stop being legible when the stroke is thickened for a small size. */
const DENSE = new Set<string>(['hunk', 'commandPalette'])

/**
 * A 1.7 stroke on a 24 grid is 1.7px at 24 and 1.13px at 16 — under the pixel,
 * so it greys out. Hold a rendered 1.5px below 24, which means growing the
 * authored width as the size falls. The geometry is authored once.
 *
 * That has a limit: thickening closes tight gaps. `hunk` and `commandPalette`
 * carry lines 3 and 3.5 units apart, leaving 0.5px and 0.8px of daylight at 16.
 * Both refuse to render under 20px rather than turn to a smudge.
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
  const body = bodies[name]
  if (!body) throw new Error(`Icon: no icons/${name}.svg`)
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
      // The shapes come from a file we author and ship; nothing here is user
      // input, and injecting is what keeps the folder the single source.
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + body }}
    />
  )
}

export const ICON_NAMES = Object.keys(SOURCE) as IconName[]
