/**
 * Why a pull request or issue list has nothing to show (#292).
 *
 * The two views rendered only when there was a list, so every reason for not
 * having one looked the same: a blank view. There are three, and each one is
 * fixed somewhere different — so each one is said, with the way to fix it:
 *
 * - `no-remote`: nothing here is on GitHub. Add a remote, or name the
 *   Enterprise server the remote is on (Settings › GitHub).
 * - `no-token`: there is a GitHub remote and no account to ask it with.
 * - `error`: it was asked and refused — anything else, said as it came.
 *
 * The host says which, per list, as a code beside the list: `githubErrors`.
 * It only ever writes one on an answer the user asked for; a background poll
 * that fails leaves the list on screen and writes nothing.
 */

/** The code a host records when the repository has no remote on a GitHub it knows. */
export const NO_FORGE_REMOTE = 'no_remote'
/** What both hosts' GitHub calls answer without a usable token (a 401 included). */
export const NOT_AUTHENTICATED = 'not_authenticated'

export type ForgeGap =
  | { kind: 'no-remote' }
  | { kind: 'no-token' }
  | { kind: 'error'; message: string }

/** Null while there is a list to show, or no answer yet. */
export function forgeGap(list: readonly unknown[] | undefined, error: string | undefined): ForgeGap | null {
  if (list || !error) return null
  if (error === NO_FORGE_REMOTE) return { kind: 'no-remote' }
  if (error === NOT_AUTHENTICATED) return { kind: 'no-token' }
  return { kind: 'error', message: error }
}

/** The error a GitHub list call ended on, whether it answered one or threw. */
export function listError(r: unknown): string | undefined {
  const e = (r as { error?: unknown } | null | undefined)?.error
  return e ? String(e) : undefined
}
