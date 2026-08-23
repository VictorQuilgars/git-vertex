import { buildBranchTree, folderPaths, type BranchNode } from '../branchTree'

// A branch name is a path, and the sidebar draws it as one (#134).

const names = (nodes: BranchNode<string>[]): any =>
  nodes.map(n => n.kind === 'folder' ? { [n.label]: names(n.children) } : n.label)

const tree = (list: string[]) => buildBranchTree(list, x => x)

describe('building the tree', () => {
  test('a name without a slash stays at the top', () => {
    expect(names(tree(['main']))).toEqual(['main'])
  })

  test('the segments before the last become folders', () => {
    expect(names(tree(['feat/views-in-tabs', 'fix/a', 'fix/b', 'main'])))
      .toEqual([{ feat: ['views-in-tabs'] }, { fix: ['a', 'b'] }, 'main'])
  })

  test('folders nest as deep as the name does', () => {
    expect(names(tree(['a/b/c/d']))).toEqual([{ a: [{ b: [{ c: ['d'] }] }] }])
  })

  // The only reordering: a folder full of branches under a lone `main` reads
  // as a list with something hidden at the bottom.
  test('folders come before leaves at every level', () => {
    expect(names(tree(['main', 'fix/a']))).toEqual([{ fix: ['a'] }, 'main'])
  })

  // Whatever order the caller sorted into is kept inside each folder, which is
  // what lets favourites-first still mean something.
  test('the caller\'s order survives within a folder', () => {
    expect(names(tree(['fix/z', 'fix/a']))).toEqual([{ fix: ['z', 'a'] }])
  })

  test('a leaf keeps the whole path, not just its label', () => {
    const t = tree(['fix/deep/thing'])
    const folder: any = t[0]
    expect(folder.path).toBe('fix')
    expect(folder.children[0].path).toBe('fix/deep')
    expect(folder.children[0].children[0]).toMatchObject({ label: 'thing', path: 'fix/deep/thing', item: 'fix/deep/thing' })
  })

  test('folder paths are listed for the open state to key on', () => {
    expect(folderPaths(tree(['a/b/c', 'd/e', 'f']))).toEqual(['a', 'a/b', 'd'])
  })

  test('an empty list is an empty tree, not a root node', () => {
    expect(tree([])).toEqual([])
  })
})
