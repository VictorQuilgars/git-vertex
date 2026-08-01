// githubAuth.ts — how the extension gets a GitHub token.
//
// The desktop app signs in through an OAuth proxy and a `gitgui://` deep link.
// Neither exists in VS Code, so until now the panel's only way in was a
// Personal Access Token pasted by hand — which gated everything we had already
// shipped (creating a pull request, the PR and issue lists, the `#123` hover
// cards on private repositories) behind "go to github.com and mint a token".
//
// VS Code ships its own GitHub authentication provider, and by the time someone
// opens our panel they have usually already used it — Settings Sync, Copilot,
// the GitHub Pull Requests extension all authenticate through the same one. So
// the nominal case here is not a login at all: it is picking up a session that
// already exists, without prompting anyone.
//
// Order of preference:
//   1. an existing VS Code session      silent, no consent dialog
//   2. a stored PAT                     the fallback, see below
//   3. nothing                          callers degrade to unauthenticated
//
// The PAT stays because the provider is not guaranteed to be there. Forks that
// do not bundle `vscode.github-authentication` (VSCodium and other OSS builds)
// have no provider at all, and some remote setups do not either — `getSession`
// simply throws there. It also stays for anyone who would rather hand us a
// narrowly scoped token than a full session.

import * as vscode from 'vscode'

/**
 * What our GitHub calls need:
 *   repo       private repositories, and creating a pull request
 *   read:user  the login and avatar shown in the settings page
 */
export const GITHUB_SCOPES = ['repo', 'read:user']

const PROVIDER = 'github'

export interface GitHubIdentity {
  token: string
  /** Where it came from — the settings page shows a different control for each. */
  source: 'vscode' | 'pat'
  /** The signed-in login, when the session knows it. PATs do not. */
  login?: string
}

// Logged once per activation. A host with no GitHub provider (VSCodium and
// other OSS builds) throws here on every single call, and a line per call would
// be noise — but swallowing it outright is how the empty Agents view survived
// two releases, so the first one is always reported.
let lookupFailureReported = false

/**
 * A session VS Code already has, or undefined. Never prompts: `createIfNone`
 * stays false, so this is safe to call on activation and on every request.
 *
 * Throws nothing — a host without the GitHub provider is a normal situation
 * here, not an error, and the caller falls back to the PAT. It is reported once
 * all the same: from the outside "not signed in" looks identical whether the
 * provider is missing, the grant was revoked, or something else broke, and
 * without a line in the Extension Host log there is no way to tell which.
 */
export async function existingSession(): Promise<vscode.AuthenticationSession | undefined> {
  try {
    return await vscode.authentication.getSession(PROVIDER, GITHUB_SCOPES, { createIfNone: false })
  } catch (e) {
    if (!lookupFailureReported) {
      lookupFailureReported = true
      console.warn('[GitVertex] no GitHub session from VS Code; falling back to a token:', e)
    }
    return undefined
  }
}

/**
 * Sign in, prompting if needed. MUST be called from a user gesture — VS Code
 * shows a modal consent dialog, and showing one unprompted on activation is
 * how an extension gets uninstalled.
 *
 * Returns undefined when the user cancels, and throws only when the host has
 * no GitHub provider to ask, which the caller reports as such.
 */
export async function signIn(): Promise<vscode.AuthenticationSession | undefined> {
  return vscode.authentication.getSession(PROVIDER, GITHUB_SCOPES, { createIfNone: true })
}

/**
 * The identity to use for a GitHub call: the VS Code session if there is one,
 * the stored PAT otherwise.
 *
 * `readPat` is passed in rather than read here so this module stays free of the
 * memento, and so the host keeps one place that knows where settings live.
 */
export async function resolveIdentity(
  readPat: () => string | undefined,
): Promise<GitHubIdentity | undefined> {
  const session = await existingSession()
  if (session) return { token: session.accessToken, source: 'vscode', login: session.account.label }
  const pat = readPat()
  return pat ? { token: pat, source: 'pat' } : undefined
}
