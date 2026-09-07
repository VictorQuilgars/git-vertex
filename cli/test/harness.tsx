// A repository made for one test, the TUI rendered against it, and the two
// things a test needs to say something: what is on the screen, and a key.
//
// The gate under cli/ was a type check and a rendering script — a smoke test,
// which is what the September 2026 audit called it. It says the screens draw;
// it does not say what they show or what a key does. This is what lets a test
// say both (#194).
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import React from 'react'
import { render } from 'ink-testing-library'
import App from '../src/App.js'
import { GitService } from '../src/core/gitService.js'

/** What ink writes for a key, since a test cannot press one. */
export const KEY = {
  up: '\u001B[A',
  down: '\u001B[B',
  enter: '\r',
  escape: '\u001B',
  tab: '\t',
  space: ' ',
}

/**
 * Fixed dates and a fixed author, so a commit's hash is the same on every run
 * and a test may name one. LC_ALL=C for the same reason the app pins it: no
 * code here may depend on a translated git message.
 */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      LC_ALL: 'C',
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_AUTHOR_DATE: '2026-01-01T12:00:00Z',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_COMMITTER_DATE: '2026-01-01T12:00:00Z',
    },
  }).toString()
}

/**
 * Three commits on `main`, a second branch, a tag, and a working tree with one
 * modified file and one untracked — enough for every pane to have something in
 * it, and small enough to assert on exactly.
 */
export function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-cli-test-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'commit.gpgsign', 'false')
  for (const n of ['first', 'second', 'third']) {
    fs.appendFileSync(path.join(dir, 'notes.txt'), `${n} line\n`)
    git(dir, 'add', 'notes.txt')
    git(dir, 'commit', '-q', '-m', `${n} commit`)
  }
  git(dir, 'branch', 'feature')
  git(dir, 'tag', 'v0.1.0')
  fs.appendFileSync(path.join(dir, 'notes.txt'), 'uncommitted line\n')
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'new\n')
  return dir
}

const ANSI = /\u001B\[[0-9;]*m/g

export interface Screen {
  /** What is on screen now, without the colours. */
  frame(): string
  /** Send keys, then let the app react. */
  press(...keys: string[]): Promise<void>
  /** Wait until the screen says something, or fail saying what was expected. */
  until(what: string, predicate: (frame: string) => boolean, timeoutMs?: number): Promise<void>
  /** The commits, newest first, as git itself reports them. */
  hashes(): string[]
  repo: string
  stop(): void
}

/**
 * The app, rendered at a real terminal size. 80 columns is what a bare test
 * process reports, and at 80 the centre column is 26 wide — every commit
 * message truncated to eleven characters and an ellipsis, which is a screen
 * nothing can be asserted about. 160×48 is an ordinary window, and the one the
 * layout's own breakpoints are written for.
 */
export function open(dir = makeRepo(), { cols = 160, rows = 48 } = {}): Screen {
  const before = { cols: process.stdout.columns, rows: process.stdout.rows }
  Object.defineProperty(process.stdout, 'columns', { value: cols, configurable: true })
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true })
  const service = new GitService(dir)
  const app = render(<App git={service} repo={path.basename(dir)} branch="main" />)
  const frame = () => (app.lastFrame() ?? '').replace(ANSI, '')
  return {
    frame,
    repo: dir,
    hashes: () => git(dir, 'log', '--format=%h').trim().split('\n'),
    async press(...keys: string[]) {
      for (const k of keys) {
        app.stdin.write(k)
        await new Promise(r => setTimeout(r, 60))
      }
      await new Promise(r => setTimeout(r, 120))
    },
    async until(what: string, predicate: (f: string) => boolean, timeoutMs = 15000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (predicate(frame())) return
        await new Promise(r => setTimeout(r, 50))
      }
      throw new Error(`timed out waiting for ${what}\n--- last frame ---\n${frame()}`)
    },
    stop() {
      app.unmount()
      Object.defineProperty(process.stdout, 'columns', { value: before.cols, configurable: true })
      Object.defineProperty(process.stdout, 'rows', { value: before.rows, configurable: true })
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** The screen once the first load has landed — every pane filled. */
export async function opened(dir?: string): Promise<Screen> {
  const s = open(dir)
  await s.until('the repository to be read', f => f.includes('third commit') && f.includes('notes.txt'))
  return s
}
