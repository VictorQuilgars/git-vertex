// Two scratch repositories, made for each run: enough history for a graph, a
// branch to delete, a dirty file to stage, and a second repository to switch to.
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Fixed dates, so the hashes are the same on every run — the SHA column of a
// screenshot is then the same too, and only a real change moves the pixels.
let tick = 0
function git(cwd, ...args) {
  const date = new Date(Date.UTC(2026, 0, 1, 12, 0, tick++)).toISOString()
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, LC_ALL: 'C',
    GIT_AUTHOR_NAME: 'E2E', GIT_AUTHOR_EMAIL: 'e2e@example.com', GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'E2E', GIT_COMMITTER_EMAIL: 'e2e@example.com', GIT_COMMITTER_DATE: date,
  } }).toString()
}

function makeRepo(root, name, { commits, branch, dirty }) {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'e2e@example.com')
  git(dir, 'config', 'user.name', 'E2E')
  for (let i = 1; i <= commits; i++) {
    fs.appendFileSync(path.join(dir, 'notes.txt'), `line ${i}\n`)
    git(dir, 'add', 'notes.txt')
    git(dir, 'commit', '-q', '-m', `commit ${i} of ${name}`)
  }
  if (branch) git(dir, 'branch', branch)
  if (dirty) fs.appendFileSync(path.join(dir, 'notes.txt'), 'uncommitted\n')
  return dir
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-e2e-repos-'))
  return {
    root,
    repo1: makeRepo(root, 'alpha', { commits: 3, branch: 'feature', dirty: true }),
    repo2: makeRepo(root, 'beta', { commits: 1, branch: 'topic', dirty: false }),
    git,
  }
}

module.exports = { makeFixture }
