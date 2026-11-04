// ai-review.ts — what a reviewer would say, before the pull request is opened
// (#265).
//
// The comparison of a branch with its merge target already shows the diff; the
// model reads that same diff and answers with comments ANCHORED TO LINES:
// risks (behaviour changed without a test, an error swallowed, a migration
// with no way back) and leftovers (debug output, commented-out code, a TODO
// added). The comments are proposals the comparison shows in the model's ink,
// each one dismissible — nothing is posted anywhere.
//
// What makes the anchoring trustworthy is that the model is never asked to
// count: every line it reads carries its number on the new side, and an
// answer is then checked against the diff it was given. A comment on a line
// that is not in the diff moves to the nearest changed line of its file, or
// becomes a comment on the file; a comment on a file that is not in the diff
// is dropped. And when the diff was too large to send whole, the review says
// which files it read only in part and which it did not read at all.
//
// Free of `electron` and `vscode`: both products call it with their own git and
// their own way of reaching the model, like ai-features.ts.

import type { Run } from './ai-features'
import type { Raw } from './ai-material'
import { splitDiff, shareBudget, fileMap, type DiffFile, type DiffDetail } from './ai-diff'

export type ReviewSeverity = 'risk' | 'leftover' | 'note'

export interface ReviewComment {
  file: string
  /** On the NEW side; null for a comment on the file as a whole. */
  line: number | null
  severity: ReviewSeverity
  body: string
}

export interface Review {
  comments: ReviewComment[]
  /** Files sent only in part — the review of them is a review of their head. */
  partial: string[]
  /** Files not sent at all: the review says nothing about them. */
  unread: string[]
}

/** A share smaller than this cannot carry a line of the change. */
const MIN_BODY = 160

/** What a review reads by default, in characters — more than an explanation: it reads lines, not gist. */
export const REVIEW_BUDGET = 24000

/**
 * A file's hunks with every line numbered on the new side. Pure.
 *
 * `L42 + code` for an added line, `L42   code` for context, `     - code`
 * for a removed one (it has no line on the new side, and a comment cannot sit
 * on it). The `diff --git`, `---`, `+++` and `@@` lines pass through.
 */
export function numberLines(body: string): string {
  const out: string[] = []
  let n = 0
  let inHunk = false
  for (const line of body.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) { n = Number(hunk[1]); inHunk = true; out.push(line); continue }
    if (!inHunk || line.startsWith('\\')) { out.push(line); continue }
    if (line.startsWith('+')) { out.push(`L${n} +${line.slice(1)}`); n++ }
    else if (line.startsWith('-')) out.push(`      -${line.slice(1)}`)
    else { out.push(`L${n}  ${line.slice(1)}`); n++ }
  }
  return out.join('\n')
}

/** The new-side lines a file's hunks show, and which of them were added. Pure. */
export function newSideLines(body: string): { shown: Set<number>; added: number[] } {
  const shown = new Set<number>()
  const added: number[] = []
  let n = 0
  let inHunk = false
  for (const line of body.split('\n')) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunk) { n = Number(hunk[1]); inHunk = true; continue }
    if (!inHunk || line.startsWith('\\') || line.startsWith('-')) continue
    shown.add(n)
    if (line.startsWith('+')) added.push(n)
    n++
  }
  return { shown, added }
}

/**
 * The numbered diff the model reads, cut by file under a budget — and the
 * account of the cut. Shares the budget the way renderDiff does (#185): every
 * file contributes its head, none eats the lot.
 */
export function reviewMaterial(files: DiffFile[], detail: DiffDetail = 'standard', budget = REVIEW_BUDGET):
{ text: string; partial: string[]; unread: string[] } {
  const numbered = files.map(f => ({ path: f.path, body: numberLines(f.body) }))
  if (detail === 'full') return { text: numbered.map(f => f.body).join('\n'), partial: [], unread: [] }
  const shares = shareBudget(numbered.map(f => f.body.length), budget)
  const partial: string[] = [], unread: string[] = []
  const bodies = numbered.map((f, i) => {
    if (shares[i] >= f.body.length) return f.body
    if (shares[i] < MIN_BODY) { unread.push(f.path); return `[${f.path} not shown]` }
    partial.push(f.path)
    const cut = f.body.slice(0, shares[i])
    return `${cut.slice(0, cut.lastIndexOf('\n') + 1 || cut.length)}[... the rest of ${f.path} not shown]`
  })
  return { text: bodies.join('\n'), partial, unread }
}

export function reviewPrompt(
  base: string, head: string, subjects: string[], map: string, material: string, guidance?: string,
): string {
  return [
    `You are reviewing the changes ${head} makes over ${base}, before its pull request is opened.`,
    'Say what a careful reviewer would say, and nothing a linter would. Look for:',
    '- risks: behaviour changed without a test, an error path swallowed or turned into a success, a check removed, a migration without its rollback, a breaking change to an interface;',
    '- leftovers: debug output, commented-out code, a TODO or FIXME added, a stray file.',
    'Do not praise, do not summarise, do not restate what the code does. If there is nothing worth saying, say nothing.',
    '',
    'Every line of the diff below starts with its line number in the NEW file (L42). Removed lines have no number.',
    'Anchor each comment to the numbered line it is about, using that number exactly.',
    '',
    'Answer with JSON only, no prose around it:',
    '{"comments":[{"file":"path/as/in/the/diff","line":42,"severity":"risk"|"leftover"|"note","body":"one or two sentences"}]}',
    'Use "line": null for a comment about a file as a whole. At most 20 comments, the most important first.',
    ...(guidance?.trim() ? ['', `The user's instructions for reviews: ${guidance.trim()}`] : []),
    '',
    `Commits (${subjects.length}):`,
    ...subjects.map(s => `- ${s}`),
    '',
    `Files changed:\n${map}`,
    '',
    material,
  ].join('\n')
}

/** The JSON object in a model's answer — fenced, or with prose around it. */
function jsonIn(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{'), end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}

/**
 * The model's answer, checked against the diff it read. Pure.
 *
 * A file it names that the diff does not hold is dropped — a review of a file
 * nobody changed is noise at best. A line that is not on the new side of the
 * diff snaps to the nearest ADDED line of that file within a few lines (models
 * count from the hunk header and land one off), and otherwise becomes a
 * comment on the file: never a comment on a line it is not about.
 */
export function parseReview(text: string, files: DiffFile[]): ReviewComment[] {
  const data = jsonIn(text) as { comments?: unknown } | null
  const raw = Array.isArray(data?.comments) ? data!.comments : []
  const byPath = new Map(files.map(f => [f.path, f]))
  const out: ReviewComment[] = []
  for (const c of raw as Array<Record<string, unknown>>) {
    if (!c || typeof c !== 'object') continue
    const body = typeof c.body === 'string' ? c.body.trim() : ''
    let file = typeof c.file === 'string' ? c.file.trim().replace(/^[ab]\//, '') : ''
    if (!body || !file) continue
    if (!byPath.has(file)) {
      // `src/x.ts` for `x.ts`, or the other way: one file only, never a guess between two.
      const hits = files.filter(f => f.path.endsWith(`/${file}`) || file.endsWith(`/${f.path}`))
      if (hits.length !== 1) continue
      file = hits[0].path
    }
    const severity: ReviewSeverity = c.severity === 'risk' || c.severity === 'leftover' ? c.severity : 'note'
    let line: number | null = typeof c.line === 'number' && Number.isInteger(c.line) && c.line > 0 ? c.line : null
    if (line !== null) {
      const { shown, added } = newSideLines(byPath.get(file)!.body)
      if (!shown.has(line)) {
        const near = added.filter(n => Math.abs(n - line!) <= 3).sort((a, b) => Math.abs(a - line!) - Math.abs(b - line!))[0]
        line = near ?? null
      }
    }
    out.push({ file, line, severity, body })
    if (out.length >= 20) break
  }
  return out
}

/** `git diff` / `git log` arguments for the comparison a review reads. */
export function reviewRange(base: string, head: string, axis: 'diverged' | 'endpoints'): { diff: string[]; log: string[] } {
  return axis === 'diverged'
    ? { diff: [`${base}...${head}`], log: [`${base}..${head}`] }
    : { diff: [base, head], log: [`${base}..${head}`] }
}

/**
 * Review the comparison of `head` with `base`. The same call from both hosts:
 * the desktop's main process and the extension host give their own git and
 * their own model, and nothing else.
 */
export async function reviewComparison(
  raw: Raw, run: Run, base: string, head: string,
  opts: { axis?: 'diverged' | 'endpoints'; guidance?: string; detail?: DiffDetail } = {},
): Promise<Review & { error?: string }> {
  const empty: Review = { comments: [], partial: [], unread: [] }
  if ([base, head].some(r => !r?.trim() || r.trim().startsWith('-'))) return { ...empty, error: 'Invalid reference' }
  const range = reviewRange(base, head, opts.axis ?? 'diverged')
  let diff: string
  try { diff = await raw(['diff', '--no-color', '--no-ext-diff', '-M', ...range.diff, '--']) }
  catch (e) { return { ...empty, error: e instanceof Error ? e.message : String(e) } }
  const files = splitDiff(diff)
  if (!files.length) return { ...empty, error: `${head} changes nothing over ${base}` }
  const subjects = (await raw(['log', '--format=%s', '--max-count=50', ...range.log]).catch(() => ''))
    .split('\n').map(s => s.trim()).filter(Boolean)
  // A review reads lines; a summary-only level would ask it to review a map.
  const detail = opts.detail === 'full' ? 'full' : 'standard'
  const m = reviewMaterial(files, detail)
  const r = await run(reviewPrompt(base, head, subjects, fileMap(files), m.text, opts.guidance), 'review')
  if (r.error) return { ...empty, error: r.error }
  return { comments: parseReview(r.text ?? '', files), partial: m.partial, unread: m.unread }
}
