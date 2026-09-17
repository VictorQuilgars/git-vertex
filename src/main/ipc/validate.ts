// What the boundary refuses, and where it is written down.
//
// The renderer is sandboxed, the secrets never reach it and every request names
// the repository it is about — and then the handlers took the window's
// arguments exactly as they came. A repository path, a ref, a file path inside
// the repository, a remote name: none was checked at the door. Most of the
// damage a bad argument could do was already contained (git refuses a malformed
// ref, GitService.assertRef guards the methods that shell out), but that is per
// method and by memory. This is the door.
//
// One table, one rule per argument, read by ipc/handle.ts before the handler
// runs — so a refused argument never reaches git and never becomes a rejected
// promise across the bridge; it answers `{ error }` like every other refusal.
// ⚠️ `ipc-validate.test.ts` fails when a handler grows an argument that looks
// like a path or a ref and the table says nothing about it. `null` is an
// answer — "looked at, nothing to enforce" — and a handler that takes no such
// argument needs no entry at all.
//
// Pure: no electron, no fs. It is given the repository's path, it does not go
// looking for one.
import { isAbsolute, resolve, sep } from 'path'

export type ArgRule =
  /** A revision as git will read it: a hash, a branch, `HEAD~2`, `a..b`. Loose on purpose. */
  | 'rev'
  /** An array of those. */
  | 'revs'
  /** A ref name being CREATED — git check-ref-format's own rules. */
  | 'refName'
  /** A remote's name: a ref name with no slash in it. */
  | 'remote'
  /** A path inside the repository, given relative to it. */
  | 'repoFile'
  /** An array of those. */
  | 'repoFiles'
  /** An absolute path on this machine — a repository, a worktree, a directory. */
  | 'absPath'
  /** One path segment: the name of a directory to create, never a path. */
  | 'fileName'
  /** Somewhere git can clone from or push to. */
  | 'gitUrl'

/** A rule per argument the handler takes, `null` where there is nothing to enforce. */
export type ArgSpec = ArgRule | Record<string, ArgRule> | null

// NUL and friends: they have no business in a ref, a path or a URL, and a
// newline in an argument is how a value stops being one value.
const CONTROL = /[\u0000-\u001F\u007F]/

// ── The rules themselves ─────────────────────────────────────────
// Each returns a sentence, or null when the value is fine. Absent values are
// not this file's business: an argument the caller did not send is the
// handler's own affair, and `git:set-upstream(branch)` legitimately sends one.

export function revError(v: unknown, what = 'reference'): string | null {
  if (typeof v !== 'string') return `The ${what} must be text`
  const s = v.trim()
  if (!s) return `Empty ${what}`
  // Not a shell — simple-git and execFile pass arguments as they are — but git
  // itself reads a leading dash as an option, whoever handed it over.
  if (s.startsWith('-')) return `Invalid ${what}: "${v}"`
  if (CONTROL.test(v)) return `Invalid ${what}: control characters`
  if (v.length > 1024) return `The ${what} is too long`
  return null
}

/**
 * A name for a ref that does not exist yet — git check-ref-format's rules,
 * which are stricter than what a revision may look like: `HEAD~2` is a fine
 * thing to ask about and a terrible thing to call a branch.
 */
export function refNameError(v: unknown, what = 'name'): string | null {
  const bad = revError(v, what)
  if (bad) return bad
  const s = (v as string).trim()
  if (/[\s~^:?*[\\]/.test(s)) return `Invalid ${what}: "${s}"`
  if (s.includes('..') || s.includes('@{') || s.includes('//')) return `Invalid ${what}: "${s}"`
  if (s.startsWith('/') || s.endsWith('/') || s.endsWith('.') || s.endsWith('.lock')) return `Invalid ${what}: "${s}"`
  if (s === '@') return `Invalid ${what}: "${s}"`
  return null
}

export function remoteError(v: unknown): string | null {
  const bad = refNameError(v, 'remote name')
  if (bad) return bad
  if ((v as string).includes('/')) return `Invalid remote name: "${v}"`
  return null
}

export function absPathError(v: unknown, what = 'path'): string | null {
  if (typeof v !== 'string') return `The ${what} must be text`
  if (!v.trim()) return `Empty ${what}`
  if (CONTROL.test(v)) return `Invalid ${what}: control characters`
  if (!isAbsolute(v)) return `The ${what} must be absolute: "${v}"`
  return null
}

export function fileNameError(v: unknown, what = 'name'): string | null {
  if (typeof v !== 'string') return `The ${what} must be text`
  const s = v.trim()
  if (!s) return `Empty ${what}`
  if (CONTROL.test(v)) return `Invalid ${what}: control characters`
  if (s.startsWith('-')) return `Invalid ${what}: "${v}"`
  if (s.includes('/') || s.includes('\\') || s === '.' || s === '..') return `Invalid ${what}: "${v}"`
  return null
}

/**
 * A path the repository contains. The renderer sends these relative — that is
 * what git prints and what every list here holds — and an absolute one that
 * lands inside the repository is fine too. What is refused is a path that
 * leaves it: `../../.ssh/id_rsa` is not a file of this repository, whichever
 * pane asked for it. With no repository open there is nothing to be inside of,
 * so only the cheap checks apply.
 */
export function repoFileError(v: unknown, repoPath: string | null, what = 'file'): string | null {
  if (typeof v !== 'string') return `The ${what} must be text`
  if (!v.trim()) return `Empty ${what}`
  if (CONTROL.test(v)) return `Invalid ${what}: control characters`
  if (v.trim().startsWith('-')) return `Invalid ${what}: "${v}"`
  if (!repoPath) return null
  const root = resolve(repoPath)
  const full = resolve(root, v)
  if (full !== root && !full.startsWith(root + sep)) return `Outside the repository: "${v}"`
  return null
}

/**
 * Somewhere git can clone from. Not http(s) only — an SSH remote is the common
 * case and `git@host:owner/repo.git` is not a URL any parser accepts — so what
 * is enforced is the shape, and that it cannot be read as an option.
 */
export function gitUrlError(v: unknown): string | null {
  if (typeof v !== 'string') return 'The URL must be text'
  const s = v.trim()
  if (!s) return 'Empty URL'
  if (CONTROL.test(v)) return 'Invalid URL: control characters'
  if (s.startsWith('-')) return `Invalid URL: "${v}"`
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(s)
  if (scheme) {
    const ok = ['http', 'https', 'ssh', 'git', 'file']
    if (!ok.includes(scheme[1].toLowerCase())) return `Unsupported URL scheme: "${scheme[1]}"`
    return null
  }
  // scp-like (user@host:path), or a path on this machine.
  if (/^[^@\s]+@[^:\s]+:.+/.test(s) || isAbsolute(s)) return null
  return `Invalid URL: "${v}"`
}

const firstError = (errors: (string | null)[]): string | null => errors.find(e => e) ?? null

// ── The table ────────────────────────────────────────────────────
// Positional, over the handler's own arguments — the event is not one of them.

export const ARG_RULES: Record<string, ArgSpec[]> = {
  // Opening, creating, cloning
  'git:set-repo': ['absPath'],
  'git:init-repo': ['absPath'],
  'git:init-advanced': [{ location: 'absPath', name: 'fileName', branch: 'refName' }],
  'git:clone-to': [{ url: 'gitUrl', location: 'absPath', name: 'fileName' }],
  'git:read-readme': ['absPath'],

  // Reading history
  'git:get-log': [{ refs: 'revs', excludes: 'revs' }],
  'git:get-diff': ['rev'],
  'git:diff-between-commits': ['rev', 'rev', null],
  'git:files-between-commits': ['rev', 'rev', null],
  'git:get-merge-base': ['rev', 'rev'],
  'git:get-commit-files': ['rev'],
  'git:get-commit-body': ['rev'],
  'git:get-last-commit-message': ['rev'],
  'git:get-rebase-sequence': ['rev'],
  'git:locate-in-history': ['revs', { refs: 'revs', excludes: 'revs' }],
  'git:compare-branches': ['rev', 'rev'],
  'git:get-blame': ['rev', 'repoFile'],
  'git:get-file-history': ['repoFile'],
  'git:get-file-at-commit': ['rev', 'repoFile'],
  'git:file-diff-at-commit': ['rev', 'repoFile'],
  'git:diff-commit-to-working': ['rev'],
  'git:search-in-diffs': [null],

  // The working tree
  'git:stage': ['repoFiles'],
  'git:unstage': ['repoFiles'],
  'git:discard-file': ['repoFile'],
  'git:get-working-file-diff': ['repoFile', null, null],
  'git:get-file-content': ['repoFile'],
  'git:get-conflict-versions': ['repoFile'],
  'git:resolve-conflict-side': ['repoFile', null],
  'git:commit': [null, null],
  'git:amend-message': [null],
  'git:rename-stash': [null, null],
  'git:create-stash': [null, { paths: 'repoFiles' }],
  'git:restore-file': ['rev', 'repoFiles'],
  'git:mark-resolved': ['repoFile'],
  'git:resolve-conflict': ['repoFile', null],
  // A list of objects: the rule is applied to each element's fields.
  'git:interactive-rebase': [{ hash: 'rev' }, null],

  // Moving about, rewriting
  'git:checkout': ['rev'],
  'git:get-checkout-plan': ['rev'],
  'git:checkout-tracking': ['rev', 'refName'],
  'git:create-branch': ['refName'],
  'git:create-branch-at': ['refName', 'rev', null],
  'git:delete-branch': ['rev'],
  'git:rename-branch': ['rev', 'refName'],
  'git:merge': ['rev'],
  'git:rebase-onto': ['rev'],
  'git:move-branch-to': ['rev', 'rev'],
  'git:rebase-branch-onto': ['rev', 'rev'],
  'git:merge-commit-into': ['rev', 'rev'],
  'git:cherry-pick': ['rev'],
  'git:revert': ['rev'],
  'git:reset': ['rev', null],
  'git:get-reword-plan': ['rev'],
  'git:drop-commit': ['rev'],
  'git:drop-commits': ['revs'],
  'git:move-commit': ['rev', null],
  'git:create-patch': ['rev'],
  'git:predict-conflicts': ['rev', 'rev', 'rev'],
  'git:predict-rebase-conflicts': ['rev', 'rev'],
  'git:conflict-outlook': ['rev'],
  'git:continue-rebase': [null],
  'git:continue-merge': [null],

  // Remotes, upstreams, tags
  'git:push-to': ['remote', 'rev', null, null],
  'git:push-branch': ['rev'],
  'git:push-to-commit': ['rev'],
  'git:delete-remote-branch': ['rev'],
  'git:set-upstream': ['rev', 'rev'],
  'git:add-remote': ['remote', 'gitUrl'],
  'git:remove-remote': ['remote'],
  'git:rename-remote': ['remote', 'remote'],
  'git:fetch-remote': ['remote'],
  'git:set-default-remote': ['remote'],
  'git:prune-remote': ['remote'],
  'git:prune-gone-branches': ['revs'],
  'git:create-tag': ['refName', 'rev', null],
  'git:delete-tag': ['rev'],
  'git:push-tag': ['rev', 'remote'],
  'git:delete-remote-tag': ['rev', 'remote'],

  // Submodules, worktrees, gitflow
  'git:init-submodule': ['repoFile'],
  'git:update-submodule': ['repoFile'],
  'git:deinit-submodule': ['repoFile'],
  'git:sync-submodule': ['repoFile'],
  'git:add-worktree': ['absPath', 'rev', 'refName'],
  'git:remove-worktree': ['absPath', null],
  'git:gitflow-start': [null, 'refName'],
  'git:gitflow-finish': [null, 'rev', 'refName'],

  // The identity is a person's name, not a ref — looked at, nothing to enforce.
  'git:set-global-config': [null, null],
}

function ruleError(rule: ArgRule, value: unknown, repoPath: string | null): string | null {
  switch (rule) {
    case 'rev': return revError(value)
    case 'revs': return Array.isArray(value) ? firstError(value.map(v => revError(v))) : 'The references must be a list'
    case 'refName': return refNameError(value)
    case 'remote': return remoteError(value)
    case 'repoFile': return repoFileError(value, repoPath)
    case 'repoFiles': return Array.isArray(value) ? firstError(value.map(v => repoFileError(v, repoPath))) : 'The files must be a list'
    case 'absPath': return absPathError(value)
    case 'fileName': return fileNameError(value)
    case 'gitUrl': return gitUrlError(value)
  }
}

/**
 * What the boundary says about this call, or null when it has nothing to say.
 * Never throws: a validator failing on a shape nobody foresaw must not become a
 * rejected promise across the bridge, which is the thing it is here to prevent.
 */
export function argError(channel: string, args: unknown[], repoPath: string | null): string | null {
  const spec = ARG_RULES[channel]
  if (!spec) return null
  try {
    for (let i = 0; i < spec.length; i++) {
      const rule = spec[i]
      const value = args[i]
      // Absent is not invalid, and neither is empty: an optional argument
      // nobody sent, the `null` that means "against the working tree", and the
      // `''` the worktree dialog sends for "no ref, git picks" all reach the
      // handler, where the guards that were already there say what they always
      // said. What this door adds is the refusal of malformed values, not a new
      // opinion about missing ones.
      if (rule === null || value === undefined || value === null || value === '') continue
      if (typeof rule === 'string') {
        const bad = ruleError(rule, value, repoPath)
        if (bad) return bad
        continue
      }
      if (typeof value !== 'object') return 'Malformed arguments'
      // An object, or a list of them — an object rule reads the fields of each.
      for (const item of Array.isArray(value) ? value : [value]) {
        if (typeof item !== 'object' || item === null) return 'Malformed arguments'
        for (const [field, fieldRule] of Object.entries(rule)) {
          const fieldValue = (item as Record<string, unknown>)[field]
          if (fieldValue === undefined || fieldValue === null) continue
          const bad = ruleError(fieldRule, fieldValue, repoPath)
          if (bad) return bad
        }
      }
    }
  } catch {
    return 'Malformed arguments'
  }
  return null
}

/** The envelope the preload puts in front of every call: a repository, or nothing. */
export function envelopeError(repo: unknown): string | null {
  if (repo === undefined || repo === null) return null
  return absPathError(repo, 'repository path')
}
