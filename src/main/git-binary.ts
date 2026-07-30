// Which git this app actually runs — resolved once, at startup.
//
// The problem this solves: an Electron app launched from the Finder or the Dock
// does not inherit the PATH of a login shell. It gets the bare
// `/usr/bin:/bin:/usr/sbin:/sbin`, so `git` resolves to Apple's Command Line
// Tools build (2.39 on current macOS) even for someone whose terminal has
// Homebrew's 2.50 first on PATH. Every git call went through that resolution,
// which made two things happen at once:
//
//   - conflict prediction (git 2.40+) silently did nothing, and
//   - the notice explaining why named a version the user does not recognise,
//     because in *their* terminal `git --version` says something newer.
//
// So the fix is not the notice, it is the resolution: ask the login shell for
// its PATH, resolve git against that, and keep the absolute path so nothing
// re-resolves it per call. The path is then shown wherever the version is, or
// the message is unactionable — "git 2.39.3" and "git 2.39.3 — /usr/bin/git"
// are a world apart when you have two gits installed.
import { execFile } from 'child_process'
import { promisify } from 'util'
import { accessSync, constants } from 'fs'
import { parseGitVersion } from './git-version'

const exec = promisify(execFile)

export interface GitBinaryInfo {
  /**
   * What to invoke. An absolute path when we resolved one, otherwise the bare
   * `'git'` — which still works, it just leans on `searchPath`.
   */
  path: string
  /** PATH child processes should see. Undefined = use the process's own. */
  searchPath: string | undefined
  version: string | null
  /** Where `path` came from — surfaced in Settings so the answer is checkable. */
  source: 'setting' | 'login-shell' | 'process-path' | 'not-found'
}

// Markers, because a login shell prints motd, direnv output and whatever else
// an rc file feels like writing before our own echo lands.
const OPEN = '__GV_PATH_OPEN__'
const CLOSE = '__GV_PATH_CLOSE__'

/**
 * What we ask the login shell to print. Exported for tests, because the one
 * thing that can silently break here is not parsing but *quoting*: see the
 * braces below.
 */
export function shellPathCommand(): string {
  // ${PATH} must be braced. Both markers start with an underscore, and an
  // underscore is a valid identifier character — `$PATH${CLOSE}` unbraced parses
  // as a single variable named `PATH__GV_PATH_CLOSE__`, which is unset, so the
  // shell prints the open marker and nothing else, and we silently fall back to
  // the truncated PATH this module exists to replace. Verified on zsh.
  return `echo "${OPEN}\${PATH}${CLOSE}"`
}

/**
 * PATH out of a login shell's noisy output. Exported for tests: this is the
 * part that breaks when someone's `.zshrc` decides to print a banner.
 */
export function parseShellPath(stdout: string): string | null {
  const start = stdout.indexOf(OPEN)
  const end = stdout.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return null
  const value = stdout.slice(start + OPEN.length, end).trim()
  return value || null
}

/**
 * Merge two PATH strings, `primary` winning, without dropping anything only
 * `secondary` had. Order matters — that is the whole point of the exercise —
 * and duplicates are removed so the result stays readable in Settings.
 */
export function mergePathEntries(primary: string | null, secondary: string | null, sep = ':'): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of [...(primary?.split(sep) ?? []), ...(secondary?.split(sep) ?? [])]) {
    const entry = part.trim()
    if (!entry || seen.has(entry)) continue
    seen.add(entry)
    out.push(entry)
  }
  return out.join(sep)
}

/**
 * Whether simple-git will accept this path via `customBinary`. It applies its
 * own character allow-list (see `isBadArgument` in
 * simple-git/dist/cjs/index.js) and THROWS on anything else — notably any path
 * containing a space, which is where Windows keeps git:
 * `C:\Program Files\Git\cmd\git.exe`. When this returns false we hand simple-git
 * the bare `'git'` and let the corrected PATH do the work, rather than passing
 * `unsafe.allowUnsafeCustomBinary` for a path we did not get from the user.
 */
export function isSimpleGitSafeBinary(binary: string): boolean {
  return /^([a-z]:)?([a-z0-9/.\\_~-]+)$/i.test(binary)
}

function isExecutable(path: string): boolean {
  try { accessSync(path, constants.X_OK); return true } catch { return false }
}

/**
 * Ask the user's login shell for its PATH. Posix only: on Windows a GUI process
 * inherits the user's environment properly, so there is nothing to recover.
 * Any failure — no $SHELL, an rc file that hangs, a shell that does not know
 * `-ilc` — resolves to null and we carry on with the process PATH.
 */
async function loginShellPath(): Promise<string | null> {
  if (process.platform === 'win32') return null
  const shell = process.env.SHELL
  if (!shell) return null
  try {
    const { stdout } = await exec(
      shell,
      ['-ilc', shellPathCommand()],
      // An interactive shell sources the user's rc files, which is exactly what
      // we want and also what can take a while (nvm, pyenv, conda…). Cap it:
      // a slow shell must not hold up the window.
      { timeout: 4000, encoding: 'utf8', env: { ...process.env, TERM: 'dumb' } },
    )
    return parseShellPath(stdout)
  } catch {
    return null
  }
}

/** Absolute path of the first `git` on `searchPath`. */
async function whichGit(searchPath: string | undefined): Promise<string | null> {
  const env = searchPath ? { ...process.env, PATH: searchPath } : process.env
  const [cmd, args] = process.platform === 'win32'
    ? ['where', ['git.exe']]
    : ['/usr/bin/which', ['git']]
  try {
    const { stdout } = await exec(cmd as string, args as string[], { env, encoding: 'utf8' })
    // `where` can return several matches; the first is the one PATH would pick.
    const first = stdout.split(/\r?\n/).map(l => l.trim()).find(Boolean)
    return first ?? null
  } catch {
    return null
  }
}

async function versionOf(binary: string, searchPath: string | undefined): Promise<string | null> {
  const env = searchPath ? { ...process.env, PATH: searchPath, LC_ALL: 'C' } : { ...process.env, LC_ALL: 'C' }
  try {
    const { stdout } = await exec(binary, ['--version'], { env, encoding: 'utf8' })
    return parseGitVersion(stdout)
  } catch {
    return null
  }
}

/**
 * Resolve the git to use. `configured` is the `gitBinaryPath` setting — an
 * explicit choice always wins, and is reported as such even when it turns out
 * not to be executable, because silently ignoring it is how you end up
 * debugging the wrong binary.
 */
export async function resolveGitBinary(configured?: string): Promise<GitBinaryInfo> {
  const sep = process.platform === 'win32' ? ';' : ':'
  const shellPath = await loginShellPath()
  const searchPath = shellPath
    ? mergePathEntries(shellPath, process.env.PATH ?? null, sep)
    : undefined

  const chosen = configured?.trim()
  if (chosen) {
    return {
      path: chosen,
      searchPath,
      version: isExecutable(chosen) ? await versionOf(chosen, searchPath) : null,
      source: 'setting',
    }
  }

  const found = await whichGit(searchPath)
  if (found) {
    return {
      path: found,
      searchPath,
      version: await versionOf(found, searchPath),
      // Says whether recovering the login shell's PATH is what found this one.
      source: shellPath ? 'login-shell' : 'process-path',
    }
  }

  // No git on PATH at all. Keep 'git' so error messages stay recognisable
  // ("git: command not found") rather than mentioning a path we invented.
  return { path: 'git', searchPath, version: await versionOf('git', searchPath), source: 'not-found' }
}

// ── The resolved binary, for everything that runs git ──────────
//
// Resolved once at startup (initGitBinary) and read synchronously everywhere
// else, because gitEnv()/simpleGitEnv() are called on every single git command
// and cannot await. Before init, callers get the plain `'git'` they had before.
let current: GitBinaryInfo = { path: 'git', searchPath: undefined, version: null, source: 'process-path' }
let pending: Promise<GitBinaryInfo> | null = null

export function getGitBinary(): GitBinaryInfo {
  return current
}

/**
 * The resolved binary, waiting for a resolution still in flight. Anything that
 * *reports* the git in use (the startup notice, Settings) should await this
 * rather than read `getGitBinary()` — at first paint the login shell may not
 * have answered yet, and reporting the fallback would be reporting the very
 * confusion this module exists to remove.
 */
export function gitBinaryReady(): Promise<GitBinaryInfo> {
  return pending ?? Promise.resolve(current)
}

export function initGitBinary(configured?: string): Promise<GitBinaryInfo> {
  pending = resolveGitBinary(configured).then(info => { current = info; return info })
  return pending
}
