// tests-live/ai-live.test.ts — the PAID half of the AI settings contract.
//
//   npm run test:ai-live
//
// Never run by `npm test` or CI (this directory is outside every jest root):
// each test spends real API tokens against YOUR configured providers. It
// reads the app's actual settings.json — the same file the app writes — and
// drives resolveAICall + appendInstructions + callProvider, the exact
// production path, so a green run means YOUR configuration works: the keys
// answer, every chosen model exists on its provider, and instructions reach
// the model.
//
// Override the settings file with GV_SETTINGS_PATH=/path/to/settings.json.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { resolveAICall, appendInstructions, type AIFeature } from '../src/main/ai-resolve'
import { callProvider } from '../src/main/ai-call'

const FEATURES: AIFeature[] = ['commit', 'explain', 'conflict', 'search', 'filter', 'pr', 'issue']

// NOT small, however short the wanted answer is — the lesson AI_QUERY_TOKENS
// already carries in src/main/index.ts: a REASONING model (gpt-oss-120b and
// kin) spends its budget thinking before it emits anything, and at 16 the
// reply came back empty with finish_reason: length. You pay for what is
// used; a ceiling only buys room.
const BUDGET = 1024

function settingsPath(): string {
  if (process.env.GV_SETTINGS_PATH) return process.env.GV_SETTINGS_PATH
  const home = os.homedir()
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'git-vertex', 'settings.json')
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'git-vertex', 'settings.json')
  return path.join(home, '.config', 'git-vertex', 'settings.json')
}

function loadSettings(): Record<string, string | undefined> {
  const p = settingsPath()
  if (!fs.existsSync(p)) {
    throw new Error(`No settings file at ${p} — open the app once and save your AI settings, or point GV_SETTINGS_PATH at one.`)
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

const s = loadSettings()

// One call per DISTINCT pair — five features on the default model are one
// call, not five. Money is the constraint this suite exists to respect.
const targets = new Map<string, ReturnType<typeof resolveAICall> & { features: string[] }>()
for (const f of [undefined, ...FEATURES] as (AIFeature | undefined)[]) {
  const r = resolveAICall(s, f)
  if (!r.apiKey && !r.keyless) continue
  const k = `${r.provider}:${r.model}`
  const hit = targets.get(k)
  if (hit) hit.features.push(f ?? 'default')
  else targets.set(k, { ...r, features: [f ?? 'default'] })
}

describe('the configuration, resolved (free)', () => {
  test('at least one provider is connected', () => {
    expect(targets.size).toBeGreaterThan(0)
  })

  test('every feature resolves to a provider whose key is present', () => {
    for (const f of FEATURES) {
      const r = resolveAICall(s, f)
      // eslint-disable-next-line no-console
      console.log(`  ${f.padEnd(8)} → ${r.provider} / ${r.model}${r.apiKey ? '' : '  (NO KEY)'}`)
      if (!r.keyless) expect(r.apiKey).not.toBe('')
    }
  })
})

describe('the configuration, exercised (paid)', () => {
  test('every distinct (provider, model) pair answers', async () => {
    for (const t of targets.values()) {
      const reply = await callProvider(
        t, 'Reply with exactly the word OK and nothing else.', BUDGET)
      // eslint-disable-next-line no-console
      console.log(`  ${t.provider} / ${t.model}  [${t.features.join(', ')}] → "${reply.slice(0, 40)}"`)
      if (!reply) {
        throw new Error(`${t.provider}/${t.model} answered with empty content — with ${BUDGET} tokens of budget that usually means the model id is wrong for this provider, not a starved reasoning phase.`)
      }
      expect(reply.length).toBeGreaterThan(0)
    }
  }, 120000)

  test('global instructions reach the model', async () => {
    const r = resolveAICall(s)
    const sentinel = 'End your reply with the word PAMPLEMOUSSE.'
    const prompt = appendInstructions('Say hello in one short sentence.', {
      ...s, aiGlobalInstructions: [s.aiGlobalInstructions, sentinel].filter(Boolean).join('\n'),
    })
    const reply = await callProvider(r, prompt, BUDGET)
    // eslint-disable-next-line no-console
    console.log(`  global instructions → "${reply.slice(0, 80)}"`)
    expect(reply.toUpperCase()).toContain('PAMPLEMOUSSE')
  }, 60000)

  test("a feature's own instructions reach the model — and only that feature's", async () => {
    const sentinel = 'End your reply with the word CITRON.'
    const s2 = { ...s, 'aiFeatureInstructions:explain': [s['aiFeatureInstructions:explain'], sentinel].filter(Boolean).join('\n') }
    const r = resolveAICall(s2, 'explain')
    const withIt = appendInstructions('Say hello in one short sentence.', s2, 'explain')
    const without = appendInstructions('Say hello in one short sentence.', s2, 'search')
    expect(withIt).toContain('CITRON')
    expect(without).not.toContain('CITRON')
    const reply = await callProvider(r, withIt, BUDGET)
    // eslint-disable-next-line no-console
    console.log(`  explain instructions → "${reply.slice(0, 80)}"`)
    expect(reply.toUpperCase()).toContain('CITRON')
  }, 60000)
})
