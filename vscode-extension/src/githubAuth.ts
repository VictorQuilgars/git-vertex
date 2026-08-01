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
 * The narrowest set that covers what we actually call.
 *
 * `repo` earns its place: every call we make is repository-scoped, and on a
 * private repository none of them answer without it — listing pull requests and
 * issues, resolving one by number, listing branches, and opening a request. Its
 * public-only sibling `public_repo` would break the case people care about most.
 *
 * `read:user` was dropped: `GET /user` answers with the public profile for any
 * token, and login plus avatar is all the settings page shows. Asking for less
 * is not only hygiene — VS Code matches sessions BY SCOPE SET, so a shorter list
 * is likelier to match a session another extension already obtained, which is
 * the difference between confirming an account and signing in again.
 */
export const GITHUB_SCOPES = ['repo']

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
 * `clearSessionPreference` is what lets the user pick WHICH account. VS Code
 * remembers the one an extension last used and reuses it silently forever
 * after; someone with a personal and a work GitHub account got whichever we
 * happened to land on first, with no way back. Clearing it makes VS Code ask
 * again — and asking is right here, because this only ever runs on a click.
 *
 * The trade is one quick-pick on a button that says "Sign in with GitHub",
 * where a picker is what you would expect anyway. GitHub's provider supports
 * several accounts at once, so the prompt may appear even with one signed in —
 * that is the price of being able to choose at all, and it is only paid on a
 * deliberate click. The silent path above never clears anything.
 *
 * Returns undefined when the user cancels, and throws only when the host has
 * no GitHub provider to ask, which the caller reports as such.
 */
export async function signIn(): Promise<vscode.AuthenticationSession | undefined> {
  return vscode.authentication.getSession(PROVIDER, GITHUB_SCOPES, {
    createIfNone: true,
    clearSessionPreference: true,
  })
}

/**
 * The identity to use for a GitHub call: the VS Code session if there is one,
 * the stored PAT otherwise.
 *
 * `readPat` is passed in rather than read here so this module stays free of the
 * memento, and so the host keeps one place that knows where settings live.
 *
 * `useVsCodeSession` is false once the user has disconnected in our settings.
 * No extension can revoke a VS Code session — that account belongs to VS Code,
 * and the Accounts menu is where it is signed out. What "Disconnect" can mean,
 * and now does, is that Git Vertex stops using it. Without this the button was
 * honest and useless: it forgot a token that was not there, found the session
 * still live, and put the user straight back on screen as connected.
 */
export async function resolveIdentity(
  readPat: () => string | undefined,
  useVsCodeSession = true,
): Promise<GitHubIdentity | undefined> {
  if (useVsCodeSession) {
    const session = await existingSession()
    if (session) return { token: session.accessToken, source: 'vscode', login: session.account.label }
  }
  const pat = readPat()
  return pat ? { token: pat, source: 'pat' } : undefined
}
