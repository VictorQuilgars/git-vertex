// remoteUrl.ts — turning a git remote into links you can share.
//
// This did not exist. "Open commit on remote" was the only thing either product
// could do, and it built its URL by hand — `https://github.com/${owner}/${repo}/commit/${hash}`
// written out three times (desktop App.tsx twice, the panel's app.tsx once),
// with github.com hardcoded in all three. Nothing else could be linked, and a
// repository hosted anywhere else silently produced a URL to a page that does
// not exist.
//
// Everything here is pure: a remote URL in, a link out. It lives in the shared
// renderer because both products need the same answers, and because the whole
// point of the lot that added it is that there is now ONE place that knows how
// a link is shaped.

/** A remote as `getRemotes` reports it. */
export interface Remote { name: string; fetchUrl: string; pushUrl: string }

/** What a remote URL resolves to, once we know how to read it. */
export interface RemoteRepo {
  /** Host as it appears in the URL — `github.com`, `gitlab.example.com`. */
  host: string
  /** Everything between the host and the repository name (`owner`, `group/sub`). */
  owner: string
  /** Repository name, `.git` removed. */
  repo: string
  /** Which family of URL shapes this host uses. */
  kind: HostKind
  /** `https://<host>/<owner>/<repo>` — the browsable root. */
  base: string
}

export type HostKind = 'github' | 'gitlab' | 'bitbucket'

/**
 * Every URL shape we know, by host family.
 *
 * Only `github` is exercised by Git Vertex today — it is the only host we
 * authenticate against, and the only one whose links have been opened in anger.
 * The other two are here because the shapes are stable and public, and because
 * a builder with one hardcoded host is the thing this file exists to delete.
 * They are declared, not verified against a live instance; treat a bug report
 * about them as a bug report, not a surprise.
 */
const SHAPES: Record<HostKind, {
  commit: (p: string) => string
  branch: (p: string) => string
  file: (ref: string, p: string) => string
  /** Line anchor for a 1-based inclusive range — the part everyone spells differently. */
  lines: (from: number, to: number) => string
  /** The repository's branch list page. */
  branches: () => string
  compare: (a: string, b: string) => string
  pullRequest: (n: number) => string
  issue: (n: number) => string
}> = {
  github: {
    commit: h => `/commit/${h}`,
    branch: b => `/tree/${b}`,
    file: (ref, p) => `/blob/${ref}/${p}`,
    lines: (from, to) => from === to ? `#L${from}` : `#L${from}-L${to}`,
    branches: () => '/branches',
    compare: (a, b) => `/compare/${a}...${b}`,
    pullRequest: n => `/pull/${n}`,
    issue: n => `/issues/${n}`,
  },
  gitlab: {
    commit: h => `/-/commit/${h}`,
    branch: b => `/-/tree/${b}`,
    file: (ref, p) => `/-/blob/${ref}/${p}`,
    lines: (from, to) => from === to ? `#L${from}` : `#L${from}-${to}`,
    branches: () => '/-/branches',
    compare: (a, b) => `/-/compare/${a}...${b}`,
    pullRequest: n => `/-/merge_requests/${n}`,
    issue: n => `/-/issues/${n}`,
  },
  bitbucket: {
    commit: h => `/commits/${h}`,
    branch: b => `/src/${b}`,
    file: (ref, p) => `/src/${ref}/${p}`,
    lines: (from, to) => from === to ? `#lines-${from}` : `#lines-${from}:${to}`,
    branches: () => '/branches',
    compare: (a, b) => `/branches/compare/${b}%0D${a}`,
    pullRequest: n => `/pull-requests/${n}`,
    issue: n => `/issues/${n}`,
  },
}

function kindOf(host: string): HostKind {
  const h = host.toLowerCase()
  if (h === 'gitlab.com' || h.startsWith('gitlab.')) return 'gitlab'
  if (h === 'bitbucket.org' || h.startsWith('bitbucket.')) return 'bitbucket'
  // Self-hosted GitHub Enterprise is far more common than a self-hosted
  // anything-else, and its shapes are GitHub's — so an unknown host is read as
  // GitHub rather than refused. A wrong-but-plausible link beats no link.
  return 'github'
}

/**
 * Read a remote URL. Handles the three forms git actually hands out:
 *
 *   git@github.com:owner/repo.git          scp-like, the default for SSH keys
 *   ssh://git@github.com/owner/repo.git    explicit scheme
 *   https://github.com/owner/repo.git      and http://, and with credentials
 *
 * Returns null for anything it cannot read — a local path remote, or a form we
 * have not seen — because a caller that cannot build a link needs to know that,
 * not receive a plausible wrong one.
 */
export function parseRemote(url: string | null | undefined): RemoteRepo | null {
  if (!url) return null
  const raw = url.trim()
  if (!raw) return null

  let host: string
  let path: string

  const scpLike = raw.match(/^(?:([^@/]+)@)?([^/:]+):(.+)$/)
  const withScheme = raw.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:]+)(?::\d+)?\/(.+)$/i)

  if (withScheme) {
    host = withScheme[1]
    path = withScheme[2]
  } else if (scpLike && !raw.includes('://')) {
    host = scpLike[2]
    path = scpLike[3]
  } else {
    return null
  }

  // Strip the .git suffix and any trailing slash, then split owner from repo.
  const clean = path.replace(/\.git\/?$/, '').replace(/\/+$/, '')
  const parts = clean.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const repo = parts[parts.length - 1]
  // GitLab groups nest arbitrarily deep, so the owner is everything before the
  // repository name rather than just the first segment.
  const owner = parts.slice(0, -1).join('/')
  if (!host || !owner || !repo) return null

  return { host, owner, repo, kind: kindOf(host), base: `https://${host}/${owner}/${repo}` }
}

/**
 * The remote to build links from: the repository's default if it names one,
 * `origin` otherwise, and failing that whatever comes first. Mirrors how the
 * rest of the app decides which remote it means.
 */
export function pickRemote(remotes: Remote[], preferred?: string | null): Remote | null {
  if (!remotes.length) return null
  const byName = (n: string) => remotes.find(r => r.name === n)
  return (preferred ? byName(preferred) : undefined) ?? byName('origin') ?? remotes[0]
}

/** Convenience: the parsed repository behind a remote list. */
export function repoFromRemotes(remotes: Remote[], preferred?: string | null): RemoteRepo | null {
  const remote = pickRemote(remotes, preferred)
  if (!remote) return null
  return parseRemote(remote.fetchUrl || remote.pushUrl)
}

/** github.com, plus any Enterprise host the user has told us about. */
export const GITHUB_COM = 'github.com'

/**
 * Where a GitHub host answers its API.
 *
 * github.com serves it from a separate domain; every Enterprise Server instance
 * serves it from the same host under `/api/v3`. That is the whole difference,
 * and it is the reason this phase is a variable rather than an integration.
 *
 * ⚠️ It is deliberately **not** guessed from an arbitrary host. Nothing in a
 * hostname distinguishes a self-hosted GitHub from a self-hosted GitLab, so a
 * host reaches this function only once the user has said it is GitHub — by
 * configuring a token for it. Guessing would send someone's credential to a
 * server that is not GitHub.
 */
export function githubApiBase(host: string): string {
  return host.toLowerCase() === GITHUB_COM ? 'https://api.github.com' : `https://${host}/api/v3`
}

/**
 * The repository a remote points at, on a host we know to be GitHub.
 *
 * `knownHosts` is what the user has configured beyond github.com — an
 * Enterprise Server instance. Empty by default, so the answer for anything else
 * stays "not GitHub".
 *
 * ⚠️ The host check is the whole reason this is not just `parseRemote`.
 * `parseRemote` deliberately reads an unknown host as GitHub so a self-hosted
 * Enterprise still gets a plausible *link*; here that would turn "this remote
 * is not on GitHub" into a 404 against the wrong API — or worse, into a token
 * sent to a stranger's server.
 *
 * It replaces a `github\.com[:/]([^/]+)\/([^/.]+)` regex that misread two
 * ordinary shapes: `[^/.]+` stops at a dot, so `my.app` came back as `my`, and
 * `ssh://git@github.com:22/o/r.git` came back with the **port** as the owner.
 * Both then asked GitHub about a repository that does not exist, and the panel
 * showed an empty list with nothing to say why.
 *
 * Both products read remotes through it: the extension host, and the four
 * places in `src/main/index.ts` that each had their own copy. That import is
 * the first thing the desktop main process takes from this tree — it is pure
 * string handling, and electron-vite inlines it into the main bundle.
 */
export function githubRepo(
  url: string | null | undefined, knownHosts: string[] = [],
): { owner: string | null; repo: string | null; host: string | null } {
  const parsed = parseRemote(url)
  if (!parsed) return { owner: null, repo: null, host: null }
  const host = parsed.host.toLowerCase()
  const known = host === GITHUB_COM || knownHosts.some(h => h.trim().toLowerCase() === host)
  if (!known) return { owner: null, repo: null, host: null }
  return { owner: parsed.owner, repo: parsed.repo, host }
}

/**
 * A ref as it goes into a URL. Slashes are real path separators in every shape
 * above — `feature/x` must stay `feature/x`, not become `feature%2Fx` — so each
 * segment is encoded on its own.
 */
function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/')
}

/** Strips `remotes/<name>/` so a remote-tracking branch links to the branch. */
export function shortBranch(name: string): string {
  return name.replace(/^remotes\/[^/]+\//, '')
}

export interface LineRange { from: number; to: number }

/**
 * A 1-based inclusive line range from an editor selection.
 *
 * Editors count lines from 0, and a selection's end is EXCLUSIVE when the caret
 * has wrapped to column 0 of the next line — which is what dragging down a
 * column, or a triple-click, produces. Taken literally that links to one line
 * more than is highlighted, every single time.
 *
 * Lives here rather than beside the command that needs it because the command
 * imports `vscode` and could not then be tested at all. This is the part with
 * an off-by-one in it.
 */
export function rangeFromSelection(
  startLine: number, endLine: number, endCharacter: number,
): LineRange {
  const last = endCharacter === 0 && endLine > startLine ? endLine - 1 : endLine
  return { from: startLine + 1, to: last + 1 }
}

export const remoteUrl = {
  repo: (r: RemoteRepo): string => r.base,

  commit: (r: RemoteRepo, hash: string): string =>
    r.base + SHAPES[r.kind].commit(encodeURIComponent(hash)),

  branch: (r: RemoteRepo, name: string): string =>
    r.base + SHAPES[r.kind].branch(encodeRef(shortBranch(name))),

  /** The branch list, for "show me everything that exists over there". */
  branches: (r: RemoteRepo): string => r.base + SHAPES[r.kind].branches(),

  /**
   * A file at a ref, optionally with a line range — the "share a link to these
   * lines" of the lot's title.
   *
   * `ref` should be a commit sha rather than a branch name whenever the caller
   * has one: a link to `main` points at whatever `main` says next week, which is
   * rarely what someone sharing a line meant.
   */
  file: (r: RemoteRepo, ref: string, filePath: string, range?: LineRange | null): string => {
    const p = filePath.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
    const url = r.base + SHAPES[r.kind].file(encodeRef(ref), p)
    if (!range) return url
    const from = Math.min(range.from, range.to)
    const to = Math.max(range.from, range.to)
    return url + SHAPES[r.kind].lines(from, to)
  },

  compare: (r: RemoteRepo, a: string, b: string): string =>
    r.base + SHAPES[r.kind].compare(encodeRef(shortBranch(a)), encodeRef(shortBranch(b))),

  pullRequest: (r: RemoteRepo, number: number): string =>
    r.base + SHAPES[r.kind].pullRequest(number),

  issue: (r: RemoteRepo, number: number): string =>
    r.base + SHAPES[r.kind].issue(number),
}
