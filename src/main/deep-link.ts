// gitgui:// links: parsed, held until the window can take them, dispatched.
import { handle } from './ipc/handle'
import { app, ipcMain } from 'electron'
import { join } from 'path'
import { handleOAuthCallback } from './github-auth'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { readFileSync } from 'fs'
import { state } from './app-state'
import { readSettings, writeSettings } from './settings-store'

// ── Deep links ────────────────────────────────────────────────
// gitgui://open?repo=<abs path>&view=graph|resolve|commit|propose-commit|propose-rebase
//               &file=<rel>&hash=<sha>&proposal=<temp file>
// Opens the repo, and optionally the 3-way conflict resolver on `file` or
// the commit details of `hash`. If the app is cold-starting from the URL,
// the payload is parked until the renderer asks for it.
//
// `proposal`, from git-vertex-mcp's open_in_git_vertex: a throwaway file
// (always under the OS tmp dir's git-vertex-mcp-proposals/ folder — never
// an arbitrary path) holding a proposed conflict resolution. Read here
// (never handed to the renderer as a raw path) and inlined as
// `proposalContent`, then deleted — it's single-use and the MCP process
// may not even outlive this call.
export interface DeepLink { repo: string; view: string; file?: string; hash?: string; proposalContent?: string }

export let pendingDeepLink: DeepLink | null = null

export function readAndConsumeProposal(proposalPath: string | null): string | undefined {
  if (!proposalPath) return undefined
  try {
    const dir = fs.realpathSync(path.join(os.tmpdir(), 'git-vertex-mcp-proposals'))
    const abs = fs.realpathSync(proposalPath)
    if (!abs.startsWith(dir + path.sep)) {
      // Not ours to read. Most likely the MCP server resolved a different tmp
      // dir than we do (different TMPDIR between the agent's process and the
      // app), which silently strips the payload — so say which paths disagreed.
      console.error(`[deeplink] proposal outside the expected directory, ignored: ${abs} (expected under ${dir})`)
      return undefined
    }
    const content = fs.readFileSync(abs, 'utf-8')
    fs.unlink(abs, () => {}) // best-effort cleanup, single-use file
    return content
  } catch (e) {
    // Single-use file: already consumed by an earlier launch, or the MCP
    // process cleaned up before we got here. The renderer reports the missing
    // payload to the user; this line says why it went missing.
    console.error(`[deeplink] could not read proposal ${proposalPath}:`, e)
    return undefined
  }
}

export function parseDeepLink(url: string): DeepLink | null {
  try {
    const u = new URL(url)
    // new URL('gitgui://open?...') puts "open" in host (or pathname on some platforms)
    const action = u.host || u.pathname.replace(/^\/+/, '')
    if (action !== 'open') return null
    const repo = u.searchParams.get('repo')
    if (!repo) return null
    return {
      repo,
      view: u.searchParams.get('view') ?? 'graph',
      file: u.searchParams.get('file') ?? undefined,
      hash: u.searchParams.get('hash') ?? undefined,
      proposalContent: readAndConsumeProposal(u.searchParams.get('proposal')),
    }
  } catch { return null }
}

export function dispatchDeepLink(link: DeepLink): void {
  if (state.mainWindow && !state.mainWindow.webContents.isLoading()) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.show()
    state.mainWindow.focus()
    state.mainWindow.webContents.send('deeplink:open', link)
  } else {
    // Cold start: the renderer pulls it via app:get-pending-deeplink once mounted.
    pendingDeepLink = link
  }
}

export async function handleProtocolUrl(url: string): Promise<void> {
  if (url.startsWith('gitgui://callback')) {
    const result = await handleOAuthCallback(url)
    if ('token' in result) {
      const s = readSettings(); s.githubToken = result.token; writeSettings(s)
      state.mainWindow?.webContents.send('github:auth-complete', { token: result.token })
    } else {
      state.mainWindow?.webContents.send('github:auth-complete', { error: result.error })
    }
    return
  }
  const link = parseDeepLink(url)
  if (link) dispatchDeepLink(link)
}

// Windows/Linux cold start: the URL arrives in the process argv.
{
  const coldUrl = process.argv.find(a => a.startsWith('gitgui://'))
  if (coldUrl) {
    const link = parseDeepLink(coldUrl)
    if (link) pendingDeepLink = link
  }
}

export function registerDeepLinkHandlers(): void {
  handle('app:get-pending-deeplink', () => {
    const link = pendingDeepLink
    pendingDeepLink = null
    return link
  })
}
