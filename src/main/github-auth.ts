import { shell } from 'electron'

const CLIENT_ID  = import.meta.env.VITE_GITHUB_CLIENT_ID as string
const PROXY_URL  = import.meta.env.VITE_GITHUB_PROXY_URL as string

const REDIRECT_URI = 'gitgui://callback'
const SCOPE        = 'repo user'


let pendingState: string | null = null

export function startOAuthFlow(): void {
  pendingState = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const params = new URLSearchParams({
    client_id:    CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope:        SCOPE,
    state:        pendingState,
  })
  shell.openExternal(`https://github.com/login/oauth/authorize?${params}`)
}

export async function handleOAuthCallback(
  callbackUrl: string
): Promise<{ token: string } | { error: string }> {
  let url: URL
  try { url = new URL(callbackUrl) } catch { return { error: 'URL de callback invalide' } }

  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code)                  return { error: 'Aucun code dans le callback GitHub' }
  if (state !== pendingState) return { error: 'State invalide — possible attaque CSRF' }
  pendingState = null

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })

  const data = await res.json() as Record<string, string>
  if (data.access_token) return { token: data.access_token }
  return { error: data.error_description ?? data.error ?? 'Échec de récupération du token' }
}
