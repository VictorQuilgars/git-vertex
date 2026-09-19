// The light markup a commit message is written in — `code`, **bold**, *italic*
// or _italic_ — drawn in a graph row, and nothing heavier: no links, no
// headings, no lists. A message is one line of a row; this only styles runs
// inside it.
import { Fragment, type ReactNode } from 'react'

/**
 * A run needs a non-space just inside its delimiters, so `3 * 4` is not
 * italic; `_` only counts at word boundaries, so `snake_case` stays whole; bold
 * is tried before italic so `**x**` is not two empty italics.
 */
const INLINE_MARKUP = /`([^`]+)`|\*\*(\S(?:[^*]*\S)?)\*\*|\*(\S(?:[^*]*\S)?)\*|\b_(\S(?:[^_]*\S)?)_\b/g

/**
 * `message` with its runs drawn. The text between them goes through `text` —
 * the subject's issue references become links there. A message with no
 * delimiter at all, or none that forms a run, is handed to `text` whole.
 */
export function inlineMarkup(message: string, text: (s: string) => ReactNode = s => s): ReactNode {
  if (!/[`*_]/.test(message)) return text(message)
  const parts: ReactNode[] = []
  let last = 0
  for (const m of message.matchAll(INLINE_MARKUP)) {
    const at = m.index ?? 0
    if (at > last) parts.push(<Fragment key={`t${last}`}>{text(message.slice(last, at))}</Fragment>)
    parts.push(m[1] != null ? <code key={at} className="cg-msg-code">{m[1]}</code>
      : m[2] != null ? <strong key={at}>{m[2]}</strong>
      : <em key={at}>{m[3] ?? m[4]}</em>)
    last = at + m[0].length
  }
  if (parts.length === 0) return text(message)
  if (last < message.length) parts.push(<Fragment key={`t${last}`}>{text(message.slice(last))}</Fragment>)
  return <>{parts}</>
}
