import { BlameLine } from './blame'

// Annotation text formatting. No `vscode` import — see blame.ts.

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

const UNITS: [seconds: number, name: string][] = [
  [YEAR, 'year'], [MONTH, 'month'], [WEEK, 'week'],
  [DAY, 'day'], [HOUR, 'hour'], [MINUTE, 'minute'],
]

/** "3 days ago" — coarse on purpose, this sits inside the user's code. */
export function formatRelative(epochSeconds: number, now: number = Date.now()): string {
  const diff = Math.floor(now / 1000) - epochSeconds
  // A commit dated in the future (skewed clock, rebased date) reads as fresh
  // rather than as "-2 hours ago".
  if (diff < MINUTE) return 'just now'
  for (const [seconds, name] of UNITS) {
    if (diff >= seconds) {
      const n = Math.floor(diff / seconds)
      return `${n} ${name}${n > 1 ? 's' : ''} ago`
    }
  }
  return 'just now'
}

export const DEFAULT_LINE_FORMAT = '${author}, ${ago} • ${message}'

export interface AnnotationOptions {
  now?: number
  /** Repo's configured user — their own lines read "You", not their name. */
  currentUserEmail?: string
  /** Max characters of the commit summary; 0 disables truncation. */
  messageLength?: number
}

export function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`
}

/**
 * Render one annotation from a template. Known tokens: ${author} ${ago}
 * ${date} ${message} ${hash}; anything else resolves to an empty string.
 */
export function formatAnnotation(
  template: string,
  line: BlameLine,
  opts: AnnotationOptions = {},
): string {
  // Working-tree lines have no author, date or message to interpolate, so the
  // template is bypassed rather than rendered with three empty holes.
  if (line.uncommitted) return 'You, uncommitted changes'

  const isYou = opts.currentUserEmail !== undefined
    && opts.currentUserEmail !== ''
    && line.authorMail.toLowerCase() === opts.currentUserEmail.toLowerCase()

  const values: Record<string, string> = {
    author: isYou ? 'You' : line.author,
    ago: formatRelative(line.authorTime, opts.now),
    date: new Date(line.authorTime * 1000).toLocaleDateString('en-US'),
    message: truncate(line.summary, opts.messageLength ?? 60),
    hash: line.shortHash,
  }

  return template.replace(/\$\{(\w+)\}/g, (_match, key: string) => values[key] ?? '').trim()
}
