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
import { tmpdir } from 'os'
import { join } from 'path'
import type { CopilotClient } from '@github/copilot-sdk'
import { getGitBinary } from './git-binary'
import type { ProviderAnswer } from './ai-call'

/** Said when the CLI is nowhere to be found. Names the two installs that exist. */
export const COPILOT_NOT_INSTALLED =
  'GitHub Copilot CLI not found. Install it (`npm install -g @github/copilot`, or `brew install copilot-cli`), '
  + 'run `copilot` once in a terminal and sign in with /login — then try again. '
  + 'A copy outside your PATH can be named with the COPILOT_CLI_PATH environment variable.'

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
 * Where the Copilot CLI is, or null.
 *
 * Pure — the PATH, the platform and the file test are arguments — because the
 * one thing that breaks here is a layout, and layouts are what tests can pin:
 *
 *   - an explicit COPILOT_CLI_PATH wins, as the SDK itself honours it;
 *   - Windows: `copilot.exe` (winget, the installer) is run as it is, while
 *     npm leaves a `copilot.cmd` shim that cannot be spawned without a shell —
 *     the package's own entry beside it is returned instead, a `.js`, which
 *     the SDK runs with the current executable (see `runtimeEnv`);
 *   - elsewhere: the first `copilot` on PATH. npm's is a symlink to a script
 *     whose shebang finds `node` on the PATH the child is given.
 */
export function locateCopilotCli(
  explicit: string | undefined,
  searchPath: string | undefined,
  platform: NodeJS.Platform,
  exists: (p: string) => boolean,
): string | null {
  const chosen = explicit?.trim()
  if (chosen) return chosen
  const sep = platform === 'win32' ? ';' : ':'
  const join_ = (dir: string, ...parts: string[]) => [dir.replace(/[\\/]+$/, ''), ...parts].join(platform === 'win32' ? '\\' : '/')
  for (const raw of (searchPath ?? '').split(sep)) {
    const dir = raw.trim().replace(/^"(.*)"$/, '$1')
    if (!dir) continue
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

// ── The one runtime ─────────────────────────────────────────────

let client: Promise<CopilotClient> | null = null
let idle: ReturnType<typeof setTimeout> | null = null
let scratch: string | null = null

function scratchDir(): string {
  if (!scratch) scratch = mkdtempSync(join(tmpdir(), 'git-vertex-copilot-'))
  return scratch
}

async function startClient(): Promise<CopilotClient> {
  const { CopilotClient, RuntimeConnection } = await import('@github/copilot-sdk')
  const { searchPath } = getGitBinary()
  const cli = locateCopilotCli(process.env.COPILOT_CLI_PATH, searchPath ?? process.env.PATH, process.platform, existsSync)
  if (!cli || !existsSync(cli)) throw new CopilotSetupError(COPILOT_NOT_INSTALLED)
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

/** The running client, started on first use and after any failure to start. */
function getClient(): Promise<CopilotClient> {
  if (!client) client = startClient().catch(e => { client = null; throw e })
  return client
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

/** The models the signed-in account may use — the settings row's probe. */
export async function listCopilotModels(): Promise<{ models?: string[]; error?: string }> {
  try {
    const c = await signedInClient()
    const models = usableModelIds(await c.listModels())
    return models.length ? { models } : { error: 'Copilot answered with no model this account may use.' }
  } catch (e: any) {
    return { error: e?.message ?? String(e) }
  }
}

/** One prompt, one answer — a session opened for it and deleted after it. */
export async function callCopilot(model: string, prompt: string): Promise<ProviderAnswer> {
  const c = await signedInClient()
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
    const reply = await session.sendAndWait(prompt, REPLY_TIMEOUT_MS)
    // The SDK reports no length cut-off for a plain reply; the empty answer is
    // the retry loop's to handle, like any other dialect's.
    return { text: (reply?.data?.content ?? '').trim(), truncated: false }
  } finally {
    armIdle()
    await c.deleteSession(session.sessionId).catch(() => session.disconnect().catch(() => {}))
  }
}
