// Git's own caches, switched on for a repository — the part of "slow on
// Windows" that is not ours to make faster in code.
//
// Everything else on this branch cut what the app asks git for. This asks for
// the same things and has git answer them faster, which past a certain
// repository size is the larger number by far: `git status` walks the working
// tree, and on NTFS behind a virus scanner walking a large one is seconds,
// however few times we do it.
//
// Three settings, and none of them is ours to turn on quietly — they are
// written into the repository's own config and every other git client on the
// machine reads them afterwards. So this runs only when the user has asked
// for it in Settings, the row there names the keys, and what was written can
// be undone with `git config --unset`.
//
//   core.fsmonitor        A daemon watches the working tree and tells git
//                         what changed, so `status` stops walking it. Built
//                         into git since 2.37, on Windows and macOS. This is
//                         the one that matters.
//   fetch.writeCommitGraph  Keeps the commit-graph current after every fetch.
//                         The graph is what lets `log --all` walk history by
//                         generation number instead of by opening commit
//                         objects; one is written here on the first pass.
//
// ── The one that is NOT here: core.untrackedCache ──────────────
//
// It belongs in this list on merit — `status` remembering which directories
// held no untracked files is worth real time on Windows — and it is left out
// because of how it has to be switched on. Enabling it blind is not an
// option: git's documentation is explicit that on a filesystem whose mtimes
// cannot be trusted the cache returns WRONG answers, not slow ones. And the
// test git ships for that, `update-index --test-untracked-cache`, writes a
// `mtime-test-XXXXXX` file INTO THE WORKING TREE and sleeps on it for about
// six seconds. Measured here: 6.1 s, an index.lock taken for the duration,
// and a stray untracked file that our own watcher sees and the staging pane
// would list. A feature meant to be invisible must not put a file in
// someone's repository and wait. If it is ever wanted it needs to be an
// action the user presses, watching it happen — not a background pass.
//
// A repository is tuned once. The marker is in its own config beside
// `gitvertex.defaultRemote`, which is where this app already keeps per-
// repository state.
import { isGitVersionAtLeast } from './git-version'

/** Run git in the repository. Never throws: a non-zero exit is a result. */
export type TuningRunner = (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>

/** What became of one setting. */
export type Outcome = 'set' | 'already' | 'unsupported' | 'failed'

export interface TuningReport {
  fsmonitor: Outcome
  commitGraph: Outcome
}

/** The marker, and its value — bumped if this ever learns to do more. */
export const TUNED_KEY = 'gitvertex.tuned'
export const TUNED_VALUE = '1'

/** Built-in fsmonitor: git 2.37, and only where the daemon exists. */
export const MIN_GIT_FOR_FSMONITOR = '2.37'
const FSMONITOR_PLATFORMS = new Set(['win32', 'darwin'])

/** Has this repository already been through it? One process, and usually the only one. */
export async function isTuned(run: TuningRunner): Promise<boolean> {
  const r = await run(['config', '--get', TUNED_KEY])
  return r.code === 0 && r.stdout.trim() === TUNED_VALUE
}

/**
 * Switch on what this platform and this filesystem will take. Best-effort
 * throughout: each setting is independent, and one that cannot be had is
 * reported rather than thrown — a repository on a network share should end up
 * with the caches it can support and no error in the user's face.
 */
export async function tuneRepository(
  run: TuningRunner,
  opts: { gitVersion: string | null; platform: string },
): Promise<TuningReport> {
  const report: TuningReport = { fsmonitor: 'unsupported', commitGraph: 'failed' }

  // ── core.fsmonitor ─────────────────────────────────────────
  const canFsmonitor = !!opts.gitVersion
    && isGitVersionAtLeast(opts.gitVersion, MIN_GIT_FOR_FSMONITOR)
    && FSMONITOR_PLATFORMS.has(opts.platform)
  if (canFsmonitor) {
    const existing = await run(['config', '--get', 'core.fsmonitor'])
    // A value already there is the user's — very possibly a path to their own
    // hook, which `true` would replace with the built-in daemon.
    if (existing.code === 0 && existing.stdout.trim()) report.fsmonitor = 'already'
    else report.fsmonitor = (await run(['config', 'core.fsmonitor', 'true'])).code === 0 ? 'set' : 'failed'
  }

  // ── the commit-graph ───────────────────────────────────────
  // Written once here, then kept current by fetch. On a shallow history this
  // costs nothing; on a deep one it is the difference between walking history
  // by generation number and opening every commit object.
  const written = await run(['commit-graph', 'write', '--reachable'])
  if (written.code === 0) {
    report.commitGraph = 'set'
    await run(['config', 'fetch.writeCommitGraph', 'true'])
  }

  await run(['config', TUNED_KEY, TUNED_VALUE])
  return report
}

/** One line for the log, so what happened to a repository is answerable. */
export function describeTuning(report: TuningReport): string {
  return `fsmonitor ${report.fsmonitor}, commit-graph ${report.commitGraph}`
}
