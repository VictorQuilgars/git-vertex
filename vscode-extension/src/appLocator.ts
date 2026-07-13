import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const CANDIDATE_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Git Vertex.app/Contents/MacOS/Git Vertex',
    path.join(process.env.HOME ?? '', 'Applications/Git Vertex.app/Contents/MacOS/Git Vertex'),
  ],
  win32: [
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'git-vertex', 'Git Vertex.exe'),
    path.join(process.env.PROGRAMFILES ?? '', 'Git Vertex', 'Git Vertex.exe'),
  ],
  linux: [
    '/usr/bin/git-vertex',
    '/usr/local/bin/git-vertex',
    path.join(process.env.HOME ?? '', '.local/bin/git-vertex'),
  ],
}

export function findAppPath(): string | null {
  const platform = process.platform as string

  // Try well-known install locations
  const candidates = CANDIDATE_PATHS[platform] ?? []
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  // Last resort: PATH lookup (Linux AppImage installed as git-vertex)
  if (platform !== 'win32') {
    try {
      const found = execSync('which git-vertex 2>/dev/null', { encoding: 'utf8' }).trim()
      if (found) return found
    } catch { /* not found */ }
  }

  return null
}

export function launchApp(appPath: string, repoPath: string): void {
  const platform = process.platform
  const { spawn } = require('child_process')

  if (platform === 'darwin') {
    // Use `open -a` so macOS activates an already-running instance
    const appBundle = appPath.replace(/\/Contents\/MacOS\/.+$/, '')
    spawn('open', ['-a', appBundle, '--args', repoPath], { detached: true, stdio: 'ignore' }).unref()
  } else if (platform === 'win32') {
    spawn(appPath, [repoPath], { detached: true, stdio: 'ignore', shell: false }).unref()
  } else {
    spawn(appPath, [repoPath], { detached: true, stdio: 'ignore' }).unref()
  }
}
