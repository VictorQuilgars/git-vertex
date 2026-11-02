import { locateCopilotCli, runtimeEnv, usableModelIds, modelCosts } from '../ai-copilot'

// The Copilot CLI is the user's, found the way git is (git-binary.ts): on the
// login shell's PATH. What breaks here is a LAYOUT — where each installer puts
// the binary — so the layouts are pinned, with a fake filesystem.

const fsOf = (...files: string[]) => (p: string) => files.includes(p)

describe('finding the Copilot CLI', () => {
  test('an explicit COPILOT_CLI_PATH wins, as the SDK itself honours it', () => {
    expect(locateCopilotCli(' /opt/copilot ', '/usr/bin', 'darwin', fsOf('/usr/bin/copilot'))).toBe('/opt/copilot')
  })

  test('elsewhere than Windows, the first `copilot` on PATH', () => {
    const exists = fsOf('/opt/homebrew/bin/copilot', '/usr/local/bin/copilot')
    expect(locateCopilotCli(undefined, '/usr/bin:/opt/homebrew/bin/:/usr/local/bin', 'darwin', exists))
      .toBe('/opt/homebrew/bin/copilot')
  })

  test('Windows: an installed copilot.exe is run as it is', () => {
    expect(locateCopilotCli(undefined, 'C:\\Windows;C:\\Tools\\Copilot', 'win32', fsOf('C:\\Tools\\Copilot\\copilot.exe')))
      .toBe('C:\\Tools\\Copilot\\copilot.exe')
  })

  test("Windows: npm's .cmd shim is traded for the package's own entry, which can be spawned", () => {
    const dir = 'C:\\Users\\v\\AppData\\Roaming\\npm'
    const entry = `${dir}\\node_modules\\@github\\copilot\\npm-loader.js`
    expect(locateCopilotCli(undefined, `"${dir}";C:\\Windows`, 'win32', fsOf(`${dir}\\copilot.cmd`, entry))).toBe(entry)
  })

  test('Windows: a shim whose package is gone is not a CLI', () => {
    const dir = 'C:\\npm'
    expect(locateCopilotCli(undefined, dir, 'win32', fsOf(`${dir}\\copilot.cmd`))).toBeNull()
  })

  test('nowhere, or no PATH at all, is null — the caller says how to install it', () => {
    expect(locateCopilotCli(undefined, '/usr/bin:/bin', 'linux', fsOf())).toBeNull()
    expect(locateCopilotCli(undefined, undefined, 'linux', fsOf())).toBeNull()
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
