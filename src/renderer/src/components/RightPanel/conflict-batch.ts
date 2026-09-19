// Every conflicted file resolved by the model in one go (#269).
//
// The model already resolved one file at a time, from inside that file's
// resolver. This runs the same request over the whole list, and keeps what it
// needs pure: which files it may attempt, and the run itself over injected
// calls, so what is attempted, skipped, stopped and failed is tested without a
// panel or a provider.

import type { ConflictKind } from '../../types'
import { SIDE_HAS_VERSION } from './shared'

/** What happened to one file of the run. */
export type BatchOutcome =
  | { file: string; status: 'resolved'; explanation: string }
  | { file: string; status: 'failed'; error: string }
  /** Never started: the run was stopped, or it cannot go on without a key. */
  | { file: string; status: 'not-run' }

/**
 * The files the model may attempt. A conflict where one side deleted the path
 * is not about content: the question is whether the file survives, and that is
 * the user's to answer, with Keep or Delete.
 */
export function batchPlan(files: string[], kinds: Record<string, ConflictKind>): { attempt: string[]; skip: string[] } {
  const attempt: string[] = []
  const skip: string[] = []
  for (const file of files) {
    const sides = SIDE_HAS_VERSION[kinds[file] ?? 'unknown']
    ;(sides.ours && sides.theirs ? attempt : skip).push(file)
  }
  return { attempt, skip }
}

export interface BatchDeps {
  /** The model's proposal for one file — the renderer's `aiResolveConflict`. */
  propose: (file: string) => Promise<{ resolution?: string; explanation?: string; error?: string }>
  /** Write the proposal and stage it — the renderer's `resolveConflict`. */
  write: (file: string, content: string) => Promise<{ success?: boolean; error?: string }>
  /** Asked before each file starts, and again before a proposal is written. */
  stopped: () => boolean
  onStart?: (file: string) => void
  onDone?: (outcome: BatchOutcome) => void
  /** Between two tries of a write that found the index locked. */
  retryDelayMs?: number
}

/**
 * git's own lock on the index: taken by `git add`, and by the `git status` the
 * panel runs to refresh after every file. The first run on a real repository
 * lost a file to it — two answers landing together, one write losing the race.
 */
const INDEX_LOCKED = /index\.lock/
const WRITE_TRIES = 4

/** The error the providers answer with when no key is configured. */
export const NO_API_KEY = 'NO_API_KEY'

/**
 * Two at a time: one after the other is minutes on a merge of ten files, and
 * more at once is what gets a free tier rate-limited — every file failing is
 * worse than waiting.
 */
export const BATCH_CONCURRENCY = 2

/**
 * Run the model over `files`. One file failing does not stop the others; a
 * missing key does, since every other file would fail the same way. A stop is
 * honoured between files, and before writing: a proposal that arrives after it
 * is dropped rather than written.
 *
 * The model is asked about several files at once; the repository is written
 * one file at a time — two `git add` at once is one of them failing on the
 * index's lock — and a write that still finds it locked (the panel's own
 * refresh) is tried again rather than reported.
 */
export async function resolveBatch(
  files: string[], deps: BatchDeps, concurrency = BATCH_CONCURRENCY,
): Promise<{ outcomes: BatchOutcome[]; missingKey: boolean }> {
  const outcomes = new Map<string, BatchOutcome>()
  let missingKey = false
  let next = 0
  const halted = () => missingKey || deps.stopped()
  const settle = (outcome: BatchOutcome) => { outcomes.set(outcome.file, outcome); deps.onDone?.(outcome) }

  let writing: Promise<unknown> = Promise.resolve()
  const write = (file: string, content: string) => {
    const attempt = async () => {
      for (let tryNo = 1; ; tryNo++) {
        const r = await deps.write(file, content)
        if (r.success !== false || !INDEX_LOCKED.test(r.error ?? '') || tryNo >= WRITE_TRIES) return r
        await new Promise(res => setTimeout(res, deps.retryDelayMs ?? 250))
      }
    }
    const turn = writing.then(attempt, attempt)
    writing = turn.catch(() => {})
    return turn
  }

  const worker = async () => {
    while (next < files.length && !halted()) {
      const file = files[next++]
      deps.onStart?.(file)
      let outcome: BatchOutcome
      try {
        const proposal = await deps.propose(file)
        if (proposal.error === NO_API_KEY) {
          missingKey = true
          outcome = { file, status: 'not-run' }
        } else if (proposal.error || typeof proposal.resolution !== 'string') {
          outcome = { file, status: 'failed', error: proposal.error || 'The model returned nothing' }
        } else if (deps.stopped()) {
          outcome = { file, status: 'not-run' }
        } else {
          const written = await write(file, proposal.resolution)
          outcome = written.success === false
            ? { file, status: 'failed', error: written.error || 'The file could not be written' }
            : { file, status: 'resolved', explanation: proposal.explanation ?? '' }
        }
      } catch (e: any) {
        outcome = { file, status: 'failed', error: e?.message ?? String(e) }
      }
      settle(outcome)
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, worker))
  // In the order of the list, with whatever never started said so.
  return {
    outcomes: files.map(file => outcomes.get(file) ?? { file, status: 'not-run' as const }),
    missingKey,
  }
}
