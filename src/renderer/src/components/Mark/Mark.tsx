// The Git Vertex symbol, as one component with the cuts it actually needs.
//
// It exists so the drawing is not copied by hand into every place that shows
// it. That has already gone wrong twice on this mark: the lockups kept dashed
// commits for a while after the symbol moved to dots, and the welcome screen's
// copy drifted from resources/icon.svg by a few units. token-discipline.test.ts
// now checks the welcome screen against the icon; this component is why there is
// only one other copy to check.
//
// Cuts, and why there is more than one. The intermediate commit nodes are 9
// units of stroke on a 416-unit mark, so below roughly 72px of rendered height
// they go sub-pixel and the node turns to grey mush. Under that, they come off.
//
//   full   3 nodes per branch   >= 72px   the whole story, dotted nodes included
//   lite   1 node per branch    24-72px   head rings and the vertex
//   bare   0 nodes              <= 24px   the silhouette, vertex solid
//
// ONE INK. The arms were --accent-static and --purple-soft; they are the text
// ink now, and the only thing telling them apart is the dotting on the right —
// which is what already carried the sealed/proposed distinction at every size
// where the dots survive, and at 'bare' there are no nodes to tell apart anyway.
//
// The reason is not economy, it is that a two-hue mark can only ever suit the
// theme it was drawn for. Set in the text ink, the mark belongs to whichever
// theme is on — including one the user brought themselves.
//
// Generated geometry — from docs-private/logo-piste-g/logo.py. To redraw, edit
// the script and re-run it; the ink follows tokens.css on its own.

/** The vertex: a real annulus, so the hole is a hole on any surface. */
const VERTEX_FULL = 'M214 422a42 42 0 1 0 84 0a42 42 0 1 0 -84 0ZM239 422a17 17 0 1 0 34 0a17 17 0 1 0 -34 0Z'
const VERTEX_LITE = 'M204 422a52 52 0 1 0 104 0a52 52 0 1 0 -104 0ZM235 422a21 21 0 1 0 42 0a21 21 0 1 0 -42 0Z'

export type MarkCut = 'full' | 'lite' | 'bare'

interface Props {
  size?: number
  cut?: MarkCut
  /** One ink — inherits `currentColor`. For toolbars and menu-bar glyphs. */
  mono?: boolean
  className?: string
  /** Decorative by default; give it a label when it is the only naming. */
  title?: string
}

export function Mark({ size = 32, cut, mono = false, className, title }: Props) {
  // Pick the cut from the rendered size unless the caller insists.
  const c: MarkCut = cut ?? (size >= 72 ? 'full' : size > 24 ? 'lite' : 'bare')
  // `mono` no longer changes the drawing, only where the ink comes from:
  // currentColor for a glyph that must take its parent's colour (toolbar,
  // menu bar), the text token everywhere else.
  const ink = mono ? 'currentColor' : 'var(--text-primary)'

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}

      {c === 'full' && (
        <>
          <path d="M142.5 119.2L160.2 166.6" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <path d="M183.8 229.4L202.2 278.6" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <path d="M225.8 341.4L247.2 398.6" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <circle cx="130" cy="86" r="33" stroke={ink} strokeWidth="11"/>
          <circle cx="172" cy="198" r="30" stroke={ink} strokeWidth="9"/>
          <circle cx="214" cy="310" r="30" stroke={ink} strokeWidth="9"/>
          <path d="M369.5 119.2L350.5 169.9" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <path d="M329.5 226.1L308.5 281.9" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <path d="M287.5 338.1L264.8 398.6" stroke={ink} strokeWidth="16" strokeLinecap="round"/>
          <circle cx="382" cy="86" r="33" stroke={ink} strokeWidth="11"/>
          <circle cx="340" cy="198" r="30" stroke={ink} strokeWidth="12" strokeLinecap="round" strokeDasharray="0 18.85" transform="rotate(110.6 340 198)"/>
          <circle cx="298" cy="310" r="30" stroke={ink} strokeWidth="12" strokeLinecap="round" strokeDasharray="0 18.85" transform="rotate(110.6 298 310)"/>
          <path d={VERTEX_FULL} fill={ink} fillRule="evenodd"/>
        </>
      )}

      {c === 'lite' && (
        <>
          <path d="M147.0 131.4L242.0 384.5" stroke={ink} strokeWidth="38" strokeLinecap="round"/>
          <circle cx="130" cy="86" r="38" stroke={ink} strokeWidth="17"/>
          <path d="M365.0 131.4L270.0 384.5" stroke={ink} strokeWidth="38" strokeLinecap="round"/>
          <circle cx="382" cy="86" r="38" stroke={ink} strokeWidth="17"/>
          <path d={VERTEX_LITE} fill={ink} fillRule="evenodd"/>
        </>
      )}

      {c === 'bare' && (
        <>
          <path d="M130 86L234.2 363.9" stroke={ink} strokeWidth="54" strokeLinecap="round"/>
          <path d="M382 86L277.8 363.9" stroke={ink} strokeWidth="54" strokeLinecap="round"/>
          <circle cx="256" cy="422" r="62" fill={ink}/>
        </>
      )}
    </svg>
  )
}
