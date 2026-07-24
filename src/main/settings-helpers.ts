// Pure, Electron-free helpers backing the v1.20.0 settings (General /
// External Tools / SSH). Kept out of index.ts on purpose: index.ts pulls in
// Electron's `app`/`dialog`/`ipcMain`, which don't run outside a live app,
// so nothing in it can be unit-tested with plain Jest. Everything here can.
import * as fs from 'fs'
import * as path from 'path'

// Auto-Fetch Interval: 0/unset/invalid = disabled, matching another tool's own
// "0 disables auto-fetch" convention.
export function parseAutoFetchMinutes(raw: string | undefined): number {
  const n = parseInt(raw ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Only force a specific key when NOT relying on the local SSH agent AND a
// private key path is actually configured.
export function shouldUseSshCommand(s: { sshUseAgent?: string; sshPrivateKey?: string }): boolean {
  return s.sshUseAgent !== 'true' && !!s.sshPrivateKey
}

export function buildSshCommand(privateKeyPath: string): string {
  return `ssh -i "${privateKeyPath}" -o IdentitiesOnly=yes`
}

// Splits a configured external-tool command string (e.g. "code --diff")
// into a spawnable cmd + args, appending the given file paths. Shared by the
// diff tool, merge tool, and custom-terminal invocation.
export function buildToolInvocation(toolCommand: string, ...paths: string[]): { cmd: string; args: string[] } | null {
  const parts = toolCommand.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return null
  return { cmd: parts[0], args: [...parts.slice(1), ...paths] }
}

export function resolveTerminalLaunch(opts: { customTerminal: string; platform: NodeJS.Platform; cwd: string }): { cmd: string; args: string[] } {
  const { customTerminal, platform, cwd } = opts
  if (customTerminal && platform === 'darwin') return { cmd: 'open', args: ['-a', customTerminal, cwd] }
  if (customTerminal) {
    const inv = buildToolInvocation(customTerminal, cwd)
    if (inv) return inv
  }
  if (platform === 'darwin') return { cmd: 'open', args: ['-a', 'Terminal', cwd] }
  if (platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', 'cmd', '/k', `cd /d ${cwd}`] }
  return { cmd: 'x-terminal-emulator', args: [`--working-directory=${cwd}`] }
}

// Finds a free `<base>[_<n>]` key path under sshDir so key generation never
// silently overwrites an existing pair.
export function findAvailableKeyPath(sshDir: string, base = 'id_ed25519_gitvertex'): string {
  let candidate = path.join(sshDir, base)
  let n = 1
  while (fs.existsSync(candidate) || fs.existsSync(candidate + '.pub')) {
    n++
    candidate = path.join(sshDir, `${base}_${n}`)
  }
  return candidate
}

export function safeTempFileName(filepath: string): string {
  return filepath.split('/').pop() || 'file'
}

// Minimal shape needed from GitService — structural typing so tests can pass
// a real GitService (against a temp repo) or a lightweight fake.
export interface SubmoduleCapable {
  getSubmodules(): Promise<{ submodules: { path: string }[] }>
  updateSubmodule(path: string): Promise<{ success: boolean; error?: string }>
}

export async function updateSubmodulesIfEnabled(
  git: SubmoduleCapable,
  autoUpdateSubmodulesSetting: string | undefined
): Promise<void> {
  if (autoUpdateSubmodulesSetting !== 'true') return
  const { submodules } = await git.getSubmodules()
  for (const sm of submodules) await git.updateSubmodule(sm.path)
}
