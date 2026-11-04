// squashPlan.ts — N selected commits folded into one, as a rebase plan (#69).
//
// The batch squash does not rewrite anything itself. It opens the interactive
// rebase editor — the same review screen an agent's `propose_rebase_plan`
// lands on — with the plan already made: the oldest selected commit picked,
// the others squashed into it.
// The user reads it, edits the message, and launches it, or closes it.
//
// What this module decides is whether a plan can be made at all, and it says
// no rather than guess: `git rebase -i` squashes a line into the line ABOVE
// it, so the selection has to be one unbroken run of the checked-out line —
// no gap (a commit in between would swallow the squash), no merge from the
// run up to HEAD (a rebase flattens it), not the root (there is no base to rebase onto), and on the
// line HEAD is on (a rebase rewrites the checked-out branch, nothing else).
// Pure.

export interface PlanCommit { hash: string; parents: string[]; message: string; refs?: string[] }

export type SquashStep = { hash: string; action: 'pick' | 'squash' }

export type SquashPlan =
  | { ok: true; base: string; plan: SquashStep[] }
  | { ok: false; reason: 'tooFew' | 'notOnHead' | 'gap' | 'merge' | 'root' }

/** HEAD's first-parent line, newest first, as far as the loaded commits reach. */
export function headLine(commits: readonly PlanCommit[]): string[] {
  const byHash = new Map(commits.map(c => [c.hash, c]))
  let at = commits.find(c => (c.refs ?? []).some(r => r === 'HEAD' || r.startsWith('HEAD ->')))
  const line: string[] = []
  const seen = new Set<string>()
  while (at && !seen.has(at.hash)) {
    seen.add(at.hash)
    line.push(at.hash)
    at = at.parents[0] ? byHash.get(at.parents[0]) : undefined
  }
  return line
}

export function squashPlanFor(selected: ReadonlySet<string>, commits: readonly PlanCommit[]): SquashPlan {
  if (selected.size < 2) return { ok: false, reason: 'tooFew' }
  const line = headLine(commits)
  const at = new Map(line.map((h, i) => [h, i]))
  if ([...selected].some(h => !at.has(h))) return { ok: false, reason: 'notOnHead' }
  // Newest first along the line; an unbroken run has consecutive positions.
  const positions = [...selected].map(h => at.get(h)!).sort((a, b) => a - b)
  if (positions.some((p, i) => i > 0 && p !== positions[i - 1] + 1)) return { ok: false, reason: 'gap' }
  const byHash = new Map(commits.map(c => [c.hash, c]))
  const run = positions.map(p => byHash.get(line[p])!).reverse() // oldest first
  // Every commit the rebase replays counts, not only the selected ones: the
  // ones above the run, up to HEAD, are replayed too, and a merge among them
  // would be flattened just the same.
  const replayed = line.slice(0, positions[positions.length - 1] + 1).map(h => byHash.get(h)!)
  if (replayed.some(c => c.parents.length > 1)) return { ok: false, reason: 'merge' }
  const base = run[0].parents[0]
  if (!base) return { ok: false, reason: 'root' }
  // No message is preloaded: the editor already offers git's own default for
  // a squash — every FULL message in order — where the graph holds subjects.
  return {
    ok: true,
    base,
    plan: run.map((c, i) => ({ hash: c.hash, action: i === 0 ? 'pick' : 'squash' })),
  }
}
