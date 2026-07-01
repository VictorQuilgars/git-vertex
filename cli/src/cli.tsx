import React from 'react'
import { render } from 'ink'
import { execFileSync } from 'child_process'
import { resolveRepoRoot, repoName } from './core/repo.js'
import { GitService } from './core/gitService.js'
import App from './App.js'

const startDir = process.argv[2] || process.cwd()
const root = resolveRepoRoot(startDir)
if (!root) {
  console.error(`Git Vertex : aucun dépôt Git trouvé dans ${startDir}`)
  process.exit(1)
}

let branch = 'HEAD'
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() || 'HEAD'
} catch { /* detached / empty repo */ }

const git = new GitService(root)

// Use the alternate screen buffer so the TUI restores the terminal on exit.
const enterAlt = '\x1b[?1049h'
const leaveAlt = '\x1b[?1049l'
process.stdout.write(enterAlt)
const restore = () => { process.stdout.write(leaveAlt) }

const app = render(<App git={git} repo={repoName(root)} branch={branch} />)
try {
  await app.waitUntilExit()
} finally {
  restore()
}
process.exit(0)
