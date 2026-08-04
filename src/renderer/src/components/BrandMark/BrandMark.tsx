// Third-party marks. GitHub, Git, VS Code — logos that belong to someone else.
//
// ── Why these are not in components/Icon ────────────────────────────────────
//
// The icon set is ours: 25 stroke drawings on a 24 grid that inherit
// currentColor, follow the theme, and re-weight as they shrink. A brand mark is
// none of that. It is a fixed, usually filled shape that its owner defines, and
// the one thing we may not do is redraw it. Mixing the two families meant our
// `vscode` icon was competing with Microsoft's actual logo for the same meaning,
// and the octocat was sitting loose in App.tsx as a hand-pasted path.
//
// So: this module holds marks we DISPLAY. components/Icon holds drawings we OWN.
//
// ── The rules that come with them ───────────────────────────────────────────
//
// Showing a third party's mark to say "this works with their product" is
// nominative use and is what these marks are for. The conditions are the usual
// ones, and they are the reason this file exists rather than a folder of pasted
// paths:
//
//   - never redraw or approximate the geometry. A path typed from memory is a
//     MODIFIED trademark, which is worse than not using it at all.
//   - never restyle beyond what the owner allows. GitHub publishes its mark as
//     an Octicon meant to take currentColor; Git's is officially #F05032 but is
//     routinely set in one ink. Both are marked `mono: true` below.
//   - never imply endorsement, and never use one as our own product icon.
//
// Verify against each owner's brand guidelines before a release that adds one.

const BRAND_ORANGE_GIT = '#F05032'

interface Mark {
  /** Official path data. Do not edit — replace wholesale from the owner's asset. */
  path: string
  viewBox: string
  /** Owner's own colour, when the mark has one and monochrome is not offered. */
  colour?: string
  /** True when the owner publishes the mark for single-ink use. */
  mono: boolean
  /** Some marks carry a subpath that must be punched, not filled. */
  evenOdd?: boolean
  label: string
}

const MARKS: Record<string, Mark> = {
  // GitHub's mark-github Octicon, shipped by GitHub for exactly this use and
  // designed to take currentColor.
  github: {
    viewBox: '0 0 16 16',
    mono: true,
    label: 'GitHub',
    path: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z',
  },

  // The Git project's mark. Officially #F05032; single-ink use is standard and
  // is what the activity bar needs, so it is offered both ways.
  git: {
    viewBox: '0 0 16 16',
    mono: true,
    colour: BRAND_ORANGE_GIT,
    label: 'Git',
    path: 'M15.698 7.287 8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 0 1 1.55 1.56l1.773 1.774a1.224 1.224 0 0 1 1.267 2.025 1.226 1.226 0 0 1-2.002-1.334L8.58 5.963v4.353a1.226 1.226 0 1 1-1.008-.036V5.887a1.226 1.226 0 0 1-.666-1.608L5.093 2.465l-4.79 4.79a1.03 1.03 0 0 0 0 1.457l6.986 6.986a1.03 1.03 0 0 0 1.457 0l6.953-6.953a1.031 1.031 0 0 0-.001-1.458z',
  },

  // Microsoft's Visual Studio Code mark, taken verbatim from the inline SVG on
  // code.visualstudio.com — the copy Microsoft themselves serve. Not traced, not
  // reconstructed: the path below is byte-for-byte what their own site renders.
  //
  // `mono: true` is not our choice either. Their site sets fill="currentColor"
  // on this very element, so single-ink use is how the owner uses it. The mark
  // has no colour of its own in this form, which is why `colour` is absent.
  //
  // It needs fillRule evenodd — the notch that makes the ribbon read as folded
  // is a subpath, and without the rule it fills in and the mark turns to a blob.
  vscode: {
    viewBox: '0 0 100 100',
    mono: true,
    label: 'Visual Studio Code',
    evenOdd: true,
    path: 'M70.912 99.317a6.223 6.223 0 0 0 4.96-.19l20.589-9.907A6.25 6.25 0 0 0 100 83.587V16.413a6.25 6.25 0 0 0-3.54-5.632L75.874.874a6.226 6.226 0 0 0-7.104 1.21L29.355 38.04 12.187 25.01a4.162 4.162 0 0 0-5.318.236l-5.506 5.009a4.168 4.168 0 0 0-.004 6.162L16.247 50 1.36 63.583a4.168 4.168 0 0 0 .004 6.162l5.506 5.01a4.162 4.162 0 0 0 5.318.236l17.168-13.032L68.77 97.917a6.217 6.217 0 0 0 2.143 1.4ZM75.015 27.3 45.11 50l29.906 22.701V27.3Z',
  },
}

export type BrandName = keyof typeof MARKS

interface Props {
  name: BrandName
  size?: number
  /** Draw in one ink, inheriting currentColor. Only for marks that allow it. */
  mono?: boolean
  className?: string
  title?: string
}

export function Brand({ name, size = 16, mono = true, className, title }: Props) {
  const m = MARKS[name]
  if (!m) throw new Error(`BrandMark: no asset for "${name}" — see the note in BrandMark.tsx`)

  // Asking for one ink on a mark whose owner does not offer it would be a
  // restyling, so the mark's own colour wins.
  const fill = mono && m.mono ? 'currentColor' : (m.colour ?? 'currentColor')

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={m.viewBox}
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title ?? m.label}</title>}
      <path d={m.path} fillRule={m.evenOdd ? 'evenodd' : undefined}
            clipRule={m.evenOdd ? 'evenodd' : undefined} />
    </svg>
  )
}

export const BRAND_NAMES = Object.keys(MARKS) as BrandName[]
