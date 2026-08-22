// The Git Vertex icon set — every icon the interface draws, in one folder.
//
// ── The folder IS the source ────────────────────────────────────────────────
//
// Every icon is a real, standalone SVG in ./icons. To change one, edit that
// file. Nothing else: no path to copy into a TypeScript literal, no script to
// re-run, no second place that can drift. Adding one means dropping a .svg in
// the folder and importing it below.
//
// Each file is valid on its own — open it in a browser and it renders. Its
// viewBox and its fill/stroke are READ, not overridden: that is what lets the
// folder hold both families (see below) rather than only ours. What the wrapper
// still owns is the stroke WIDTH, which it grows as the icon shrinks, so a
// shape must never carry a `stroke-width` of its own. Colours that carry
// meaning are written `var(--token, #fallback)` so the token wins in the app
// and the fallback shows in a standalone preview.
//
// The three build systems that compile this file are configured to load .svg as
// text: electron.vite.config.ts (a pre-load hook), the extension's
// build-webview.js (esbuild's text loader), and jest (svgTransform.js).
//
// ── The set's rules ─────────────────────────────────────────────────────────
//
// The GIT VOCABULARY is ours and is drawn to it: grid 24, stroke 1.7, round
// caps, nodes as open RINGS and arrival points filled — the symbol's own
// vocabulary, so an icon and the logo read as one drawing. Node radius is 1.9
// everywhere; the larger circles (commit and history at 3.4, issue and ai at 8)
// are subjects, not nodes.
//
// The INTERFACE FURNITURE — chevrons, a magnifier, a bin — is not ours and is
// not redrawn to match. Those files are the drawings the app already used,
// moved here so there is one of each instead of the same magnifier pasted
// eight times. Most are filled silhouettes on a 16 grid, which is why the
// wrapper had to learn two families.
//
// `editor` is a code editor as a CATEGORY, not Visual Studio Code the product.
// Microsoft's actual mark lives in components/BrandMark, because a logo that
// belongs to someone else may not be redrawn to match our hand.

import activity from './icons/activity.svg'
import agent from './icons/agent.svg'
import ai from './icons/ai.svg'
import arrowRight from './icons/arrowRight.svg'
import arrowSwitch from './icons/arrowSwitch.svg'
import bell from './icons/bell.svg'
import blame from './icons/blame.svg'
import book from './icons/book.svg'
import branch from './icons/branch.svg'
import caretDown from './icons/caretDown.svg'
import check from './icons/check.svg'
import chevronDown from './icons/chevronDown.svg'
import chevronLeft from './icons/chevronLeft.svg'
import chevronRight from './icons/chevronRight.svg'
import clock from './icons/clock.svg'
import cloud from './icons/cloud.svg'
import commandPalette from './icons/commandPalette.svg'
import comment from './icons/comment.svg'
import commit from './icons/commit.svg'
import compare from './icons/compare.svg'
import conflict from './icons/conflict.svg'
import copy from './icons/copy.svg'
import device from './icons/device.svg'
import diff from './icons/diff.svg'
import download from './icons/download.svg'
import editor from './icons/editor.svg'
import externalLink from './icons/externalLink.svg'
import eye from './icons/eye.svg'
import eyeOff from './icons/eyeOff.svg'
import folder from './icons/folder.svg'
import gear from './icons/gear.svg'
import gitflow from './icons/gitflow.svg'
import history from './icons/history.svg'
import home from './icons/home.svg'
import hunk from './icons/hunk.svg'
import info from './icons/info.svg'
import ink from './icons/ink.svg'
import issue from './icons/issue.svg'
import kebab from './icons/kebab.svg'
import link from './icons/link.svg'
import list from './icons/list.svg'
import listTree from './icons/listTree.svg'
import mail from './icons/mail.svg'
import merge from './icons/merge.svg'
import newBranch from './icons/newBranch.svg'
import node from './icons/node.svg'
import panel from './icons/panel.svg'
import pencil from './icons/pencil.svg'
import person from './icons/person.svg'
import play from './icons/play.svg'
import plus from './icons/plus.svg'
import pop from './icons/pop.svg'
import pullRequest from './icons/pullRequest.svg'
import push from './icons/push.svg'
import rebase from './icons/rebase.svg'
import redo from './icons/redo.svg'
import reflog from './icons/reflog.svg'
import refresh from './icons/refresh.svg'
import repo from './icons/repo.svg'
import rocket from './icons/rocket.svg'
import search from './icons/search.svg'
import shield from './icons/shield.svg'
import sliders from './icons/sliders.svg'
import sort from './icons/sort.svg'
import staging from './icons/staging.svg'
import stash from './icons/stash.svg'
import tag from './icons/tag.svg'
import terminal from './icons/terminal.svg'
import trash from './icons/trash.svg'
import undo from './icons/undo.svg'
import worktree from './icons/worktree.svg'
import wrench from './icons/wrench.svg'

const SOURCE: Record<string, string> = {
  activity, agent, ai, arrowRight, arrowSwitch, bell, blame, book, branch,
  caretDown, check, chevronDown, chevronLeft, chevronRight, clock, cloud,
  commandPalette, comment, commit, compare, conflict, copy, device, diff,
  download, editor, externalLink, eye, eyeOff, folder, gear, gitflow,
  history, home, hunk, info, ink, issue, kebab, link, list, listTree, mail,
  merge, newBranch, node, panel, pencil, person, play, plus, pop,
  pullRequest, push, rebase, redo, reflog, refresh, repo, rocket, search,
  shield, sliders, sort, staging, stash, tag, terminal, trash, undo,
  worktree, wrench,
}

export type IconName = keyof typeof SOURCE

/**
 * ── Two families, and the FILE says which ──────────────────────────────────
 *
 * `stroke` is our own hand: grid 24, `fill="none"`, drawn in a stroke this
 * component thickens as the icon shrinks.
 *
 * `solid` is a filled silhouette — usually grid 16 and `fill="currentColor"`,
 * sometimes a token when the fill carries meaning. Most of the interface's
 * icons are that, and they are not ours to redraw: imposing a stroke on one
 * renders the OUTLINE of its silhouette, which is not the icon but a rubbing
 * of it. The file's own fill is passed through untouched.
 *
 * So the wrapper no longer dictates. It reads the file's own `viewBox` and
 * whether it declares a fill, and follows. That is what lets any icon live in
 * the folder and stay editable there, which is the whole point of the folder.
 */
const SVG_TAG = /<svg\b([^>]*)>([\s\S]*)<\/svg>/
interface Parsed { body: string; viewBox: string; fill: string | null }

const parsed: Record<string, Parsed> = Object.fromEntries(
  Object.entries(SOURCE).map(([name, src]) => {
    const m = SVG_TAG.exec(src)
    if (!m) throw new Error(`Icon: icons/${name}.svg has no <svg> element`)
    const attrs = m[1]
    const vb = /viewBox="([^"]+)"/.exec(attrs)
    if (!vb) throw new Error(`Icon: icons/${name}.svg has no viewBox`)
    // A file that declares ANY fill other than `none` is a silhouette, and the
    // fill is kept verbatim: matching on `currentColor` alone missed the ones
    // that fill with a token — PRModal's arrow is `fill="var(--accent)"`
    // — and reclassifying those as stroke drawings threw away both the fill and
    // the colour that carried the meaning.
    const f = /\bfill="([^"]+)"/.exec(attrs)
    const fill = f && f[1] !== 'none' ? f[1] : null
    return [name, { body: m[2].replace(/<!--[\s\S]*?-->/g, '').trim(), viewBox: vb[1], fill }]
  }),
)

/** Icons that stop being legible when the stroke is thickened for a small size. */
const DENSE = new Set<string>(['hunk', 'commandPalette'])

/**
 * The icons whose meaning is carried by NODES — a branch, a merge, a rebase.
 * A node is a 2.4-unit disc on a 24 grid, so at 11px it is 2.2 device pixels:
 * under three, a disc stops being a shape and becomes a smudge, and the mark
 * reads as a squiggle rather than a graph. Floored at 13, where the disc is a
 * clean 2.6px, the way DENSE floors the two icons with too much line in them.
 *
 * The floor is HERE rather than at the call sites so the rule holds wherever
 * one of these is drawn next, and so it cannot be applied to the chevrons and
 * carets that are deliberately 8 to 10.
 */
const NODED = new Set<string>([
  'branch', 'newBranch', 'merge', 'rebase', 'pullRequest',
  'worktree', 'gitflow', 'reflog', 'blame',
])

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
  const ic = parsed[name]
  if (!ic) throw new Error(`Icon: no icons/${name}.svg`)
  const s = DENSE.has(name) ? Math.max(size, 20) : NODED.has(name) ? Math.max(size, 13) : size

  // A silhouette has no stroke to grow, and growing one would be drawing on
  // somebody else's shape. Only our own family gets the size-aware weight.
  const paint = ic.fill
    ? { fill: ic.fill }
    : {
        fill: 'none' as const,
        stroke: 'currentColor',
        strokeWidth: strokeFor(s),
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      }

  return (
    <svg
      className={className}
      width={s}
      height={s}
      viewBox={ic.viewBox}
      {...paint}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      // The shapes come from a file we author and ship; nothing here is user
      // input, and injecting is what keeps the folder the single source.
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title}</title>` : '') + ic.body }}
    />
  )
}

export const ICON_NAMES = Object.keys(SOURCE) as IconName[]
