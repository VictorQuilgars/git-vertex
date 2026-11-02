// ai-copilot.ts — the `copilot` dialect on the desktop: GitHub Copilot, spoken
// through the Copilot CLI running in server mode, driven by GitHub's own SDK
// (@github/copilot-sdk, JSON-RPC over stdio).
//
// Free of `electron`, the ai-call pattern, so the unit suite can exercise what
// is pure here (finding the CLI, reading the model list, naming the failure).
//
// Three decisions this file encodes:
//
//   - The CLI is the USER'S. The SDK can bundle a runtime, and it is 171 MB per
//     platform — more than the rest of the app. So the platform packages are
//     excluded from the installers (package.json `build.files`) and the binary
//     is found the way git is: on the login shell's PATH, because an app
//     launched from the Finder sees a truncated one (git-binary.ts). The
//     credential comes with it — whatever account `copilot` is logged into, or
//     GH_TOKEN / COPILOT_GITHUB_TOKEN in the login shell's environment.
//
//   - The CLI is an AGENT, and this app wants a sentence. Every session is
//     opened with no tools at all (allowed: none; excluded: every source), a
//     permission handler that refuses whatever slips through, the system prompt
//     replaced, and a scratch directory as its working tree — so the
//     repository's AGENTS.md / copilot-instructions are not read and nothing it
//     says can reach a file. The session is deleted afterwards: a commit
//     message is not a conversation the user expects to find in their
//     `copilot --resume` list.
//
//   - One process, kept warm while it is being used and stopped when it is
//     not (IDLE_MS), and on quit. Starting the runtime costs a second or two;
//     paying it on every "generate" would be felt, and keeping it for ever
//     would be a process the user never asked to keep.

import { existsSync, mkdtempSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { CopilotClient } from '@github/copilot-sdk'
import { getGitBinary } from './git-binary'
import type { ProviderAnswer } from './ai-call'

/**
 * Said when the CLI is nowhere to be found — with WHERE it was looked for.
 *
 * The folders are the diagnosis. An app started from a desktop icon does not
 * get the PATH of the terminal where `copilot` works: on Windows it gets
 * Explorer's, and VS Code puts its own copy of the CLI on the PATH of its
 * integrated terminals only. "Not found" alone sent the user to a terminal
 * that disagreed with it; the list says which folders this process saw.
 */
export function copilotNotFoundMessage(explicit: string | undefined, searched: readonly string[]): string {
  const install = 'Install it (`npm install -g @github/copilot`, `winget install GitHub.Copilot` or '
    + '`brew install copilot-cli`), run `copilot` once in a terminal and sign in with /login — then try again.'
  const chosen = explicit?.trim()
  if (chosen) {
    return `COPILOT_CLI_PATH names ${chosen}, which does not exist. Point it at the Copilot CLI, or unset it to search for one. `
      + install
  }
  return `GitHub Copilot CLI not found. ${install} `
    + 'A copy elsewhere can be named with the COPILOT_CLI_PATH environment variable. '
    + (searched.length ? `Looked in: ${searched.join(' · ')}` : 'There was no folder to look in: the PATH is empty.')
}

/** Said when the CLI answers but has no account to answer for. */
export const COPILOT_NOT_SIGNED_IN =
  'The GitHub Copilot CLI is not signed in. Run `copilot` in a terminal and use /login '
  + '(or export GH_TOKEN with a token allowed to use Copilot), then try again.'

/**
 * A failure that asking again will not fix — no CLI, no sign-in. Marked so the
 * retry loop stops at once instead of relocating a binary that is not there
 * three times over.
 */
export class CopilotSetupError extends Error {
  readonly fatal = true
}

/** A reply this long in coming is not coming. */
const REPLY_TIMEOUT_MS = 120_000
/** How long the runtime stays up after its last call. */
const IDLE_MS = 10 * 60_000

const SYSTEM_PROMPT =
  'You are the writing assistant built into a git client. Each message is a self-contained task '
  + '(a commit message, an explanation, a pull request description…). Answer with exactly the text '
  + 'the task asks for, in the format it asks for — no preamble, no closing remarks, no tool use.'

/**
 * Where the installers put the CLI, beyond the PATH.
 *
 * A desktop icon starts the app with the PATH its launcher had, which is not
 * the terminal's: on Windows, Explorer's — and a folder added since, or added
 * only to some terminals, is not in it. VS Code's Copilot extension is the case
 * that made this list: it installs a `copilot` under its own `bin\copilot-shim`
 * and puts that folder on the PATH of VS Code's integrated terminals only, so
 * `where copilot` answers there and the app, started from its icon, saw
 * nothing. These are looked at AFTER the PATH, which still wins.
 */
export function copilotFallbackDirs(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === 'win32') {
    const at = (base: string | undefined, ...parts: string[]) => base ? [[base.replace(/[\\/]+$/, ''), ...parts].join('\\')] : []
    return [
      ...at(env.APPDATA, 'npm'),                                                           // npm install -g
      ...at(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'),                             // winget
      ...at(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'bin', 'copilot-shim'),          // VS Code, user install
      ...at(env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code Insiders', 'bin', 'copilot-shim'),
      ...at(env.ProgramFiles, 'Microsoft VS Code', 'bin', 'copilot-shim'),                 // VS Code, system install
    ]
  }
  return [
    ...(home ? [`${home.replace(/\/+$/, '')}/.local/bin`] : []),                           // the install script
    '/opt/homebrew/bin', '/usr/local/bin',                                                  // Homebrew, both arches
  ]
}

/**
 * Every folder to look in, in order: the PATH's, then the fallbacks, each once.
 * On Windows a folder is the same whatever its case or a trailing backslash.
 */
export function copilotSearchDirs(
  searchPath: string | undefined, platform: NodeJS.Platform, fallback: readonly string[],
): string[] {
  const sep = platform === 'win32' ? ';' : ':'
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...(searchPath ?? '').split(sep), ...fallback]) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1').replace(/[\\/]+$/, '')
    if (!dir) continue
    const key = platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(key)) continue
    seen.add(key)
    out.push(dir)
  }
  return out
}

/**
 * Where the Copilot CLI is, or null.
 *
 * Pure — the folders, the platform and the file test are arguments — because
 * the one thing that breaks here is a layout, and layouts are what tests can pin:
 *
 *   - an explicit COPILOT_CLI_PATH wins, as the SDK itself honours it;
 *   - Windows: `copilot.exe` (winget, the installer, VS Code's shim) is run as
 *     it is, while npm leaves a `copilot.cmd` shim that cannot be spawned
 *     without a shell — the package's own entry beside it is returned instead,
 *     a `.js`, which the SDK runs with the current executable (see `runtimeEnv`);
 *   - elsewhere: the first `copilot`. npm's is a symlink to a script whose
 *     shebang finds `node` on the PATH the child is given.
 */
export function locateCopilotCli(
  explicit: string | undefined,
  dirs: readonly string[],
  platform: NodeJS.Platform,
  exists: (p: string) => boolean,
): string | null {
  const chosen = explicit?.trim()
  if (chosen) return chosen
  const join_ = (dir: string, ...parts: string[]) => [dir, ...parts].join(platform === 'win32' ? '\\' : '/')
  for (const dir of dirs) {
    if (platform === 'win32') {
      const exe = join_(dir, 'copilot.exe')
      if (exists(exe)) return exe
      if (exists(join_(dir, 'copilot.cmd'))) {
        const entry = join_(dir, 'node_modules', '@github', 'copilot', 'npm-loader.js')
        if (exists(entry)) return entry
      }
      continue
    }
    const bin = join_(dir, 'copilot')
    if (exists(bin)) return bin
  }
  return null
}

/**
 * The environment the runtime is started with: the login shell's PATH (so a
 * shebang finds the user's `node`), and — when the CLI is a `.js` the SDK will
 * run with `process.execPath`, which in this process is Electron — the switch
 * that makes Electron behave as the Node it embeds.
 */
export function runtimeEnv(
  base: NodeJS.ProcessEnv, searchPath: string | undefined, cliPath: string,
): Record<string, string | undefined> {
  return {
    ...base,
    ...(searchPath ? { PATH: searchPath } : {}),
    ...(cliPath.endsWith('.js') ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
  }
}

/**
 * The ids a picker should offer: the ones the account's policy has not
 * switched off, sorted. `unconfigured` stays — it is a model the user has not
 * been asked about yet, and the CLI asks on first use.
 */
export function usableModelIds(models: ReadonlyArray<{ id: string; policy?: { state?: string } }>): string[] {
  return [...new Set(models
    .filter(m => m && typeof m.id === 'string' && m.id && m.policy?.state !== 'disabled')
    .map(m => m.id))].sort()
}

/**
 * What each model costs in premium requests — Copilot bills a message on a
 * paid model as a MULTIPLE of one request (0 for what the plan includes, 1,
 * 10…), and the picker wears it as a badge so a ten-fold model is not chosen
 * for one-line commit messages by accident. Only the models that say.
 */
export function modelCosts(
  models: ReadonlyArray<{ id: string; policy?: { state?: string }; billing?: { multiplier?: number } }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of models) {
    const x = m?.billing?.multiplier
    if (m && typeof m.id === 'string' && m.id && m.policy?.state !== 'disabled'
      && typeof x === 'number' && Number.isFinite(x) && x >= 0) out[m.id] = x
  }
  return out
}

/**
 * Whether a failure means the runtime is GONE rather than that it refused.
 *
 * The SDK keeps a client object after its CLI process has exited — its state
 * turns `disconnected` and every later call throws `Client not connected`.
 * Before this, the app kept that dead client for good: the settings row had
 * just listed the models, the CLI then stopped, and every request after it
 * failed with those three words until the app was restarted.
 */
export function isRuntimeGone(message: string): boolean {
  return /client not connected|connection (is )?closed|connection got disposed|cli server exited|EPIPE|write after end/i
    .test(message)
}

/** Said when a fresh runtime died under the call too — with what it left behind. */
export function copilotStoppedMessage(cli: string | null, why: string): string {
  return `The GitHub Copilot CLI stopped answering${why ? ` (${why})` : ''}.`
    + (cli ? ` It was started from ${cli}.` : '')
    + ' Run `copilot` in a terminal to see whether it starts there; if this copy keeps stopping, install the standalone CLI'
    + ' (`npm install -g @github/copilot` or `winget install GitHub.Copilot`) and restart Git Vertex.'
}

// ── The one runtime ─────────────────────────────────────────────

let client: Promise<CopilotClient> | null = null
let idle: ReturnType<typeof setTimeout> | null = null
let scratch: string | null = null
/** The CLI the current (or last) runtime was started from, and why the last one went away. */
let cliPath: string | null = null
let lastExit = ''

function scratchDir(): string {
  if (!scratch) scratch = mkdtempSync(join(tmpdir(), 'git-vertex-copilot-'))
  return scratch
}

async function startClient(): Promise<CopilotClient> {
  const { CopilotClient, RuntimeConnection } = await import('@github/copilot-sdk')
  const { searchPath } = getGitBinary()
  const dirs = copilotSearchDirs(searchPath ?? process.env.PATH, process.platform,
    copilotFallbackDirs(process.platform, process.env, homedir()))
  const cli = locateCopilotCli(process.env.COPILOT_CLI_PATH, dirs, process.platform, existsSync)
  if (!cli || !existsSync(cli)) throw new CopilotSetupError(copilotNotFoundMessage(process.env.COPILOT_CLI_PATH, dirs))
  cliPath = cli
  const c = new CopilotClient({
    connection: RuntimeConnection.forStdio({ path: cli }),
    env: runtimeEnv(process.env, searchPath, cli),
    workingDirectory: scratchDir(),
    useLoggedInUser: true,
    logLevel: 'error',
    clientInfo: { applicationName: 'git-vertex' },
  })
  await c.start()
  console.log(`[ai] copilot runtime started: ${cli}`)
  return c
}

/**
 * Still connected. Read off the SDK's own state, which it sets to
 * `disconnected` when the process exits or the pipe closes; a client that
 * does not carry the field is taken at its word.
 */
const alive = (c: CopilotClient): boolean => {
  const state = (c as any).state
  return state === undefined || state === 'connected'
}

/**
 * Why a runtime that was running is not any more: its exit code or signal,
 * and the last lines it wrote to stderr — the SDK keeps them, and they are the
 * only account of a CLI that died after it had started.
 */
function whyGone(c: CopilotClient): string {
  const proc = (c as any).cliProcess
  const code = proc?.exitCode ?? proc?.signalCode
  const tail = String((c as any).stderrBuffer ?? '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' | ')
  return [code !== null && code !== undefined ? `exit ${code}` : '', tail].filter(Boolean).join(': ')
}

function start(): Promise<CopilotClient> {
  const p: Promise<CopilotClient> = startClient().catch(e => { if (client === p) client = null; throw e })
  client = p
  return p
}

/**
 * The running client: started on first use, after a failure to start, and
 * again when the one kept here has lost its process — checked on every use
 * rather than trusted, which is what turned one exit into a dead provider.
 */
function getClient(): Promise<CopilotClient> {
  const current = client
  if (!current) return start()
  return current.then(c => {
    if (alive(c)) return c
    if (client !== current) return getClient()          // another call already replaced it
    lastExit = whyGone(c)
    console.warn(`[ai] copilot runtime went away${lastExit ? ` (${lastExit})` : ''} — starting a new one`)
    void c.stop().catch(() => { /* already gone */ })
    return start()
  })
}

function armIdle(): void {
  if (idle) clearTimeout(idle)
  idle = setTimeout(() => { void stopCopilot() }, IDLE_MS)
  // Never the reason the process stays alive.
  ;(idle as any).unref?.()
}

/** Stops the runtime, if one is running. Called when idle and on quit. */
export async function stopCopilot(): Promise<void> {
  if (idle) { clearTimeout(idle); idle = null }
  const running = client
  client = null
  if (!running) return
  try { await (await running).stop() } catch { /* it was not running after all */ }
}

async function signedInClient(): Promise<CopilotClient> {
  const c = await getClient()
  armIdle()
  const auth = await c.getAuthStatus()
  if (!auth.isAuthenticated) {
    throw new CopilotSetupError(auth.statusMessage ? `${COPILOT_NOT_SIGNED_IN} (${auth.statusMessage})` : COPILOT_NOT_SIGNED_IN)
  }
  return c
}

/**
 * Runs `fn` on a signed-in runtime, and once more on a fresh one if the
 * runtime went away under it. Twice is the whole policy: a CLI that dies again
 * straight after starting will not be helped by a third go, and the message
 * then names the binary and what it said, which is what the user needs to act.
 */
async function withRuntime<T>(fn: (c: CopilotClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(await signedInClient())
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      if (!isRuntimeGone(msg)) throw e
      if (attempt >= 2) {
        const c = await client?.catch(() => null)
        throw new CopilotSetupError(copilotStoppedMessage(cliPath, (c && whyGone(c)) || lastExit || msg))
      }
      console.warn(`[ai] copilot call lost its runtime (${msg}) — retrying on a new one`)
    }
  }
}

/** The models the signed-in account may use — the settings row's probe. */
export async function listCopilotModels(): Promise<{ models?: string[]; cost?: Record<string, number>; error?: string }> {
  try {
    const all = await withRuntime(c => c.listModels())
    const models = usableModelIds(all)
    return models.length ? { models, cost: modelCosts(all) } : { error: 'Copilot answered with no model this account may use.' }
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}

/** One prompt, one answer — a session opened for it and deleted after it. */
export async function callCopilot(model: string, prompt: string): Promise<ProviderAnswer> {
  return withRuntime(async c => {
    const session = await c.createSession({
      model,
      clientName: 'git-vertex',
      systemMessage: { mode: 'replace', content: SYSTEM_PROMPT },
      // No tool from any source, and a refusal for anything that asks anyway.
      availableTools: [],
      excludedTools: ['builtin:*', 'mcp:*', 'custom:*'],
      onPermissionRequest: () => ({ kind: 'reject', feedback: 'Git Vertex runs Copilot without tools.' }),
      skipCustomInstructions: true,
      enableHostGitOperations: false,
      enableSessionStore: false,
      infiniteSessions: { enabled: false },
      workingDirectory: scratchDir(),
    })
    try {
      // Safe to send again on a new runtime: with no tools, an answer that
      // never arrived changed nothing anywhere.
      const reply = await session.sendAndWait(prompt, REPLY_TIMEOUT_MS)
      // The SDK reports no length cut-off for a plain reply; the empty answer is
      // the retry loop's to handle, like any other dialect's.
      return { text: (reply?.data?.content ?? '').trim(), truncated: false }
    } finally {
      armIdle()
      await c.deleteSession(session.sessionId).catch(() => session.disconnect().catch(() => {}))
    }
  })
}
