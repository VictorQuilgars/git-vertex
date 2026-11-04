// revisionChoices.ts — what the revision picker offers (#79).
//
// The three "against a revision" commands — Open Changes with Revision…,
// Open Changes with Branch or Tag…, Open File at Revision… — share one picker:
// the branches and tags of the repository, and the commits that touched the
// file. This module is the part of it that needs no editor: the git it runs,
// what comes back read into choices, and the order each command shows them in.
// The quick pick that draws them lives in extension.ts.
//
// Imports nothing, so it runs in the display-free suite.

export type RevisionKind = 'branch' | 'remote' | 'tag' | 'commit'

export interface RevisionChoice {
  kind: RevisionKind
  /** What git is given — a full ref name or a full hash, never a short form that can turn ambiguous. */
  ref: string
  /** What the row reads as. */
  label: string
  description?: string
  detail?: string
}

/** Unit separator: never in a ref name, a subject or an author. */
const US = '\x1f'

/** `git for-each-ref` arguments for the branch and tag rows, newest first. */
export function refChoiceArgs(): string[] {
  return [
    'for-each-ref', '--sort=-creatordate',
    `--format=%(refname)${US}%(refname:short)${US}%(objectname:short)${US}%(contents:subject)`,
    'refs/heads', 'refs/remotes', 'refs/tags',
  ]
}

/**
 * `git log` arguments for the commits that touched one file, newest first.
 *
 * Without `--follow`, on purpose: a commit from before a rename holds the file
 * under its OLD path, and every command here reads it at the current one — the
 * picker would offer revisions whose side of the diff comes up empty.
 */
export function historyChoiceArgs(rel: string | null, max = 50): string[] {
  const args = ['log', `-n${max}`, `--format=%H${US}%h${US}%s${US}%an${US}%ar`]
  // No file: the repository's own recent commits, for a command about all of it.
  return rel ? [...args, '--', rel] : args
}

export function parseRefChoices(raw: string): RevisionChoice[] {
  const out: RevisionChoice[] = []
  for (const line of raw.split('\n')) {
    const [full, short, hash, subject] = line.split(US)
    if (!full || !short) continue
    // `refs/remotes/origin/HEAD` is a pointer to a branch already listed.
    if (/^refs\/remotes\/[^/]+\/HEAD$/.test(full)) continue
    const kind: RevisionKind = full.startsWith('refs/tags/') ? 'tag'
      : full.startsWith('refs/remotes/') ? 'remote' : 'branch'
    out.push({ kind, ref: full, label: short, description: hash, detail: subject || undefined })
  }
  return out
}

export function parseHistoryChoices(raw: string): RevisionChoice[] {
  const out: RevisionChoice[] = []
  for (const line of raw.split('\n')) {
    const [hash, short, subject, author, when] = line.split(US)
    if (!hash || !/^[0-9a-f]{7,64}$/.test(hash)) continue
    out.push({ kind: 'commit', ref: hash, label: short || hash.slice(0, 7), description: subject, detail: [author, when].filter(Boolean).join(', ') || undefined })
  }
  return out
}

export interface RevisionSection { title: string; choices: RevisionChoice[] }

/**
 * The picker's sections, in the order the command asks for. A command about
 * the file's own past leads with its history; one about another line of work
 * leads with the branches and tags. An empty section is left out rather than
 * shown as a heading over nothing.
 */
export function revisionSections(
  refs: RevisionChoice[], history: RevisionChoice[], lead: 'history' | 'refs', historyTitle: string,
): RevisionSection[] {
  const branches = refs.filter(r => r.kind === 'branch' || r.kind === 'remote')
  const tags = refs.filter(r => r.kind === 'tag')
  const fileHistory: RevisionSection = { title: historyTitle, choices: history }
  const named: RevisionSection[] = [{ title: 'Branches', choices: branches }, { title: 'Tags', choices: tags }]
  return (lead === 'history' ? [fileHistory, ...named] : [...named, fileHistory]).filter(s => s.choices.length > 0)
}

/** The short name a tab title uses for a choice: `main`, `v1.2.0`, `abc1234`. */
export function shortRevision(ref: string): string {
  if (/^[0-9a-f]{40}$/.test(ref) || /^[0-9a-f]{64}$/.test(ref)) return ref.slice(0, 7)
  return ref.replace(/^refs\/(heads|tags|remotes)\//, '')
}
