// agents.ts — which AI coding agents are running, and in which directory.
//
// Backs the Agents view in the activity rail and the "an agent is working here"
// badge on worktree rows. Both are shared renderer code (Sidebar.tsx), so they
// rendered in the panel from the day the rail shipped while `listAgents`
// answered not-implemented — the rail's robot icon opened an empty list and no
// worktree ever got a badge.
//
// Ported from the desktop's `agents:list` handler (src/main/index.ts). Same two
// steps, same output shape, no Electron dependency: it is a `ps` walk and one
// `lsof` call, both of which the extension host can run itself.

import { execFile } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execFile)

/** Process name → the name we show. Keep in sync with the desktop's copy. */
const AGENT_COMMANDS: Record<string, string> = {
  claude: 'Claude Code',
  aider: 'aider',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  amp: 'Amp',
  goose: 'Goose',
}

export interface RunningAgent { pid: number; name: string; cwd: string }

export async function listAgents(): Promise<{ agents: RunningAgent[] }> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return { agents: [] }
  try {
    // Step 1: find candidate PIDs by command name via ps — reliable, unlike
    // `lsof -c`, which sees Claude Code's versioned binary name ("2.1.202"),
    // not "claude".
    const ps = await exec('ps', ['-axo', 'pid=,comm=']).then(r => r.stdout).catch(() => '')
    const candidates: { pid: number; name: string }[] = []
    for (const line of ps.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(.*)$/)
      if (!m) continue
      const base = m[2].trim().split('/').pop() ?? ''
      const key = Object.keys(AGENT_COMMANDS).find(k => base === k)
      if (key) candidates.push({ pid: parseInt(m[1], 10), name: AGENT_COMMANDS[key] })
    }
    if (candidates.length === 0) return { agents: [] }

    // Step 2: resolve each candidate's cwd with one targeted lsof call.
    const pidList = candidates.map(c => c.pid).join(',')
    const out = await exec('lsof', ['-a', '-d', 'cwd', '-F', 'pn', '-p', pidList])
      .then(r => r.stdout).catch((e: any) => e.stdout ?? '')
    const byPid = new Map(candidates.map(c => [c.pid, c.name]))
    const agents: RunningAgent[] = []
    let pid = 0
    for (const line of out.split('\n')) {
      if (line.startsWith('p')) pid = parseInt(line.slice(1), 10)
      else if (line.startsWith('n')) {
        const name = byPid.get(pid)
        const cwd = line.slice(1)
        // "/" = not meaningfully attached to a project (e.g. IDE helper daemons)
        if (name && cwd !== '/') agents.push({ pid, name, cwd })
      }
    }
    return { agents }
  } catch {
    return { agents: [] }
  }
}
