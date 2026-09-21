import fs from 'fs'
import path from 'path'

// A file tree and a flat list are two READINGS of one set of files, toggled on
// the same bar. Whichever is up, the rows start at the same place — otherwise
// the toggle shifts everything sideways, and the reason it did is invisible:
// the tree's indent is written in TypeScript (the depth) and the list's inset
// in CSS (the row's padding), so nothing sat next to anything.
//
// The rows say `padding-left: calc(var(--tree-gutter) + <depth>px)`, and this
// checks the other half — that `--tree-gutter` is the left padding of the list
// the tree replaces, in the same token, so the two follow the density together.

const css = fs.readFileSync(path.resolve(__dirname, '../RightPanel.css'), 'utf8')

/** Every rule in the sheet, as its selector text and its body. */
const RULES: Array<[string, string]> = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(m => [m[1].split(/\r?\n/).pop()!.trim(), m[2]] as [string, string])

/** The `--tree-gutter` a selector declares, or the left value of its padding. */
function gutterOf(selector: string): string | null {
  const body = RULES.find(([sel]) => sel === selector)?.[1]
  if (body === undefined) return null
  const named = body.match(/--tree-gutter\s*:\s*([^;]+);/)
  if (named) return named[1].trim()
  const padLeft = body.match(/padding-left\s*:\s*([^;]+);/)
  if (padLeft) return padLeft[1].trim()
  const pad = body.match(/(?:^|[;{\s])padding\s*:\s*([^;]+);/)
  if (!pad) return null
  // `padding: <y> <x>` and `padding: <t> <r> <b> <l>` — never a var() with spaces in it.
  const parts = pad[1].trim().split(/\s+/)
  return parts.length >= 4 ? parts[3] : parts.length >= 2 ? parts[1] : parts[0]
}

// tree row selector → the flat list row it toggles with
const PAIRS: Array<[string, string, string]> = [
  ['.st-tr', '.st-file-row', 'the working changes in the right panel'],
  ['.rp-file-list .st-tr', '.rp-file-row', "the commit's files"],
  ['.stx-row.st-tr', '.stx-row', 'the embedded staging list'],
]

describe('the file trees start where their lists do', () => {
  test.each(PAIRS)('%s matches %s — %s', (tree, list) => {
    const treeGutter = gutterOf(tree)
    const listInset = gutterOf(list)
    expect(listInset).not.toBeNull()
    expect(treeGutter).toBe(listInset)
  })

  test('every gutter is a spacing token, so the density moves it too', () => {
    for (const [tree] of PAIRS) expect(gutterOf(tree)).toMatch(/^var\(--space-[a-z0-9]+\)$/)
  })
})
