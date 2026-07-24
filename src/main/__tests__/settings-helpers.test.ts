import {
  parseAutoFetchMinutes, shouldUseSshCommand, buildSshCommand, buildToolInvocation,
  resolveTerminalLaunch, findAvailableKeyPath, safeTempFileName, updateSubmodulesIfEnabled,
  SubmoduleCapable,
} from '../settings-helpers'
import * as fs from 'fs'
import * as path from 'path'

describe('parseAutoFetchMinutes', () => {
  test('undefined is disabled', () => {
    expect(parseAutoFetchMinutes(undefined)).toBe(0)
  })
  test('"0" is disabled', () => {
    expect(parseAutoFetchMinutes('0')).toBe(0)
  })
  test('negative values are disabled', () => {
    expect(parseAutoFetchMinutes('-5')).toBe(0)
  })
  test('non-numeric values are disabled', () => {
    expect(parseAutoFetchMinutes('abc')).toBe(0)
  })
  test('a positive value is returned as-is', () => {
    expect(parseAutoFetchMinutes('5')).toBe(5)
    expect(parseAutoFetchMinutes('60')).toBe(60)
  })
})

describe('shouldUseSshCommand', () => {
  test('no private key configured — false', () => {
    expect(shouldUseSshCommand({})).toBe(false)
  })
  test('private key set, agent not requested — true', () => {
    expect(shouldUseSshCommand({ sshPrivateKey: '/Users/me/.ssh/id_ed25519' })).toBe(true)
  })
  test('local agent requested — false even with a key configured', () => {
    expect(shouldUseSshCommand({ sshUseAgent: 'true', sshPrivateKey: '/Users/me/.ssh/id_ed25519' })).toBe(false)
  })
  test('agent explicitly "false" with a key — true', () => {
    expect(shouldUseSshCommand({ sshUseAgent: 'false', sshPrivateKey: '/Users/me/.ssh/id_ed25519' })).toBe(true)
  })
})

describe('buildSshCommand', () => {
  test('wraps the key path with IdentitiesOnly', () => {
    expect(buildSshCommand('/Users/me/.ssh/id_ed25519'))
      .toBe('ssh -i "/Users/me/.ssh/id_ed25519" -o IdentitiesOnly=yes')
  })
  test('quotes a path containing spaces', () => {
    const cmd = buildSshCommand('/Users/me/my keys/id_ed25519')
    expect(cmd).toContain('"/Users/me/my keys/id_ed25519"')
  })
})

describe('buildToolInvocation', () => {
  test('empty command returns null', () => {
    expect(buildToolInvocation('')).toBeNull()
    expect(buildToolInvocation('   ')).toBeNull()
  })
  test('single-word command with one path', () => {
    expect(buildToolInvocation('opendiff', '/tmp/a.txt')).toEqual({ cmd: 'opendiff', args: ['/tmp/a.txt'] })
  })
  test('multi-word command keeps its flags before the paths', () => {
    expect(buildToolInvocation('code --diff', '/tmp/left', '/tmp/right'))
      .toEqual({ cmd: 'code', args: ['--diff', '/tmp/left', '/tmp/right'] })
  })
})

describe('resolveTerminalLaunch', () => {
  test('macOS with a custom terminal app name uses `open -a`', () => {
    expect(resolveTerminalLaunch({ customTerminal: 'iTerm', platform: 'darwin', cwd: '/repo' }))
      .toEqual({ cmd: 'open', args: ['-a', 'iTerm', '/repo'] })
  })
  test('macOS with no custom terminal falls back to Terminal.app', () => {
    expect(resolveTerminalLaunch({ customTerminal: '', platform: 'darwin', cwd: '/repo' }))
      .toEqual({ cmd: 'open', args: ['-a', 'Terminal', '/repo'] })
  })
  test('non-macOS with a custom terminal command spawns it directly', () => {
    expect(resolveTerminalLaunch({ customTerminal: 'wezterm start', platform: 'linux', cwd: '/repo' }))
      .toEqual({ cmd: 'wezterm', args: ['start', '/repo'] })
  })
  test('Windows with no custom terminal falls back to cmd', () => {
    expect(resolveTerminalLaunch({ customTerminal: '', platform: 'win32', cwd: 'C:\\repo' }))
      .toEqual({ cmd: 'cmd', args: ['/c', 'start', 'cmd', '/k', 'cd /d C:\\repo'] })
  })
  test('Linux with no custom terminal falls back to x-terminal-emulator', () => {
    expect(resolveTerminalLaunch({ customTerminal: '', platform: 'linux', cwd: '/repo' }))
      .toEqual({ cmd: 'x-terminal-emulator', args: ['--working-directory=/repo'] })
  })
})

describe('safeTempFileName', () => {
  test('keeps only the basename', () => {
    expect(safeTempFileName('src/components/App.tsx')).toBe('App.tsx')
  })
  test('a bare filename passes through', () => {
    expect(safeTempFileName('README.md')).toBe('README.md')
  })
  test('empty input falls back to "file"', () => {
    expect(safeTempFileName('')).toBe('file')
  })
})

describe('findAvailableKeyPath', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join('/tmp', `ssh-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)
    fs.mkdirSync(tempDir, { recursive: true })
  })
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('returns the base path when nothing exists yet', () => {
    expect(findAvailableKeyPath(tempDir)).toBe(path.join(tempDir, 'id_ed25519_gitvertex'))
  })

  test('increments when the base private key already exists', () => {
    fs.writeFileSync(path.join(tempDir, 'id_ed25519_gitvertex'), '')
    expect(findAvailableKeyPath(tempDir)).toBe(path.join(tempDir, 'id_ed25519_gitvertex_2'))
  })

  test('increments when only the .pub half already exists', () => {
    fs.writeFileSync(path.join(tempDir, 'id_ed25519_gitvertex.pub'), '')
    expect(findAvailableKeyPath(tempDir)).toBe(path.join(tempDir, 'id_ed25519_gitvertex_2'))
  })

  test('skips past multiple existing pairs', () => {
    fs.writeFileSync(path.join(tempDir, 'id_ed25519_gitvertex'), '')
    fs.writeFileSync(path.join(tempDir, 'id_ed25519_gitvertex_2'), '')
    fs.writeFileSync(path.join(tempDir, 'id_ed25519_gitvertex_3.pub'), '')
    expect(findAvailableKeyPath(tempDir)).toBe(path.join(tempDir, 'id_ed25519_gitvertex_4'))
  })
})

describe('updateSubmodulesIfEnabled', () => {
  function fakeGit(submodulePaths: string[]): SubmoduleCapable & { updated: string[] } {
    const updated: string[] = []
    return {
      updated,
      getSubmodules: async () => ({ submodules: submodulePaths.map(p => ({ path: p })) }),
      updateSubmodule: async (p: string) => { updated.push(p); return { success: true } },
    }
  }

  test('does nothing when the setting is off', async () => {
    const git = fakeGit(['libs/a', 'libs/b'])
    await updateSubmodulesIfEnabled(git, 'false')
    expect(git.updated).toEqual([])
  })

  test('does nothing when the setting is unset', async () => {
    const git = fakeGit(['libs/a'])
    await updateSubmodulesIfEnabled(git, undefined)
    expect(git.updated).toEqual([])
  })

  test('updates every submodule when the setting is on', async () => {
    const git = fakeGit(['libs/a', 'libs/b'])
    await updateSubmodulesIfEnabled(git, 'true')
    expect(git.updated).toEqual(['libs/a', 'libs/b'])
  })

  test('is a no-op when the repo has no submodules', async () => {
    const git = fakeGit([])
    await updateSubmodulesIfEnabled(git, 'true')
    expect(git.updated).toEqual([])
  })
})
