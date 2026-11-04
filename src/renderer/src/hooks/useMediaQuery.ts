import { useEffect, useState } from 'react'

/**
 * Whether a media query matches, kept current.
 *
 * It listens to the query's own `change` AND to the window's `resize`, and
 * re-reads `media.matches` on either. The `change` event alone is delivered
 * when the browser next evaluates media queries — on a frame — and a window
 * that produces none (occluded, or resized by emulation as `npm run e2e` does)
 * can sit on a width it has already reached while the toolbar stays compact:
 * `matchMedia(q).matches` answered correctly when asked, and nothing asked
 * (#245). `resize` is dispatched with the new viewport, and reading `matches`
 * there is the ask. React drops the second `setMatches` of an unchanged value,
 * so hearing both costs nothing.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia?.(query).matches ?? false)
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    window.addEventListener('resize', update)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [query])
  return matches
}
