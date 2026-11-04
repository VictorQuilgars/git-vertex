// dirDiff.ts — two trees side by side, for an external folder-compare tool (#79).
//
// `git difftool --dir-diff` does this for a configured difftool; the panel's
// tool is its own setting (Settings › External tools), so this does what
// `--dir-diff` does with it: two temporary folders, each holding only the
// files the comparison touches, as they are on that side — a file added on
// the right is absent on the left, a deleted one absent on the right, and a
// rename is the old name on the left and the new one on the right. A tool
// shown two whole checkouts would bury the twelve files that differ under the
// ten thousand that do not.
//
// The working tree is a side like any revision: its files are copied as they
// are on disk, so a comparison stays what it was when it opened even if the
// file is edited after. No `vscode` import: tested in the display-free suite.

import { execFile } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { gitEnv } from './gitService'
import { parseChangePairs, type ChangePair } from '../../src/main/git-core'

/** The working tree, as the right side of a comparison. */
export const WORKING = 'working'

function git(root: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, env: gitEnv(), encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }, (err, out, stderr) => {
      if (err) reject(new Error(String(stderr || err.message).trim()))
      else resolve(out)
    })
  })
}

/** A path from git, made safe to join under a folder: no climbing, no absolute root. */
function inside(dir: string, rel: string): string | null {
  const target = path.resolve(dir, rel)
  return target.startsWith(path.resolve(dir) + path.sep) ? target : null
}

async function write(dir: string, rel: string, bytes: Buffer | null): Promise<void> {
  const target = inside(dir, rel)
  if (!target || bytes === null) return
  await fs.promises.mkdir(path.dirname(target), { recursive: true })
  await fs.promises.writeFile(target, bytes)
}

export interface DirDiff { leftDir: string; rightDir: string; files: number }

/**
 * Materialise `left` (a commit) against `right` (a commit, or WORKING) into
 * two fresh temporary folders. Tracked files only on the working side, as
 * `git diff <rev>` sees it — an untracked file is in no comparison git makes.
 */
export async function prepareDirDiff(root: string, left: string, right: string, tmpRoot = os.tmpdir()): Promise<DirDiff> {
  const range = right === WORKING ? [left] : [left, right]
  const raw = (await git(root, ['diff', '--name-status', '-z', '-M', ...range, '--'])).toString('utf8')
  const pairs: ChangePair[] = parseChangePairs(raw, left, right)
  const base = await fs.promises.mkdtemp(path.join(tmpRoot, 'git-vertex-dirdiff-'))
  const short = (r: string) => (r === WORKING ? 'working' : r.slice(0, 7))
  const leftDir = path.join(base, short(left))
  const rightDir = path.join(base, right === WORKING ? 'working' : short(right) === short(left) ? `${short(right)}-b` : short(right))
  await fs.promises.mkdir(leftDir, { recursive: true })
  await fs.promises.mkdir(rightDir, { recursive: true })
  const blob = (ref: string, rel: string) => git(root, ['cat-file', 'blob', `${ref}:${rel}`]).catch(() => null)
  for (const p of pairs) {
    if (p.before) await write(leftDir, p.before.path, await blob(p.before.ref, p.before.path))
    if (p.after) {
      const bytes = right === WORKING
        ? await fs.promises.readFile(path.join(root, p.after.path)).catch(() => null)
        : await blob(p.after.ref, p.after.path)
      await write(rightDir, p.after.path, bytes)
    }
  }
  return { leftDir, rightDir, files: pairs.length }
}
