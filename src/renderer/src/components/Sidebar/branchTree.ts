/**
 * A branch name is a path — `fix/typecheck-gate-holes` — so the sidebar draws
 * it as one (#134).
 *
 * Deliberately not `RightPanel`'s `buildTree`: that one answers a question this
 * one never has to. A file tree must cope with a node that is both a folder and
 * a file; git cannot hold `fix` and `fix/x` at once, because
 * `.git/refs/heads/fix` cannot be a file and a directory. Every node here is
 * one or the other, and the type says so.
 */

export interface BranchLeaf<T> {
  kind: 'leaf'
  /** Last segment — what the row reads as, the folders spelling the rest. */
  label: string
  /** Full path from the root of this tree, for the folder key below it. */
  path: string
  item: T
}

export interface BranchFolder<T> {
  kind: 'folder'
  label: string
  /** `feat`, `feat/ui` — stable across reloads, so it keys the open state. */
  path: string
  children: BranchNode<T>[]
}

export type BranchNode<T> = BranchLeaf<T> | BranchFolder<T>

/**
 * `nameOf` gives the path to split. Order is preserved: whatever order the
 * caller sorted its branches into is the order they appear in, folder by
 * folder, so favourites-first still holds *within* a folder — which is the
 * strongest promise a tree can make about it.
 *
 * Folders come before leaves at each level, which is the only reordering done
 * here: a folder full of branches under a lone `main` reads as a list of
 * branches with something hidden at the bottom.
 */
export function buildBranchTree<T>(items: T[], nameOf: (item: T) => string): BranchNode<T>[] {
  const root: BranchFolder<T> = { kind: 'folder', label: '', path: '', children: [] }

  for (const item of items) {
    const parts = nameOf(item).split('/').filter(Boolean)
    if (!parts.length) continue
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/')
      let next = node.children.find(
        (c): c is BranchFolder<T> => c.kind === 'folder' && c.label === parts[i])
      if (!next) {
        next = { kind: 'folder', label: parts[i], path, children: [] }
        node.children.push(next)
      }
      node = next
    }
    node.children.push({
      kind: 'leaf',
      label: parts[parts.length - 1],
      path: parts.join('/'),
      item,
    })
  }

  const foldersFirst = (nodes: BranchNode<T>[]): BranchNode<T>[] => {
    const out = [...nodes.filter(n => n.kind === 'folder'), ...nodes.filter(n => n.kind === 'leaf')]
    for (const n of out) if (n.kind === 'folder') n.children = foldersFirst(n.children)
    return out
  }
  return foldersFirst(root.children)
}

/** Every folder path in a tree — what "expand all" and a filter's reveal need. */
export function folderPaths<T>(nodes: BranchNode<T>[]): string[] {
  const out: string[] = []
  const walk = (ns: BranchNode<T>[]) => {
    for (const n of ns) if (n.kind === 'folder') { out.push(n.path); walk(n.children) }
  }
  walk(nodes)
  return out
}
