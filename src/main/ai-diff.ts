// ai-diff.ts — how much of a diff a model is shown, and what it is told about
// the rest (#185).
//
// Every prompt used to cut the same way: `diff.slice(0, 6000)`. On a branch
// touching forty files that is the first two or three IN FULL, in git's
// alphabetical order, and nothing at all of the other thirty-seven — a
// partial view described with the confidence of a whole one. The model was
// not shown less detail; it was shown a different change.
//
// So the cut is by FILE now, and whatever is cut, the map stays whole: every
// prompt says which files changed and by how much, even when it shows the
// body of none of them. Five of the seven prompts already did that with a
// diffstat passed alongside; this derives the same map from the diff itself,
// so the two that could not — a stash, a commit — get it for nothing.
//
// Free of `electron` and `vscode`: both products render a diff identically or
// their answers are not comparable.

/** How much of a diff a feature wants to show. */
export type DiffDetail = 'summary' | 'standard' | 'full'

export const DIFF_DETAILS: DiffDetail[] = ['summary', 'standard', 'full']

/** Where a feature's choice is kept — the settings vocabulary of #70. */
export const detailKey = (feature: string): string => `aiDetail:${feature}`

/** What the settings say, defaulting to the behaviour everyone already had. */
export function detailFor(
  settings: Record<string, string | undefined>, feature?: string,
): DiffDetail {
  if (!feature) return 'standard'
  const v = (settings[detailKey(feature)] ?? '').trim()
  return (DIFF_DETAILS as string[]).includes(v) ? v as DiffDetail : 'standard'
}

export interface DiffFile {
  path: string
  added: number
  removed: number
  /** The file's own hunk text, header included. */
  body: string
}

/**
 * One unified diff, as the files it is made of.
 *
 * Anything before the first `diff --git` — a preamble some porcelain adds —
 * belongs to no file and is dropped: it is never the change.
 */
export function splitDiff(diff: string): DiffFile[] {
  const out: DiffFile[] = []
  let current: string[] | null = null

  const flush = () => {
    if (!current) return
    const body = current.join('\n')
    out.push({ path: pathOf(current[0], body), ...counts(current), body })
    current = null
  }

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) { flush(); current = [line]; continue }
    if (current) current.push(line)
  }
  flush()
  return out
}

/** The file a hunk is about — `+++ b/x` when there is one, the header otherwise. */
function pathOf(header: string, body: string): string {
  const plus = body.split('\n').find(l => l.startsWith('+++ '))
  if (plus && plus !== '+++ /dev/null') return plus.replace(/^\+\+\+ (b\/)?/, '').trim()
  const minus = body.split('\n').find(l => l.startsWith('--- '))
  if (minus && minus !== '--- /dev/null') return minus.replace(/^--- (a\/)?/, '').trim()
  // `diff --git a/x b/x` — take the second path, which is where it ends up.
  const m = header.match(/^diff --git a\/(.+?) b\/(.+)$/)
  return m ? m[2] : header.replace(/^diff --git /, '').trim()
}

function counts(lines: string[]): { added: number; removed: number } {
  let added = 0, removed = 0
  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) added++
    else if (l.startsWith('-') && !l.startsWith('---')) removed++
  }
  return { added, removed }
}

/** The map: every file that changed, and by how much. Never truncated. */
export function fileMap(files: DiffFile[]): string {
  return files.map(f => `  ${f.path}  +${f.added} −${f.removed}`).join('\n')
}

/**
 * Share a budget across files so each one contributes its head.
 *
 * Fair share with give-back: a file smaller than its slice takes only what it
 * needs and returns the rest, which is what stops one enormous file from
 * being the only one anybody sees — the failure the prefix cut made certain.
 */
export function shareBudget(sizes: number[], budget: number): number[] {
  const shares = new Array(sizes.length).fill(0)
  let left = budget
  let open = sizes.map((_, i) => i)
  while (open.length && left > 0) {
    const slice = Math.floor(left / open.length)
    if (slice <= 0) break
    const next: number[] = []
    for (const i of open) {
      const take = Math.min(sizes[i] - shares[i], slice)
      shares[i] += take
      left -= take
      if (shares[i] < sizes[i]) next.push(i)
    }
    // Nobody could take anything: the remainder is smaller than one share.
    if (next.length === open.length && next.every(i => shares[i] === 0)) break
    open = next
  }
  return shares
}

/**
 * A diff, rendered at the detail asked for.
 *
 * The map is always there. What changes is how much of each file's body goes
 * with it — none, a fair share of the budget, or all of it — and every cut
 * says how many lines it dropped, so the model can say what it did not read
 * instead of guessing past it.
 */
/** A share smaller than this cannot carry a line of the change itself. */
const MIN_BODY = 160

export function renderDiff(
  diff: string, opts: { detail?: DiffDetail; budget?: number } = {},
): string {
  const detail = opts.detail ?? 'standard'
  const budget = opts.budget ?? 6000
  const files = splitDiff(diff)

  // Not a unified diff at all (or an empty one): fall back to the plain cut,
  // which is at least honest about being one.
  if (!files.length) {
    return diff.length > budget && detail !== 'full'
      ? diff.slice(0, budget) + '\n... [truncated]'
      : diff
  }

  const head = `Files changed (${files.length}):\n${fileMap(files)}`
  if (detail === 'summary') {
    return `${head}\n\n[bodies not shown — this is the summary of the change, not a sample of it]`
  }
  if (detail === 'full') {
    return `${head}\n\n${files.map(f => f.body).join('\n')}`
  }

  const shares = shareBudget(files.map(f => f.body.length), budget)
  const bodies = files.map((f, i) => {
    if (shares[i] >= f.body.length) return f.body
    // Below this a share buys the `diff --git` line and nothing else — which
    // is a header pretending to be content. Say the file was not read
    // instead; the map above already says what it did.
    if (shares[i] < MIN_BODY) {
      return `[${f.path} not shown — ${f.body.split('\n').length} lines]`
    }
    // Cut at a line boundary: half a diff line is a fragment the model reads
    // as real, and `+ if (x` is not something anyone should have to parse.
    const raw = f.body.slice(0, shares[i])
    const kept = raw.slice(0, raw.lastIndexOf('\n') + 1 || raw.length)
    const dropped = f.body.slice(kept.length).split('\n').filter(Boolean).length
    return `${kept}[... ${dropped} more lines of ${f.path} not shown]`
  })
  return `${head}\n\n${bodies.join('\n')}`
}
