import type { WorkingChanges } from '../types'

/**
 * How many files the working tree touches.
 *
 * `git status` lists a file that was staged and then modified again in BOTH
 * columns (`MM`), and the staging pane rightly shows it twice — once to commit,
 * once still to stage. A count that adds the two lists then says "3 files
 * changed" over two files (#232). This counts paths, so that file is one.
 *
 * Entries are accepted as objects or as bare paths: the untracked list is bare
 * paths already, and a test's stub is allowed to be that lazy too.
 */
export function changedFileCount(changes: Partial<WorkingChanges> | null | undefined): number {
  if (!changes) return 0
  const paths = new Set<string>()
  const add = (f: { path: string } | string) => paths.add(typeof f === 'string' ? f : f.path)
  for (const f of changes.staged ?? []) add(f)
  for (const f of changes.unstaged ?? []) add(f)
  for (const p of changes.untracked ?? []) add(p)
  return paths.size
}
