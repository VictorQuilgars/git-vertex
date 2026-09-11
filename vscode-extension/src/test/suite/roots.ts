// Where the sources are, found rather than counted.
//
// Tests read real files — the preload, the CHANGELOG, the webview bundle — and
// used to reach them by counting directories up from `__dirname`. That number
// is a property of the COMPILED layout, not of the test, and the layout moved
// once already (tsconfig.test.json now emits from the repo root so gitService
// can import the shared git core). Three files had the same `../../..` in them
// and all three broke at once.
//
// So walk up instead, and stop at the directory that actually is the extension:
// a package.json next to src/gitService.ts. Nothing in the compiled tree
// answers to that, whatever its name.
import * as fs from 'fs'
import * as path from 'path'

function findUp(from: string, matches: (dir: string) => boolean): string {
  let dir = from
  for (;;) {
    if (matches(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error(`no extension root above ${from}`)
    dir = parent
  }
}

/** vscode-extension/ */
export const EXT_ROOT = findUp(__dirname, dir =>
  fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'src', 'gitService.ts')))

/** The repository root — the desktop sources live under it. */
export const REPO_ROOT = path.resolve(EXT_ROOT, '..')
