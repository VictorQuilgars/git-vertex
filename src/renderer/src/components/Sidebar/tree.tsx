// Branches as a tree of folders, with their leaves. (tree.tsx: branchTree.ts beside it is the model.)
import React from 'react'
import { Icon } from '../Icon/Icon'
import { type BranchNode } from './branchTree'
import { useLang } from '../../i18n/LanguageContext'

// ── The branch tree ──────────────────────────────────────────────
// A branch name is a path, so the sections draw it as one (#134). Folders are
// rows of their own; every leaf is the same BranchItem the flat list used, so
// nothing a row carries — the menu, the PR chip, ahead/behind, solo, hide,
// drag-and-drop — changes with the shape it is drawn in.

/**
 * The tree's indent, built from the panel's one scale rather than a copy of
 * it: `--sb-indent`, `--sb-indent-step` and `--sb-branch-inset` are declared
 * once on `.sidebar` in Sidebar.css, and these read them.
 *
 * A number kept in both files is how the folders once landed at zero while the
 * stylesheet said 26 — and how the GitHub groups ended up on an indent scale
 * of their own (#138). There is one scale, and it is in the stylesheet.
 */
export const folderIndent = (depth: number) =>
  `calc(var(--sb-indent) + ${depth} * var(--sb-indent-step))`

/** A leaf is a BranchItem, which already carries `--sb-branch-inset` itself. */
export const leafIndent = (depth: number) =>
  `calc(var(--sb-indent) - var(--sb-branch-inset) + ${depth} * var(--sb-indent-step))`

export function BranchTree<T>({ nodes, open, onToggle, renderLeaf, depth = 0 }: {
  nodes: BranchNode<T>[]
  open: Set<string>
  onToggle: (path: string) => void
  renderLeaf: (item: T, label: string) => React.ReactNode
  depth?: number
}) {
  const { t } = useLang()
  return (
    <>
      {nodes.map(node => node.kind === 'leaf'
        ? (
          <div key={node.path} className="sb-tree-leaf"
            style={{ paddingLeft: leafIndent(depth) }}>
            {renderLeaf(node.item, node.label)}
          </div>
        )
        : (
          <div key={node.path}>
            {/* Indented from the section title, and level with the branch
                rows beside it: a folder and a branch at the same depth are the
                same depth. The scale is the panel's, declared on `.sidebar`. */}
            <div className="sb-tree-folder"
              style={{ paddingLeft: folderIndent(depth) }}
              title={node.path}
              onClick={() => onToggle(node.path)}>
              <Icon name="folder" size={12} />
              <span className="sb-tree-folder-name">{node.label}</span>
              <span className="sb-tree-folder-count">{countLeaves([node])}</span>
            </div>
            {open.has(node.path) && (
              <BranchTree nodes={node.children} open={open} onToggle={onToggle}
                renderLeaf={renderLeaf} depth={depth + 1} />
            )}
          </div>
        ))}
      {nodes.length === 0 && <div className="sb-empty">{t('sb.noLocalBranch')}</div>}
    </>
  )
}

export function countLeaves<T>(nodes: BranchNode<T>[]): number {
  return nodes.reduce((n, x) => n + (x.kind === 'leaf' ? 1 : countLeaves(x.children)), 0)
}
