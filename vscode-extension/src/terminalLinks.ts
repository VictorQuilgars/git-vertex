// terminalLinks.ts — what in a line of terminal output names a commit.
//
// `git log`, `git rebase`, a test runner, a coding agent: they all print
// SHAs, branch names and ranges, and every one of them is a row of the graph
// or a comparison the panel can open. This decides which spans of a line are
// such names; the VS Code half (extension.ts) draws them as links and acts on
// a click. Pure — no vscode import — so it runs under the display-free suite.

export interface RefLink {
  /** Offset of the span in the line, and its length. */
  start: number
  length: number
  text: string
  kind: 'sha' | 'ref' | 'range'
  /** The two ends of a range, `from..to` or `from...to`. */
  from?: string
  to?: string
}

// Seven to forty hex digits with at least one letter: a run of digits alone
// is a number far more often than a commit, and a link that is wrong is worse
// than one that is missing. Bounded by anything that is not part of a path or
// a word, so `deadbeef.txt` and `v1.0-deadbeef` stay text.
const SHA = /(?<![\w/.-])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![\w/.-])/g
// A ref name as git prints it: letters, digits, `/ . + - _`.
const TOKEN = /(?<![\w/.-])[\w][\w./+-]*(?![\w/.-])/g
const RANGE = /(?<![\w/.-])([\w][\w./+-]*?)(\.\.\.?)([\w][\w./+-]*)(?![\w/.-])/g

const isSha = (s: string) => /^(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$/.test(s)

/**
 * The commit names in `line`, left to right, non-overlapping. `isRef` says
 * whether a token is a branch, a tag or a remote branch of the repository —
 * a word is a link only when the repository has a ref of that name.
 */
export function findRefLinks(line: string, isRef: (name: string) => boolean): RefLink[] {
  const links: RefLink[] = []
  const taken = (start: number, end: number) => links.some(l => start < l.start + l.length && end > l.start)
  const names = (s: string) => isSha(s) || isRef(s)

  // Ranges first: `a..b` would otherwise read as two links, or as none.
  for (const m of line.matchAll(RANGE)) {
    const [text, from, , to] = m
    if (!names(from) || !names(to)) continue
    links.push({ start: m.index!, length: text.length, text, kind: 'range', from, to })
  }
  for (const m of line.matchAll(SHA)) {
    const start = m.index!
    if (taken(start, start + m[0].length)) continue
    links.push({ start, length: m[0].length, text: m[0], kind: 'sha' })
  }
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index!
    const text = m[0]
    if (taken(start, start + text.length) || isSha(text) || !isRef(text)) continue
    links.push({ start, length: text.length, text, kind: 'ref' })
  }
  return links.sort((a, b) => a.start - b.start)
}
