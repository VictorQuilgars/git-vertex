import { THEME } from './ui/theme'
import React from 'react'
import { render } from 'ink'
import { execFileSync } from 'child_process'
import { resolveRepoRoot, repoName } from './core/repo.js'
import { GitService } from './core/gitService.js'
import App from './App.js'

const startDir = process.argv[2] || process.cwd()
const root = resolveRepoRoot(startDir)
if (!root) {
  console.error(`Git Vertex: no Git repository found in ${startDir}`)
  process.exit(1)
}

let branch = 'HEAD'
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() || 'HEAD'
} catch { /* detached / empty repo */ }

const git = new GitService(root)

// Alternate screen buffer (restores the terminal on exit) + paint the whole
// window with the Git Vertex desktop palette via OSC escapes: 10 = default
// foreground, 11 = default background. iTerm2/xterm-family honor these; other
// terminals ignore them harmlessly. 110/111 reset to the user's theme.
const enterAlt = '\x1b[?1049h'
const leaveAlt = '\x1b[?1049l'
// OSC 10/11: the terminal's foreground and background, so the app's canvas
// is the app's rather than whatever the profile happens to be set to.
const setColors = `\x1b]10;${THEME.text}\x07\x1b]11;${THEME.bg}\x07`
const resetColors = '\x1b]110\x07\x1b]111\x07'
process.stdout.write(enterAlt + setColors)

let restored = false
const restore = () => { if (restored) return; restored = true; process.stdout.write(resetColors + leaveAlt) }
process.on('exit', restore)
process.on('SIGINT', () => { restore(); process.exit(0) })
process.on('SIGTERM', () => { restore(); process.exit(0) })

const app = render(<App git={git} repo={repoName(root)} branch={branch} />)
try {
  await app.waitUntilExit()
} finally {
  restore()
}
process.exit(0)
