import { spawn } from 'child_process'

// `git blame` reading + parsing, deliberately free of any `vscode` import so
// it stays unit-testable in plain node (see src/test/suite/blame.test.ts).

/** One buffer line, resolved to the commit that last touched it. */
export interface BlameLine {
  /** 1-based line number in the blamed buffer. */
  line: number
  hash: string
  shortHash: string
  author: string
  authorMail: string
  /** Author date, epoch seconds. */
  authorTime: number
  summary: string
  /** True for lines that exist only in the working tree (all-zero sha). */
  uncommitted: boolean
}

export interface BlameOptions {
  /** 1-based line to blame on its own, instead of the whole file. */
  line?: number
  /** Buffer contents to blame instead of the file on disk (unsaved edits). */
  contents?: string
  /** Pass -w, so re-indenting a file doesn't reassign every line to whoever did it. */
  ignoreWhitespace?: boolean
}

// Header of a blame group: "<sha> <line-in-original> <line-in-final> [<count>]".
// 40 hex for sha-1, 64 for a sha-256 repository.
const HEADER_RE = /^([0-9a-f]{40,64})\s+\d+\s+(\d+)/

function runGit(cwd: string, args: string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // LC_ALL=C: git's *messages* are translated, and a French error string
    // parsed as an English one is how the remote-prune bug shipped once.
    const child = spawn('git', args, { cwd, env: { ...process.env, LC_ALL: 'C' } })
    let out = ''
    let err = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `git exited with ${code}`))
    })
    // git can reject the request before reading stdin (untracked path); the
    // resulting EPIPE is expected and must not become an unhandled error.
    child.stdin.on('error', () => { /* ignored — the close handler reports it */ })
    child.stdin.end(stdin ?? '')
  })
}

/**
 * Parse `git blame --line-porcelain` output. That flag repeats every header
 * field for every line (unlike plain --porcelain, which only sends them the
 * first time a commit appears), so no cross-line commit cache is needed here.
 */
export function parseLinePorcelain(out: string): BlameLine[] {
  const lines: BlameLine[] = []
  let cur: Partial<BlameLine> = {}

  for (const raw of out.split('\n')) {
    const header = raw.match(HEADER_RE)
    if (header) {
      cur = { hash: header[1], line: parseInt(header[2], 10) }
      continue
    }

    // A tab-prefixed line is the file content itself, and closes the entry.
    if (raw.startsWith('\t')) {
      const hash = cur.hash ?? ''
      lines.push({
        line: cur.line ?? lines.length + 1,
        hash,
        shortHash: hash.slice(0, 8),
        author: cur.author ?? '',
        authorMail: cur.authorMail ?? '',
        authorTime: cur.authorTime ?? 0,
        summary: cur.summary ?? '',
        // Detected on the sha, not on git's "Not Committed Yet" author string,
        // which is a message and therefore locale-dependent.
        uncommitted: hash.length > 0 && /^0+$/.test(hash),
      })
      cur = {}
      continue
    }

    const sep = raw.indexOf(' ')
    const key = sep === -1 ? raw : raw.slice(0, sep)
    const value = sep === -1 ? '' : raw.slice(sep + 1)
    switch (key) {
      case 'author': cur.author = value; break
      case 'author-mail': cur.authorMail = value.replace(/^<|>$/g, ''); break
      case 'author-time': cur.authorTime = parseInt(value, 10) || 0; break
      case 'summary': cur.summary = value; break
    }
  }

  return lines
}

/**
 * Blame `relPath` (repo-relative) inside `repoRoot`. Returns [] rather than
 * throwing for everything that legitimately can't be blamed — untracked file,
 * binary blob, path outside the repository.
 */
export async function blameFile(
  repoRoot: string,
  relPath: string,
  opts: BlameOptions = {},
): Promise<BlameLine[]> {
  const args = ['blame', '--line-porcelain']
  if (opts.ignoreWhitespace) args.push('-w')
  // One line asked for, one line blamed: the commands that act on the cursor
  // do not need the other ten thousand.
  if (opts.line !== undefined) args.push('-L', `${opts.line},${opts.line}`)
  // No revision with --contents: git blames the given buffer against history,
  // which is what lets unsaved edits show up as uncommitted lines.
  if (opts.contents !== undefined) args.push('--contents', '-')
  args.push('--', relPath)

  try {
    return parseLinePorcelain(await runGit(repoRoot, args, opts.contents))
  } catch {
    return []
  }
}

/** `user.email` as git resolves it for this repository ('' when unset). */
export async function getUserEmail(repoRoot: string): Promise<string> {
  try {
    return (await runGit(repoRoot, ['config', '--get', 'user.email'])).trim()
  } catch {
    return ''
  }
}
