import * as fs from 'fs'
import * as path from 'path'

// Host-side helpers for the Settings features that aren't git operations
// (external diff/merge tools, SSH keys). Ported from the desktop's
// src/main/settings-helpers.ts, which stays the reference implementation:
// the two products run in different shells (Electron main vs extension host)
// and cannot share a module, but they must behave the same.
// No `vscode` import, so this is unit-testable in plain node.

/**
 * Splits a configured external-tool command ("code --diff") into a spawnable
 * cmd + args, appending the given file paths.
 */
export function buildToolInvocation(toolCommand: string, ...paths: string[]): { cmd: string; args: string[] } | null {
  const parts = toolCommand.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return null
  return { cmd: parts[0], args: [...parts.slice(1), ...paths] }
}

/**
 * A free `<base>[_<n>]` key path under sshDir, so generating a key never
 * silently overwrites an existing pair.
 */
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
