// github-host.ts — which GitHub we are talking to, and with which credential.
//
// Everything that calls GitHub used to write `https://api.github.com` out by
// hand — twenty-one times in index.ts alone — and read one global token. That
// works for exactly one host, and it is why a GitHub Enterprise Server instance
// was unreachable: it is the same API, served from the customer's own domain
// under `/api/v3`.
//
// So this is the only place that answers two questions:
//
//   which base URL does this repository's GitHub answer on
//   which token may be sent there
//
// ⚠️ The second one is a safety property, not a convenience. A token is a
// credential for one host; sending the github.com one to `github.acme.com`
// hands it to whoever runs that server. A host therefore gets a token only if
// the user configured one *for that host*, and a host is only considered GitHub
// at all once they have said so — nothing in a hostname distinguishes a
// self-hosted GitHub from a self-hosted anything else.

import { githubApiBase, githubRepo, GITHUB_COM } from '../renderer/src/utils/remoteUrl'

export interface GithubApi {
  /** `https://api.github.com`, or `https://<host>/api/v3`. */
  base: string
  /** The host as it appears in the remote — `github.com`, `github.acme.com`. */
  host: string
  /** Absent when nothing is configured for this host. */
  token?: string
}

type Settings = Record<string, string>

/**
 * The Enterprise hosts the user has declared. One entry today, because a
 * company has one instance; it is a list so a second one costs a setting rather
 * than a migration.
 */
export function knownGithubHosts(s: Settings): string[] {
  const host = (s.githubEnterpriseHost ?? '').trim().toLowerCase()
  return host ? [host] : []
}

/** The token configured for a host, or none. Never another host's. */
export function tokenForHost(s: Settings, host: string): string | undefined {
  const h = host.toLowerCase()
  if (h === GITHUB_COM) return s.githubToken || undefined
  const declared = (s.githubEnterpriseHost ?? '').trim().toLowerCase()
  return declared && declared === h ? (s.githubEnterpriseToken || undefined) : undefined
}

/** The API for a host we already know. */
export function apiForHost(s: Settings, host: string): GithubApi {
  return { base: githubApiBase(host), host, token: tokenForHost(s, host) }
}

/**
 * The API for a remote URL — null when that remote is not on a GitHub we know.
 *
 * This is what every repository-scoped call goes through, so a repository on an
 * unconfigured host fails as "not GitHub" rather than as a 404 from the wrong
 * server.
 */
export function apiForRemote(s: Settings, remoteUrl: string | null | undefined):
  (GithubApi & { owner: string; repo: string }) | null {
  const { owner, repo, host } = githubRepo(remoteUrl, knownGithubHosts(s))
  if (!owner || !repo || !host) return null
  return { ...apiForHost(s, host), owner, repo }
}

/**
 * The API for calls that are about the *user* rather than a repository — the
 * repository list, the avatar lookup, a gist.
 *
 * They belong to whichever instance is being worked against, so the open
 * repository decides, and github.com is the answer when there is none. Handing
 * `/user` to github.com while the repository lives on an instance would return
 * the wrong person.
 */
export function apiForUser(s: Settings, currentRemoteUrl?: string | null): GithubApi {
  const fromRepo = currentRemoteUrl ? apiForRemote(s, currentRemoteUrl) : null
  return fromRepo ? { base: fromRepo.base, host: fromRepo.host, token: fromRepo.token }
    : apiForHost(s, GITHUB_COM)
}

/** The headers every call sends. Unauthenticated is legal — public repos answer. */
export function githubHeaders(api: GithubApi): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (api.token) headers.Authorization = `Bearer ${api.token}`
  return headers
}
