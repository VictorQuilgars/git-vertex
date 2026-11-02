import {
  locateCopilotCli, copilotSearchDirs, copilotFallbackDirs, copilotNotFoundMessage,
  runtimeEnv, usableModelIds, modelCosts,
} from '../ai-copilot'

// The Copilot CLI is the user's, found the way git is (git-binary.ts): on the
// login shell's PATH, then where the installers put it. What breaks here is a
// LAYOUT — where each installer puts the binary — so the layouts are pinned,
// with a fake filesystem.

const fsOf = (...files: string[]) => (p: string) => files.includes(p)
const dirsOf = (path: string | undefined, platform: NodeJS.Platform, fallback: string[] = []) =>
  copilotSearchDirs(path, platform, fallback)

describe('finding the Copilot CLI', () => {
  test('an explicit COPILOT_CLI_PATH wins, as the SDK itself honours it', () => {
    expect(locateCopilotCli(' /opt/copilot ', dirsOf('/usr/bin', 'darwin'), 'darwin', fsOf('/usr/bin/copilot'))).toBe('/opt/copilot')
  })

  test('elsewhere than Windows, the first `copilot` on PATH', () => {
    const exists = fsOf('/opt/homebrew/bin/copilot', '/usr/local/bin/copilot')
    expect(locateCopilotCli(undefined, dirsOf('/usr/bin:/opt/homebrew/bin/:/usr/local/bin', 'darwin'), 'darwin', exists))
      .toBe('/opt/homebrew/bin/copilot')
  })

  test('Windows: an installed copilot.exe is run as it is', () => {
    expect(locateCopilotCli(undefined, dirsOf('C:\\Windows;C:\\Tools\\Copilot', 'win32'), 'win32', fsOf('C:\\Tools\\Copilot\\copilot.exe')))
      .toBe('C:\\Tools\\Copilot\\copilot.exe')
  })

  test("Windows: npm's .cmd shim is traded for the package's own entry, which can be spawned", () => {
    const dir = 'C:\\Users\\v\\AppData\\Roaming\\npm'
    const entry = `${dir}\\node_modules\\@github\\copilot\\npm-loader.js`
    expect(locateCopilotCli(undefined, dirsOf(`"${dir}";C:\\Windows`, 'win32'), 'win32', fsOf(`${dir}\\copilot.cmd`, entry))).toBe(entry)
  })

  test('Windows: a shim whose package is gone is not a CLI', () => {
    const dir = 'C:\\npm'
    expect(locateCopilotCli(undefined, dirsOf(dir, 'win32'), 'win32', fsOf(`${dir}\\copilot.cmd`))).toBeNull()
  })

  test('nowhere, or no PATH at all, is null — the caller says how to install it', () => {
    expect(locateCopilotCli(undefined, dirsOf('/usr/bin:/bin', 'linux'), 'linux', fsOf())).toBeNull()
    expect(locateCopilotCli(undefined, dirsOf(undefined, 'linux'), 'linux', fsOf())).toBeNull()
  })
})

describe('beyond the PATH — where the installers put it', () => {
  const env = {
    APPDATA: 'C:\\Users\\v\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\v\\AppData\\Local\\',
    ProgramFiles: 'C:\\Program Files',
  }

  test('Windows: npm, winget and the copy VS Code installs, user and system', () => {
    expect(copilotFallbackDirs('win32', env, 'C:\\Users\\v')).toEqual([
      'C:\\Users\\v\\AppData\\Roaming\\npm',
      'C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Links',
      'C:\\Users\\v\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\copilot-shim',
      'C:\\Users\\v\\AppData\\Local\\Programs\\Microsoft VS Code Insiders\\bin\\copilot-shim',
      'C:\\Program Files\\Microsoft VS Code\\bin\\copilot-shim',
    ])
  })

  test('Windows: a folder whose variable is unset is not invented', () => {
    expect(copilotFallbackDirs('win32', { APPDATA: 'C:\\R' }, '')).toEqual(['C:\\R\\npm'])
  })

  test("elsewhere: the install script's ~/.local/bin and both Homebrews", () => {
    expect(copilotFallbackDirs('darwin', {}, '/Users/v/')).toEqual(['/Users/v/.local/bin', '/opt/homebrew/bin', '/usr/local/bin'])
  })

  test("VS Code's copy is found from a desktop icon, whose PATH does not hold it", () => {
    // The case that made the list: `where copilot` answered in VS Code's
    // terminal, and the app — started from Explorer — saw nothing.
    const shim = 'C:\\Users\\v\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\copilot-shim'
    const dirs = dirsOf('C:\\Windows\\system32;C:\\Windows', 'win32', copilotFallbackDirs('win32', env, ''))
    expect(locateCopilotCli(undefined, dirs, 'win32', fsOf(`${shim}\\copilot.exe`))).toBe(`${shim}\\copilot.exe`)
  })

  test('the PATH still wins over a fallback, and a folder is looked in once', () => {
    const dirs = dirsOf('C:\\tools;c:\\users\\v\\appdata\\roaming\\NPM\\', 'win32', copilotFallbackDirs('win32', env, ''))
    expect(dirs[0]).toBe('C:\\tools')
    expect(dirs.filter(d => d.toLowerCase().endsWith('\\npm'))).toHaveLength(1)
    expect(locateCopilotCli(undefined, dirs, 'win32', fsOf('C:\\tools\\copilot.exe',
      'C:\\Users\\v\\AppData\\Local\\Microsoft\\WinGet\\Links\\copilot.exe'))).toBe('C:\\tools\\copilot.exe')
  })

  test('on a case-sensitive system, two spellings are two folders', () => {
    expect(dirsOf('/opt/A:/opt/a:/opt/a/', 'linux')).toEqual(['/opt/A', '/opt/a'])
  })
})

describe('saying it was not found', () => {
  test('the message names every folder it looked in, and how to install', () => {
    const msg = copilotNotFoundMessage(undefined, ['C:\\Windows', 'C:\\Users\\v\\AppData\\Roaming\\npm'])
    expect(msg).toContain('GitHub Copilot CLI not found')
    expect(msg).toContain('Looked in: C:\\Windows · C:\\Users\\v\\AppData\\Roaming\\npm')
    expect(msg).toContain('winget install GitHub.Copilot')
    expect(msg).toContain('COPILOT_CLI_PATH')
  })

  test('a COPILOT_CLI_PATH that names nothing says so, rather than listing a search it did not make', () => {
    const msg = copilotNotFoundMessage(' C:\\nope\\copilot.exe ', ['C:\\Windows'])
    expect(msg).toContain('COPILOT_CLI_PATH names C:\\nope\\copilot.exe, which does not exist')
    expect(msg).not.toContain('Looked in')
  })
})

describe('the environment the runtime starts in', () => {
  test("it gets the login shell's PATH, so a shebang finds the user's node", () => {
    const env = runtimeEnv({ PATH: '/usr/bin', HOME: '/h' }, '/opt/homebrew/bin:/usr/bin', '/opt/homebrew/bin/copilot')
    expect(env).toEqual(expect.objectContaining({ PATH: '/opt/homebrew/bin:/usr/bin', HOME: '/h' }))
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })

  test('a .js entry is run by this executable — Electron, told to behave as Node', () => {
    expect(runtimeEnv({}, undefined, 'C:\\npm\\node_modules\\@github\\copilot\\npm-loader.js').ELECTRON_RUN_AS_NODE).toBe('1')
  })
})

describe('the models a picker offers', () => {
  test("what the account's policy switched off is left out; the rest sorted, once each", () => {
    expect(usableModelIds([
      { id: 'gpt-5', policy: { state: 'enabled' } },
      { id: 'claude-sonnet-4.5', policy: { state: 'disabled' } },
      { id: 'gpt-4.1' },
      { id: 'gemini-2.5-pro', policy: { state: 'unconfigured' } },
      { id: 'gpt-5' },
      { id: '' } as any,
    ])).toEqual(['gemini-2.5-pro', 'gpt-4.1', 'gpt-5'])
  })
})

describe('what a model costs, in premium requests', () => {
  test('the multiplier of every usable model that states one — zero included', () => {
    expect(modelCosts([
      { id: 'gpt-4.1', billing: { multiplier: 0 } },
      { id: 'claude-sonnet-4.5', billing: { multiplier: 1 } },
      { id: 'claude-opus-4.1', billing: { multiplier: 10 } },
      { id: 'gemini-flash', billing: { multiplier: 0.33 } },
    ])).toEqual({ 'gpt-4.1': 0, 'claude-sonnet-4.5': 1, 'claude-opus-4.1': 10, 'gemini-flash': 0.33 })
  })

  test('a model that states none, a nonsense one, or a disabled one is left out', () => {
    expect(modelCosts([
      { id: 'a' },
      { id: 'b', billing: {} },
      { id: 'c', billing: { multiplier: -1 } },
      { id: 'd', billing: { multiplier: NaN } },
      { id: 'e', billing: { multiplier: 2 }, policy: { state: 'disabled' } },
    ])).toEqual({})
  })
})
