import React from 'react'
import { render } from 'ink-testing-library'
import App from './App.js'
import { GitService } from './core/gitService.js'
import { resolveRepoRoot, repoName } from './core/repo.js'

const root = resolveRepoRoot(process.cwd())
if (!root) { console.error('no repo'); process.exit(1) }
const git = new GitService(root)
const { lastFrame, stdin, unmount } = render(<App git={git} repo={repoName(root)} branch="main" />)
await new Promise(r => setTimeout(r, 1500))
console.log('=== FILES TAB ===')
console.log(lastFrame())
stdin.write('\t')  // → Branches
await new Promise(r => setTimeout(r, 400))
stdin.write('\t')  // → Commits
await new Promise(r => setTimeout(r, 1200))
console.log('=== COMMITS TAB (graph) ===')
console.log(lastFrame())
stdin.write('\t')  // → Files
await new Promise(r => setTimeout(r, 300))
unmount()
process.exit(0)
