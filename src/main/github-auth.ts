import { app, shell } from 'electron'
import { resolve } from 'path'
import { readCallback, exchangeCode, type OAuthResult } from './github-oauth'

const CLIENT_ID  = import.meta.env.VITE_GITHUB_CLIENT_ID as string
const PROXY_URL  = import.meta.env.VITE_GITHUB_PROXY_URL as string

export const PROTOCOL = 'gitgui'
const REDIRECT_URI = `${PROTOCOL}://callback`
// `gist` is required to create the secret gists behind "Share Patch as Link".
// Existing tokens minted before this scope was added must reconnect.
const SCOPE        = 'repo user gist'

// From `npm run dev` the executable is electron.exe, which needs the app's
// path to know what to run — registered bare, Windows would start an empty
// Electron for every gitgui:// link. Packaged, the executable is the app.
function protocolArgs(): [protocol: string, path?: string, args?: string[]] {
  return process.defaultApp && process.argv.length >= 2
    ? [PROTOCOL, process.execPath, [resolve(process.argv[1])]]
    : [PROTOCOL]
}

export function registerProtocol(): boolean {
  const ok = app.setAsDefaultProtocolClient(...protocolArgs())
  if (!ok) console.error(`[github-auth] could not register ${PROTOCOL}:// with the system`)
  return ok
}

let pendingState: string | null = null

/**
 * Opens GitHub's consent page. Answers `undefined` when the result is to come
 * later on `github:auth-complete`, or `{ error }` when it never could.
 */
export async function startOAuthFlow(): Promise<{ success: false; error: string } | undefined> {
  if (!CLIENT_ID || !PROXY_URL) {
    return { success: false, error: 'This build carries no GitHub sign-in configuration. Paste a Personal Access Token instead.' }
  }
  // Windows is where the hand-back is only as good as the registry: a link the
  // system sends to another copy of the app (an older install, a dev build)
  // never reaches this one. Checked before the browser opens rather than after
  // the user has been through GitHub's page for nothing.
  if (process.platform === 'win32'
      && !app.isDefaultProtocolClient(...protocolArgs())
      && !registerProtocol()) {
    return {
      success: false,
      error: 'Windows does not send gitgui:// links to this copy of Git Vertex, so GitHub could not hand the sign-in back. Reinstall Git Vertex, or paste a Personal Access Token instead.',
    }
  }
  pendingState = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const params = new URLSearchParams({
    client_id:    CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope:        SCOPE,
    state:        pendingState,
  })
  try {
    await shell.openExternal(`https://github.com/login/oauth/authorize?${params}`)
  } catch (e: any) {
    pendingState = null
    return { success: false, error: `Could not open the browser: ${e?.message ?? e}` }
  }
  return undefined
}

export async function handleOAuthCallback(callbackUrl: string): Promise<OAuthResult> {
  const read = readCallback(callbackUrl, pendingState)
  if ('error' in read) return read
  pendingState = null
  return exchangeCode(PROXY_URL, read.code)
}
