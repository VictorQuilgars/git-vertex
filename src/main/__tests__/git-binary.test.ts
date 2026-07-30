import { execFileSync } from 'child_process'
import { parseShellPath, mergePathEntries, isSimpleGitSafeBinary, shellPathCommand } from '../git-binary'

// The marker pair the login shell prints around its PATH. Duplicated here on
// purpose: if git-binary.ts changes them, these tests should be the thing that
// notices, not the app failing silently back to the truncated PATH.
const wrap = (path: string) => `__GV_PATH_OPEN__${path}__GV_PATH_CLOSE__`

describe('shellPathCommand', () => {
  // The bug this test exists for: both markers start with an underscore, and an
  // underscore is a valid identifier character. `"${OPEN}$PATH${CLOSE}"` is
  // therefore read as one variable named PATH__GV_PATH_CLOSE__ — unset — so the
  // shell prints the open marker and nothing else, parseShellPath answers null,
  // and the app quietly keeps the truncated PATH it was trying to escape.
  test('braces the variable', () => {
    expect(shellPathCommand()).toContain('${PATH}')
    expect(shellPathCommand()).not.toMatch(/\$PATH[^}]/)
  })

  // The parsing and the quoting are only right together, so assert them against
  // a real shell rather than against each other. Not an equality check: the
  // shell rewrites PATH from its own rc files, which is the entire point of
  // asking it. The failure mode being guarded is `null` — nothing came back.
  test('a real shell round-trips a usable PATH through it', () => {
    const shell = process.env.SHELL
    if (!shell || process.platform === 'win32') return
    const stdout = execFileSync(shell, ['-c', shellPathCommand()], {
      env: { ...process.env, PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
    })
    const path = parseShellPath(stdout)
    expect(path).not.toBeNull()
    expect(path!.split(':').filter(Boolean).length).toBeGreaterThan(0)
    expect(path).toContain('/usr/bin')
  })
})

describe('parseShellPath', () => {
  test('reads PATH out of a clean shell', () => {
    expect(parseShellPath(wrap('/opt/homebrew/bin:/usr/bin'))).toBe('/opt/homebrew/bin:/usr/bin')
  })

  // The reason for the markers: rc files print things. nvm, direnv, conda,
  // fortune, a MOTD — anything can land on stdout before and after our echo.
  test('survives a chatty rc file', () => {
    const noisy = [
      'Last login: Tue Jul 28 09:12:01',
      'direnv: loading ~/.envrc',
      wrap('/opt/homebrew/bin:/usr/bin'),
      'nvm: using node 20',
    ].join('\n')
    expect(parseShellPath(noisy)).toBe('/opt/homebrew/bin:/usr/bin')
  })

  test('a missing or truncated marker is no answer at all', () => {
    expect(parseShellPath('')).toBeNull()
    expect(parseShellPath('/opt/homebrew/bin:/usr/bin')).toBeNull()
    expect(parseShellPath('__GV_PATH_OPEN__/opt/homebrew/bin')).toBeNull()
    // Markers in the wrong order would slice backwards.
    expect(parseShellPath('__GV_PATH_CLOSE__x__GV_PATH_OPEN__')).toBeNull()
  })

  test('an empty PATH is no answer either', () => {
    expect(parseShellPath(wrap('   '))).toBeNull()
  })
})

describe('mergePathEntries', () => {
  test('the shell PATH wins, in its own order', () => {
    expect(mergePathEntries('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin'))
      .toBe('/opt/homebrew/bin:/usr/bin:/bin')
  })

  test('nothing the process had is dropped', () => {
    // The Electron-specific entries only the process has must survive, or we
    // would fix git and break something else.
    expect(mergePathEntries('/opt/homebrew/bin', '/usr/bin:/sbin'))
      .toBe('/opt/homebrew/bin:/usr/bin:/sbin')
  })

  test('duplicates and blanks are removed', () => {
    expect(mergePathEntries('/a::/b: /a ', '/b:/c')).toBe('/a:/b:/c')
  })

  test('either side may be missing', () => {
    expect(mergePathEntries(null, '/usr/bin')).toBe('/usr/bin')
    expect(mergePathEntries('/usr/bin', null)).toBe('/usr/bin')
    expect(mergePathEntries(null, null)).toBe('')
  })

  test('Windows separator', () => {
    expect(mergePathEntries('C:\\Program Files\\Git\\cmd;C:\\Windows', 'C:\\Windows', ';'))
      .toBe('C:\\Program Files\\Git\\cmd;C:\\Windows')
  })
})

describe('isSimpleGitSafeBinary', () => {
  test('ordinary posix paths pass', () => {
    expect(isSimpleGitSafeBinary('/opt/homebrew/bin/git')).toBe(true)
    expect(isSimpleGitSafeBinary('/usr/bin/git')).toBe(true)
    expect(isSimpleGitSafeBinary('git')).toBe(true)
    expect(isSimpleGitSafeBinary('~/bin/git')).toBe(true)
  })

  test('a drive-letter path passes', () => {
    expect(isSimpleGitSafeBinary('C:\\Users\\vic\\git.exe')).toBe(true)
  })

  // This is the case that matters: simple-git THROWS on it rather than
  // rejecting quietly, and it is where Windows actually installs git. Passing
  // it to customBinary would break every git call on a default install.
  test('a path with a space is refused', () => {
    expect(isSimpleGitSafeBinary('C:\\Program Files\\Git\\cmd\\git.exe')).toBe(false)
  })

  test('shell metacharacters are refused', () => {
    expect(isSimpleGitSafeBinary('/usr/bin/git; rm -rf /')).toBe(false)
    expect(isSimpleGitSafeBinary('/usr/bin/git$(whoami)')).toBe(false)
    expect(isSimpleGitSafeBinary('')).toBe(false)
  })
})
