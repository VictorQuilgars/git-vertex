import React from 'react'
import { render } from 'ink-testing-library'
import App from './App.js'
import { GitService } from './core/gitService.js'
import { resolveRepoRoot, repoName } from './core/repo.js'

const root = resolveRepoRoot(process.cwd())
if (!root) { console.error('no repo'); process.exit(1) }
const git = new GitService(root)
const { lastFrame, unmount } = render(<App git={git} repo={repoName(root)} branch="main" />)
await new Promise(r => setTimeout(r, 1700))
console.log(lastFrame())
unmount()
process.exit(0)
