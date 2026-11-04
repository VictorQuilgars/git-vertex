// revisionTree.ts — a repository as it was at one commit, as a folder (#72).
//
// VS Code browses anything a FileSystemProvider serves, and git can list and
// read any tree it holds without a checkout: `ls-tree` for what a folder
// contains, `cat-file blob` for a file. This module is the part that needs no
// editor — the URI shape and the parse of `ls-tree` — so it runs in the
// display-free suite; the provider in panel/RevisionFileSystem.ts is a thin
// shell over it.
//
// Imports nothing but node's crypto.

import { createHash } from 'crypto'

export const TREE_SCHEME = 'gitvertex-tree'

/**
 * A short, stable name for a repository root — the URI's authority.
 *
 * The root itself cannot be the authority (a path is not a host name), and
 * putting it in the path would make every folder in the tree read as a
 * possible root. The id is looked up in a registry the extension keeps in its
 * global state, so a NEW WINDOW opened on the tree still finds its repository.
 */
export function rootId(root: string): string {
  return createHash('sha1').update(root).digest('hex').slice(0, 12)
}

/** The path part of a URI into the tree: `/<commit>/<path in the repo>`. */
export function treePath(commit: string, rel = ''): string {
  const clean = rel.split('/').filter(Boolean).join('/')
  return clean ? `/${commit}/${clean}` : `/${commit}`
}

/** `/<commit>/<rel>` back into its two halves, or null when it is not one. */
export function parseTreePath(p: string): { commit: string; rel: string } | null {
  const m = /^\/([0-9a-f]{40}|[0-9a-f]{64})(?:\/(.*))?$/.exec(p)
  if (!m) return null
  const rel = (m[2] ?? '').split('/').filter(Boolean).join('/')
  // `..` would read nothing from git, but a path that climbs is not a path
  // into this tree, and saying so is clearer than a file-not-found.
  if (rel.split('/').some(s => s === '..' || s === '.')) return null
  return { commit: m[1], rel }
}

export type TreeEntryType = 'blob' | 'tree' | 'commit'

export interface TreeEntry {
  mode: string
  type: TreeEntryType
  /** In bytes, for a blob; 0 for a folder and for a submodule. */
  size: number
  /** The entry's path as git printed it — the full path from the root. */
  path: string
}

/** `ls-tree` arguments: one entry when `rel` names it, a folder's contents when `asFolder`. */
export function lsTreeArgs(commit: string, rel: string, asFolder: boolean): string[] {
  if (!rel) return ['ls-tree', '-l', '-z', commit]
  return ['ls-tree', '-l', '-z', commit, '--', asFolder ? `${rel}/` : rel]
}

/**
 * `git ls-tree -l -z` into entries. Pure.
 *
 * Each record is `<mode> SP <type> SP <object> SP <size, right-aligned> TAB
 * <path>` and ends with NUL; `-z` keeps a path with a tab or a newline whole.
 * A folder's size is `-`.
 */
export function parseLsTree(raw: string): TreeEntry[] {
  const out: TreeEntry[] = []
  for (const record of raw.split('\0')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const [mode, type, , size] = record.slice(0, tab).trim().split(/\s+/)
    if (type !== 'blob' && type !== 'tree' && type !== 'commit') continue
    out.push({ mode, type, size: Number(size) || 0, path: record.slice(tab + 1) })
  }
  return out
}

/** The last segment of a path — what a folder lists its entry under. */
export function baseName(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}

/** A symbolic link is a blob of mode 120000: its content is the link's target. */
export function isSymlink(e: TreeEntry): boolean {
  return e.mode === '120000'
}

/** What a workspace folder on the tree is called: `repo @ abc1234`. */
export function treeFolderName(root: string, commit: string, label?: string): string {
  const repo = baseName(root.replace(/[\\/]+$/, '').split('\\').join('/')) || root
  return `${repo} @ ${label ?? commit.slice(0, 7)}`
}
