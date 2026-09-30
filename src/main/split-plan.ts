// split-plan.ts — a working tree cut into commits, and the check that keeps
// the cut honest.
//
// Imports nothing (the theme-validate pattern): the main process measures the
// composer model's answer with it, and the renderer measures a split an MCP
// agent proposed (#88) — both reach the same review screen, and a proposal
// must not be believed more from one source than from the other.

/** One commit a split proposes: a message and the files it takes. */
export interface SplitGroup { message: string; files: string[] }

/** What came back from a split, once measured against the real file list. */
export interface SplitProposal {
  groups: SplitGroup[]
  /** Real files the proposal placed nowhere — the UI has to offer them. */
  unassigned: string[]
  /** Paths with no uncommitted work, kept so the UI can say the plan was edited. */
  invented: string[]
}

/**
 * Measure a proposed split against the files that really have uncommitted
 * work.
 *
 * Whoever proposed it — the model behind the composer, or an agent whose
 * proposal was checked on its own side of a deep link, possibly a while
 * before the working tree moved — it is a claim about files, not a fact. An
 * unknown path is dropped (and reported), a file placed twice belongs to the
 * first commit that claimed it, and anything left over comes back as
 * `unassigned`: the UI shows those, because silently dropping a file from a
 * split loses work.
 *
 * Paths are matched in NFC and handed back in git's own spelling: an agent's
 * prompt and a macOS filesystem can spell the same accented path in two
 * normalizations, and what gets staged must be the one git knows.
 */
export function measureSplit(proposed: SplitGroup[], knownFiles: string[]): SplitProposal {
  const known = new Map(knownFiles.map(f => [f.normalize('NFC'), f] as const))
  const taken = new Set<string>()
  const invented: string[] = []
  const groups: SplitGroup[] = []

  for (const g of proposed) {
    const message = g.message.trim()
    const files: string[] = []
    for (const path of g.files) {
      const real = known.get(path.normalize('NFC'))
      if (real === undefined) { invented.push(path); continue }
      if (taken.has(real) || files.includes(real)) continue
      files.push(real)
    }
    // A commit that lost every file it was given has nothing to apply. Its
    // message is not worth keeping either — it described those files. A
    // commit with no message is not kept, and its files are NOT claimed: they
    // come back loose (or go to a later commit that names them) instead of
    // vanishing from both the plan and the list of what it left out.
    if (!message || !files.length) continue
    for (const f of files) taken.add(f)
    groups.push({ message, files })
  }

  return { groups, unassigned: knownFiles.filter(f => !taken.has(f)), invented }
}

/**
 * Read the split an MCP agent sent through a `propose-split` deep link.
 *
 * The payload is the one `propose_split` writes in git-vertex-mcp:
 * `{ kind: 'split', commits: [{ message, files }] }`. It is only read here,
 * not measured — measuring needs the working tree as it is when the review
 * screen opens, which is the composer's job. Anything that is not that shape
 * throws, so the caller can say the proposal was unreadable instead of
 * opening an empty screen.
 */
export function readSplitProposal(content: string): SplitGroup[] {
  const p = JSON.parse(content)
  if (!p || !Array.isArray(p.commits)) throw new Error('proposal has no commits array')
  return p.commits.map((c: unknown, i: number) => {
    const g = c as { message?: unknown; files?: unknown }
    if (typeof g?.message !== 'string') throw new Error(`commit ${i + 1} has no message`)
    if (!Array.isArray(g.files) || !g.files.every(f => typeof f === 'string')) {
      throw new Error(`commit ${i + 1} has no file list`)
    }
    return { message: g.message, files: g.files as string[] }
  })
}
