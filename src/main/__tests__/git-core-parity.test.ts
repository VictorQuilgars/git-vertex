import * as fs from 'fs'
import * as path from 'path'

// The guard on the shared core (#191).
//
// git-core.test.ts checks that the core is RIGHT. This checks that both
// products still go through it — which is the half that rots. The two services
// were two hand-written implementations of one contract for eleven releases,
// and the way they drifted was never a method disappearing: it was a method
// staying, with the right name and the right arity, quietly doing something
// else. `getBlame` dated its lines `fr-FR` on the desktop and `en-US` in the
// panel. No test could see it, because nothing said where the behaviour lived.
//
// This says it. A method in the table below is a delegation on BOTH sides, or
// this fails — whether someone inlined it back for a quick fix, or added a case
// to one host only.
//
// Moving the next family (log, status, …) means adding its rows here in the
// same commit.

const ROOT = path.resolve(__dirname, '..', '..', '..')
const DESKTOP = fs.readFileSync(path.join(ROOT, 'src', 'main', 'git-service.ts'), 'utf8')
const PANEL = fs.readFileSync(path.join(ROOT, 'vscode-extension', 'src', 'gitService.ts'), 'utf8')
const CORE = fs.readFileSync(path.join(ROOT, 'src', 'main', 'git-core.ts'), 'utf8')

const SERVICES: [string, string][] = [['the desktop service', DESKTOP], ["the panel's service", PANEL]]

/** The source of one method of a service class, signature included. */
function methodBody(source: string, name: string): string | null {
  const start = new RegExp(`^  (?:private |static |public )*(?:async )?${name}\\s*\\(`, 'm').exec(source)
  if (!start) return null
  const from = start.index
  // Every method in both files closes on a line that is exactly two spaces and
  // a brace; nothing nested is indented that shallowly.
  const end = source.indexOf('\n  }\n', from)
  return source.slice(from, end === -1 ? source.length : end + 5)
}

/** method on both services → the git-core function it must call. */
const SHARED: Record<string, string> = {
  getDiff: 'commitDiff',
  getCommitFiles: 'commitFiles',
  diffBetweenCommits: 'diffBetweenCommits',
  filesBetweenCommits: 'filesBetweenCommits',
  getMergeBase: 'mergeBase',
  getWorkingFileDiff: 'workingFileDiff',
  getFileDiffAtCommit: 'fileDiffAtCommit',
  diffCommitToWorking: 'diffCommitToWorking',
  getStashDiff: 'stashDiff',
  getBlame: 'blame',
  searchInDiffs: 'searchInDiffs',
}

describe('the shared git core is what both products run', () => {
  test('every shared method exists on both sides and delegates to git-core', () => {
    const wrong: string[] = []
    for (const [label, source] of SERVICES) {
      for (const [method, fn] of Object.entries(SHARED)) {
        const body = methodBody(source, method)
        if (body === null) { wrong.push(`${label}: ${method} is gone`); continue }
        if (!body.includes(`core.${fn}(`)) {
          wrong.push(`${label}: ${method} no longer calls core.${fn}() — it has its own implementation again`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  test('a delegation stays a delegation — no git command smuggled back in', () => {
    // A body that both calls the core AND runs its own git is the drift starting
    // over, one host at a time.
    const wrong: string[] = []
    for (const [label, source] of SERVICES) {
      for (const method of Object.keys(SHARED)) {
        const body = methodBody(source, method) ?? ''
        if (/this\.git\.|execFile|spawn\(/.test(body)) {
          wrong.push(`${label}: ${method} runs git itself instead of going through the core`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  test('the parsers moved rather than being copied', () => {
    // The three that were character-for-character identical in both files.
    for (const helper of ['parseNameAndNumStat', 'numstatPath', 'compareRange']) {
      expect(CORE).toContain(`export function ${helper}`)
      for (const [label, source] of SERVICES) {
        expect([label, new RegExp(`(private |function )(static )?${helper}\\s*\\(`).test(source)])
          .toEqual([label, false])
      }
    }
  })

  test('both services build a runner rather than handing the core a client', () => {
    // The one thing each host keeps: how git is reached. The desktop resolves
    // its binary through a login shell, the panel takes VS Code's environment —
    // and the core is told neither.
    for (const [label, source] of SERVICES) {
      expect([label, /private run: core\.GitRunner = \(args\) => this\.git\.raw\(args\)/.test(source)])
        .toEqual([label, true])
    }
  })

  test('the core is free of electron and of vscode', () => {
    // It is compiled into the Electron main process AND bundled into the
    // extension host. An import of either breaks one of the two builds — the
    // same rule theme-validate.ts lives by.
    const imports = [...CORE.matchAll(/^\s*(?:import|export)[^\n]*from\s+'([^']+)'/gm)].map(m => m[1])
    expect(imports.filter(m => m === 'electron' || m === 'vscode')).toEqual([])
    // And nothing at all today: it is pure over a runner, which is what lets
    // both hosts and the tests call it with anything that produces stdout.
    expect(imports).toEqual([])
  })

  test('the locale of a blame date is a decision, not the host it ran on', () => {
    expect(CORE).toContain("export const BLAME_DATE_LOCALE = 'en-US'")
    // The shipped UI is English-only; a host's system locale never reaches it.
    for (const [label, source] of SERVICES) {
      expect([label, source.includes('toLocaleDateString')]).toEqual([label, false])
    }
  })
})
