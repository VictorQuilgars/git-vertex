// The runtime's lifecycle: the SDK keeps a client object after its CLI
// process has exited, and every later call on it throws `Client not
// connected`. Reported from 1.40.1: the settings row had listed the models,
// and the next request failed with those three words until a restart. The
// SDK is faked here — the process is the user's, and what is under test is
// what this module does when it goes away.

const control = {
  /** What each NEW client does once started: 'ok', or die on its first listModels. */
  plan: [] as Array<'ok' | 'die-on-call'>,
  instances: [] as any[],
}

jest.mock('@github/copilot-sdk', () => {
  class CopilotClient {
    state = 'disconnected'
    cliProcess = { exitCode: null as number | null, signalCode: null as string | null }
    stderrBuffer = ''
    behaviour: string
    constructor() {
      this.behaviour = control.plan.shift() ?? 'ok'
      control.instances.push(this)
    }
    async start() { this.state = 'connected' }
    async stop() { this.state = 'disconnected' }
    die(why = 'segfault in the runtime') {
      this.state = 'disconnected'
      this.cliProcess.exitCode = 3
      this.stderrBuffer = `starting\n${why}\n`
    }
    private live() { if (this.state !== 'connected') throw new Error('Client not connected') }
    async getAuthStatus() { this.live(); return { isAuthenticated: true } }
    async listModels() {
      this.live()
      if (this.behaviour === 'die-on-call') { this.die(); throw new Error('Client not connected') }
      return [{ id: 'gpt-4.1', billing: { multiplier: 0 } }]
    }
  }
  return { CopilotClient, RuntimeConnection: { forStdio: () => ({ kind: 'stdio' }) } }
})

import { listCopilotModels, stopCopilot, isRuntimeGone, copilotStoppedMessage } from '../ai-copilot'

beforeAll(() => { process.env.COPILOT_CLI_PATH = process.execPath })   // any file that exists
afterAll(() => { delete process.env.COPILOT_CLI_PATH })
afterEach(async () => { await stopCopilot(); control.plan = []; control.instances = [] })

describe('a runtime that went away', () => {
  test('between two calls, the next one starts a new runtime instead of failing', async () => {
    expect((await listCopilotModels()).models).toEqual(['gpt-4.1'])
    control.instances[0].die()
    expect(await listCopilotModels()).toEqual({ models: ['gpt-4.1'], cost: { 'gpt-4.1': 0 } })
    expect(control.instances).toHaveLength(2)
  })

  test('under a call, the call is made once more on a new runtime', async () => {
    control.plan = ['die-on-call', 'ok']
    expect((await listCopilotModels()).models).toEqual(['gpt-4.1'])
    expect(control.instances).toHaveLength(2)
  })

  test('again straight away, it stops and says what the CLI left behind', async () => {
    control.plan = ['die-on-call', 'die-on-call']
    const { error } = await listCopilotModels()
    expect(error).toContain('The GitHub Copilot CLI stopped answering (exit 3: starting | segfault in the runtime)')
    expect(error).toContain(`It was started from ${process.execPath}`)
    expect(control.instances).toHaveLength(2)   // twice, not forever
  })

  test('a runtime still connected is reused, not restarted', async () => {
    await listCopilotModels()
    await listCopilotModels()
    expect(control.instances).toHaveLength(1)
  })
})

describe('telling a gone runtime from a refusal', () => {
  test.each([
    'Client not connected',
    'Connection is closed.',
    'Pending response rejected since connection got disposed',
    'CLI server exited with code 1',
    'write EPIPE',
  ])('%s is a runtime that went away', msg => expect(isRuntimeGone(msg)).toBe(true))

  test.each([
    'The GitHub Copilot CLI is not signed in.',
    'Model gpt-9 is not available',
    'rate limit exceeded',
  ])('%s is an answer, not an exit', msg => expect(isRuntimeGone(msg)).toBe(false))

  test('the message names the binary when it knows it', () => {
    expect(copilotStoppedMessage(null, '')).toBe(
      'The GitHub Copilot CLI stopped answering. Run `copilot` in a terminal to see whether it starts there; '
      + 'if this copy keeps stopping, install the standalone CLI (`npm install -g @github/copilot` or '
      + '`winget install GitHub.Copilot`) and restart Git Vertex.')
  })
})
