/**
 * The reveal of a model's answer, word by word — the writing is the feedback,
 * which is what makes a generation read as one instead of a paste.
 *
 * Presentation only, never state: the full text exists before the first word
 * shows, `flush` jumps to it, and `prefers-reduced-motion` (or a short
 * answer) skips the theatre entirely. `stop` is for unmount — it abandons the
 * animation without touching state that no longer exists.
 */
export interface Reveal { stop: () => void; flush: () => void }

export function revealText(
  full: string,
  write: (s: string) => void,
  done?: () => void,
): Reveal {
  const reduced = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || full.length < 12) {
    write(full); done?.()
    return { stop: () => {}, flush: () => {} }
  }
  // Word ends, so the reveal lands on boundaries a reader parses anyway.
  const steps: number[] = []
  const re = /\S+\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(full))) steps.push(m.index + m[0].length)
  let i = 0
  const id = setInterval(() => {
    i++
    if (i >= steps.length) { clearInterval(id); write(full); done?.(); return }
    write(full.slice(0, steps[i]))
  }, 14)
  return {
    stop: () => clearInterval(id),
    flush: () => { clearInterval(id); write(full); done?.() },
  }
}
