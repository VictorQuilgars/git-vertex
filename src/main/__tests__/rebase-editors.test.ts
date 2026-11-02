import { GitService } from '../git-service'
import * as core from '../git-core'
import { execFileSync, execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// Every rewrite — reword, squash, fixup, drop, move — is `git rebase -i` with
// two scripts of ours standing in for the user's editors. Git does not exec
// those, it hands them to `sh -c`, and on Windows the path Node built arrived
// there with backslashes, which sh eats:
//
//   C:\Users\Victor\AppData\Local\Temp\gitgui-rebase-editor-1.sh
//   → C:UsersVictorAppDataLocalTempgitgui-rebase-editor-1.sh: not found
//
// No test could see it: the suite runs on a POSIX tmpdir with no backslash, no
// space and no quote in it. So these tests give the scripts a temp directory
// that is as hostile to an unquoted shell word as a Windows one is.

describe('the editor commands git is handed', () => {
  test('a Windows path keeps its separators — as forward slashes', () => {
    expect(core.shellPath('C:\\Users\\Victor\\AppData\\Local\\Temp\\gitgui-rebase-editor-1.sh'))
      .toBe("'C:/Users/Victor/AppData/Local/Temp/gitgui-rebase-editor-1.sh'")
  })

  test('a quote, a dollar, a tilde and a space stay literal', () => {
    expect(core.shellPath("/tmp/it's $HOME ~x")).toBe("'/tmp/it'\\''s $HOME ~x'")
  })

  test('a script runs through sh, not through its execute bit', () => {
    expect(core.editorCommand('C:\\T\\e.sh')).toBe("sh 'C:/T/e.sh'")
  })

  test("the no-editor is git's own ':', which spawns nothing", () => {
    expect(core.NO_EDITOR).toBe(':')
  })

  test('sh reads the command back as the path that was written', () => {
    // Exactly what git does with GIT_EDITOR: `sh -c '<value> "$@"' <value> <file>`.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gv it's $HOME "))
    try {
      const script = path.join(dir, 'editor.sh')
      const out = path.join(dir, 'out.txt')
      fs.writeFileSync(script, '#!/bin/sh\necho "edited $1" > "$1"\n')
      fs.writeFileSync(out, '')
      const cmd = core.editorCommand(script)
      execFileSync('sh', ['-c', `${cmd} "$@"`, cmd, out])
      expect(fs.readFileSync(out, 'utf8')).toBe(`edited ${out}\n`)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test('both services build their editors from the core, and neither writes its own script', () => {
    const root = path.resolve(__dirname, '..', '..', '..')
    for (const file of ['src/main/git-service.ts', 'vscode-extension/src/gitService.ts']) {
      const src = fs.readFileSync(path.join(root, file), 'utf8')
      expect([file, src.includes('#!/bin/sh')]).toEqual([file, false])
      expect([file, /GIT_(SEQUENCE_)?EDITOR: scriptFile/.test(src)]).toEqual([file, false])
      for (const fn of ['sequenceEditorScript', 'messageEditorScript', 'editorCommand']) {
        expect([file, fn, src.includes(`core.${fn}(`)]).toEqual([file, fn, true])
      }
    }
  })
})

describe('rewrites with a temp directory a bare shell word cannot hold', () => {
  let repo: string
  let tmp: string
  let git: GitService

  const sh = (cmd: string): string => execSync(cmd, { cwd: repo, encoding: 'utf8' }).trim()
  const subjects = (): string[] => sh('git log --format=%s main').split('\n')
  const commit = (file: string, body: string, msg: string): string => {
    fs.writeFileSync(path.join(repo, file), body)
    sh(`git add ${file} && git commit -q -m "${msg}"`)
    return sh('git rev-parse HEAD')
  }

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-rebase-')))
    // A space (Windows profile names), a quote and a dollar — each one breaks an
    // unquoted or double-quoted shell word the way a backslash does on Windows.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gv tmp it's $x-"))
    // os.tmpdir() reads the real process environment, not jest's copy of it.
    jest.spyOn(os, 'tmpdir').mockReturnValue(tmp)
    sh('git init -q -b main && git config user.email t@t && git config user.name T')
    git = new GitService(repo)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    fs.rmSync(repo, { recursive: true, force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  test('the temp directory really is the hostile one', async () => {
    // The service imports `os` lazily; it must be the module the spy is on.
    expect((await import('os')).tmpdir()).toBe(tmp)
  })

  test('reword of an older commit writes the new message and keeps the rest', async () => {
    commit('a.txt', 'a\n', 'base')
    const b = commit('b.txt', 'b\n', 'old message')
    const c = commit('c.txt', 'c\n', 'after')
    const r = await git.interactiveRebase(
      [{ action: 'reword', hash: b }, { action: 'pick', hash: c }],
      ['new message'],
    )
    expect(r).toEqual({ success: true })
    expect(subjects()).toEqual(['after', 'new message', 'base'])
    // And nothing was left behind in the temp directory.
    expect(fs.readdirSync(tmp)).toEqual([])
  })

  test('squash takes the message the user chose', async () => {
    commit('a.txt', 'a\n', 'base')
    const b = commit('b.txt', 'b\n', 'one')
    const c = commit('c.txt', 'c\n', 'two')
    const r = await git.interactiveRebase(
      [{ action: 'pick', hash: b }, { action: 'squash', hash: c }],
      ['one and two'],
    )
    expect(r).toEqual({ success: true })
    expect(subjects()).toEqual(['one and two', 'base'])
  })

  test('drop goes through the sequence editor too', async () => {
    commit('a.txt', 'a\n', 'base')
    const b = commit('b.txt', 'b\n', 'unwanted')
    commit('c.txt', 'c\n', 'kept')
    const r = await git.dropCommit(b)
    expect(r.success).toBe(true)
    expect(subjects()).toEqual(['kept', 'base'])
  })
})

describe('continue never skips a commit that still has changes', () => {
  let repo: string
  let git: GitService
  const sh = (cmd: string): string => execSync(cmd, { cwd: repo, encoding: 'utf8' }).trim()

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-continue-')))
    sh('git init -q -b main && git config user.email t@t && git config user.name T')
    fs.writeFileSync(path.join(repo, 'f.txt'), 'base\n')
    sh('git add . && git commit -q -m base && git checkout -q -b feat')
    fs.writeFileSync(path.join(repo, 'f.txt'), 'feat\n')
    sh('git commit -q -am "the work"')
    sh('git checkout -q main')
    fs.writeFileSync(path.join(repo, 'f.txt'), 'main\n')
    sh('git commit -q -am main && git checkout -q feat')
    try { sh('GIT_EDITOR=: git rebase main') } catch { /* stops on the conflict */ }
    fs.writeFileSync(path.join(repo, 'f.txt'), 'resolved\n')
    sh('git add f.txt')
    git = new GitService(repo)
  })

  afterEach(() => fs.rmSync(repo, { recursive: true, force: true }))

  test('an editor that cannot run is reported, and the resolution is kept', async () => {
    // What every reword did on Windows: git could not start the message editor,
    // `--continue` failed with the resolution staged, and the fallback ran
    // `rebase --skip` — which threw the commit away.
    ;(git as any).buildMessageEditor = () => ({ gitEditor: 'false', cleanup: () => {} })
    const r = await git.continueRebase(['message'])
    expect(r.success).toBe(false)
    expect(r.conflict).toBeFalsy()
    expect(sh('git diff --cached --name-only')).toBe('f.txt')
    expect(fs.readFileSync(path.join(repo, 'f.txt'), 'utf8')).toBe('resolved\n')
  })

  test('with a working editor the commit is made', async () => {
    const r = await git.continueRebase(['the work, rebased'])
    expect(r).toEqual({ success: true })
    expect(sh('git log --format=%s')).toBe('the work, rebased\nmain\nbase')
  })
})

describe('a rebase in a linked worktree', () => {
  // `.git` is a FILE there ("gitdir: …/.git/worktrees/<name>"), and the
  // rebase-merge/ of that tree lives where it points. The check joined
  // '<tree>/.git/rebase-merge', found nothing, and a conflict was reported as a
  // plain failure — no conflict screen, no Continue.
  let root: string
  let wt: string
  let git: GitService
  const sh = (cmd: string, cwd = wt): string => execSync(cmd, { cwd, encoding: 'utf8' }).trim()
  const commit = (body: string, msg: string): string => {
    fs.writeFileSync(path.join(wt, 'f.txt'), body)
    sh(`git commit -q -am "${msg}"`)
    return sh('git rev-parse HEAD')
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-wt-')))
    const main = path.join(root, 'main')
    wt = path.join(root, 'linked')
    fs.mkdirSync(main)
    sh('git init -q -b main && git config user.email t@t && git config user.name T', main)
    fs.writeFileSync(path.join(main, 'f.txt'), 'zero\n')
    sh('git add . && git commit -q -m base', main)
    sh(`git worktree add -q -b topic "${wt}"`, main)
    git = new GitService(wt)
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  test('really is a linked worktree', () => {
    expect(fs.statSync(path.join(wt, '.git')).isFile()).toBe(true)
  })

  test('a conflict pauses the rebase, is seen as one, and continues', async () => {
    const a = commit('one\n', 'a')
    const b = commit('two\n', 'b')
    // Dropping A and keeping B replays one→two onto zero: a conflict.
    const r = await git.interactiveRebase([{ action: 'drop', hash: a }, { action: 'pick', hash: b }])
    expect(r.conflict).toBe(true)
    expect(await git.getConflictMode()).toEqual({ mode: 'rebase' })

    fs.writeFileSync(path.join(wt, 'f.txt'), 'two\n')
    sh('git add f.txt')
    expect(await git.continueRebase()).toEqual({ success: true })
    expect(sh('git log --format=%s')).toBe('b\nbase')
    expect(await git.getConflictMode()).toEqual({ mode: null })
  })
})

describe('a rewrite stopped by the timeout', () => {
  test('is recognised by the kill, and said as what it is', () => {
    expect(core.timedOut(Object.assign(new Error('x'), { killed: true }))).toBe(true)
    expect(core.timedOut(Object.assign(new Error('x'), { killed: false, code: 1 }))).toBe(false)
    expect(core.timedOut(null)).toBe(false)
    expect(core.REWRITE_TIMEOUT_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
    expect(core.timeoutMessage('paused')).toMatch(/still in progress/)
    expect(core.timeoutMessage('paused')).not.toMatch(/conflict/i)
  })

  test('continue does not skip the step it was killed in', async () => {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-timeout-')))
    const sh = (cmd: string): string => execSync(cmd, { cwd: repo, encoding: 'utf8' }).trim()
    try {
      sh('git init -q -b main && git config user.email t@t && git config user.name T')
      fs.writeFileSync(path.join(repo, 'f.txt'), 'base\n')
      sh('git add . && git commit -q -m base && git checkout -q -b feat')
      fs.writeFileSync(path.join(repo, 'f.txt'), 'feat\n')
      sh('git commit -q -am work && git checkout -q main')
      fs.writeFileSync(path.join(repo, 'f.txt'), 'main\n')
      sh('git commit -q -am main && git checkout -q feat')
      try { sh('GIT_EDITOR=: git rebase main') } catch { /* stops on the conflict */ }
      // Resolved to main's side: nothing staged against HEAD — exactly the
      // state the skip fallback was written for, so only the kill can stop it.
      fs.writeFileSync(path.join(repo, 'f.txt'), 'main\n')
      sh('git add f.txt')

      const git = new GitService(repo)
      const calls: string[][] = []
      ;(git as any).gitExec = async (args: string[]) => {
        calls.push(args)
        throw Object.assign(new Error('killed'), { killed: true, signal: 'SIGTERM' })
      }
      const r = await git.continueRebase()
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/did not finish/)
      expect(calls).toEqual([['rebase', '--continue']])
    } finally {
      fs.rmSync(repo, { recursive: true, force: true })
    }
  })
})
