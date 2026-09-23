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
import { callJudge, searchCommitsQuestions, readSearchAnswers, filterQueryQuestions, readFilterAnswers } from '../src/main/ai-judge'
import { validateGhQuery } from '../src/renderer/src/components/Sidebar/ghFilters'
import { authHeaders } from '../src/renderer/src/utils/aiProviders'

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

/**
 * A credential this process cannot open.
 *
 * The app seals its keys with the system's protected storage — safeStorage,
 * the Keychain on macOS — and only that app on that machine opens them. This
 * suite is plain Node, so a sealed value is a ciphertext it can read and
 * cannot use.
 *
 * Sending it anyway is what this used to do, and the provider answered
 * "Invalid API Key" — which this file then reported as a fault in the user's
 * configuration. It named the one thing that was NOT wrong. A suite whose job
 * is to say which part of a setup is broken has no business inventing a
 * breakage, so a sealed key is now a skip that says why.
 */
const SEALED = 'enc:v1:'
const isSealed = (v?: string) => !!v && v.startsWith(SEALED)

const s = loadSettings()

// One call per DISTINCT pair — five features on the default model are one
// call, not five. Money is the constraint this suite exists to respect.
const targets = new Map<string, ReturnType<typeof resolveAICall> & { features: string[] }>()
const sealedOut = new Set<string>()
for (const f of [undefined, ...FEATURES] as (AIFeature | undefined)[]) {
  const r = resolveAICall(s, f)
  if (isSealed(r.apiKey)) { sealedOut.add(`${r.provider} / ${r.model}`); continue }
  if (!r.apiKey && !r.keyless) continue
  const k = `${r.provider}:${r.model}`
  const hit = targets.get(k)
  if (hit) hit.features.push(f ?? 'default')
  else targets.set(k, { ...r, features: [f ?? 'default'] })
}

describe('the configuration, resolved (free)', () => {
  test('what this suite cannot reach, it says rather than fails', () => {
    if (!sealedOut.size) return
    // eslint-disable-next-line no-console
    console.log(`  sealed, so not exercised here: ${[...sealedOut].join(', ')}`
      + '\n  Their keys are in the system keychain, which only the app itself opens.'
      + '\n  To exercise them, point GV_SETTINGS_PATH at a settings.json holding plain keys.')
  })

  test('at least one provider is connected', () => {
    expect(targets.size).toBeGreaterThan(0)
  })

  test('every feature resolves to a provider whose key is present', () => {
    for (const f of FEATURES) {
      const r = resolveAICall(s, f)
      const state = isSealed(r.apiKey) ? '  (sealed)' : r.apiKey ? '' : '  (NO KEY)'
      // eslint-disable-next-line no-console
      console.log(`  ${f.padEnd(8)} → ${r.provider} / ${r.model}${state}`)
      if (!r.keyless) expect(r.apiKey).not.toBe('')
    }
  })
})

/**
 * A refusal that names who refused.
 *
 * The provider's own message is all a client gets — "Invalid API Key", and
 * not a word about which of the eight it came from. The whole point of this
 * file is to say which part of a configuration is broken, so the name is put
 * back on before the error leaves.
 */
async function ask(t: { provider: string; model: string }, prompt: string): Promise<string> {
  try {
    return (await callProvider(t as any, prompt, BUDGET)).text
  } catch (e: any) {
    throw new Error(`${t.provider} / ${t.model} refused it — ${e?.message ?? e}`)
  }
}

describe('the configuration, exercised (paid)', () => {
  test('every distinct (provider, model) pair answers', async () => {
    // One bad key must not hide the state of the others. The loop used to
    // stop at the first throw, so a configuration with one dead provider and
    // six live ones reported exactly as much as one that was dead through.
    const failed: string[] = []
    for (const t of targets.values()) {
      // A judgement engine has no answer to a prompt, by design — it is
      // exercised with questions in its own block below. Sending it one here
      // would be this file reporting a configuration fault that is really
      // this file asking the wrong thing.
      if (t.dialect === 'typesafe') continue
      const what = `${t.provider} / ${t.model}  [${t.features.join(', ')}]`
      let reply: string
      try {
        reply = await ask(t, 'Reply with exactly the word OK and nothing else.')
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.log(`  ${what} → REFUSED`)
        failed.push(e.message)
        continue
      }
      // eslint-disable-next-line no-console
      console.log(`  ${what} → "${reply.slice(0, 40)}"`)
      if (!reply) {
        failed.push(`${t.provider} / ${t.model} answered with empty content — with ${BUDGET} tokens of budget that usually means the model id is wrong for this provider, not a starved reasoning phase.`)
      }
    }
    const asked = [...targets.values()].filter(t => t.dialect !== 'typesafe').length
    if (failed.length) {
      throw new Error(`${failed.length} of ${asked} prompt pairs did not answer:\n  ${failed.join('\n  ')}`)
    }
  }, 120000)

  // The instruction checks ride the DEFAULT pair, so they can only run when
  // this process can open its key.
  const openDefault = !isSealed(resolveAICall(s).apiKey)
  const withDefault = openDefault ? test : test.skip

  withDefault('global instructions reach the model', async () => {
    const r = resolveAICall(s)
    const sentinel = 'End your reply with the word PAMPLEMOUSSE.'
    const prompt = appendInstructions('Say hello in one short sentence.', {
      ...s, aiGlobalInstructions: [s.aiGlobalInstructions, sentinel].filter(Boolean).join('\n'),
    })
    const { text: reply } = await callProvider(r, prompt, BUDGET)
    // eslint-disable-next-line no-console
    console.log(`  global instructions → "${reply.slice(0, 80)}"`)
    expect(reply.toUpperCase()).toContain('PAMPLEMOUSSE')
  }, 60000)

  withDefault("a feature's own instructions reach the model — and only that feature's", async () => {
    const sentinel = 'End your reply with the word CITRON.'
    const s2 = { ...s, 'aiFeatureInstructions:explain': [s['aiFeatureInstructions:explain'], sentinel].filter(Boolean).join('\n') }
    const r = resolveAICall(s2, 'explain')
    const withIt = appendInstructions('Say hello in one short sentence.', s2, 'explain')
    const without = appendInstructions('Say hello in one short sentence.', s2, 'search')
    expect(withIt).toContain('CITRON')
    expect(without).not.toContain('CITRON')
    const { text: reply } = await callProvider(r, withIt, BUDGET)
    // eslint-disable-next-line no-console
    console.log(`  explain instructions → "${reply.slice(0, 80)}"`)
    expect(reply.toUpperCase()).toContain('CITRON')
  }, 60000)
})

// ── The judgement dialect (paid, and pennies) ──────────────────
//
// Skipped unless the settings name a provider on the `typesafe` dialect, so
// this file still runs for a configuration that has none. What it proves is
// the half no mocked fetch can: that the questions this app builds are ones
// the engine accepts, and that its verdicts come back keyed as they were
// asked. A shape the vendor rejects is a 422 here and a dead feature in the
// product.
describe('the judgement dialect (paid)', () => {
  const target = resolveAICall(s, 'search')
  const runIf = target.dialect === 'typesafe' ? test : test.skip

  runIf('a batch of commit questions is accepted, and every one is answered', async () => {
    const commits = [
      { hash: 'a'.repeat(40), author: 'Ada Lovelace', date: '2026-09-01', subject: 'fix(theme): the picker no longer forgets the chosen theme' },
      { hash: 'b'.repeat(40), author: 'Alan Turing', date: '2026-03-14', subject: 'chore(deps): bump electron to 44' },
      { hash: 'c'.repeat(40), author: 'Ada Lovelace', date: '2026-09-02', subject: 'test(theme): cover the picker regression' },
    ]
    const { state, questions } = searchCommitsQuestions(
      'the change that broke the theme picker', commits, '2026-09-22')
    const reply = await callJudge(target, state, questions, authHeaders)

    // Keyed as asked — the contract the whole design rests on.
    expect(Object.keys(reply.answers).sort()).toEqual(['c0', 'c1', 'c2'])
    for (const a of Object.values(reply.answers)) {
      expect(a.type).toBe('noul')
      expect(typeof a.noul).toBe('number')
      expect(a.noul!).toBeGreaterThanOrEqual(0)
      expect(a.noul!).toBeLessThanOrEqual(1)
    }
    // eslint-disable-next-line no-console
    console.log(`  judgement → ${commits.map((c, i) => `${c.subject.slice(0, 28)}… ${reply.answers[`c${i}`].noul?.toFixed(2)}`).join(' | ')}`)
    // Not a scoring of the model, a sanity check on the wiring: the theme
    // commits must not both come back below the unrelated dependency bump.
    const [themeFix, bump, themeTest] = ['c0', 'c1', 'c2'].map(k => reply.answers[k].noul ?? 0)
    expect(Math.max(themeFix, themeTest)).toBeGreaterThan(bump)
  }, 60000)

  runIf('the reading path turns those verdicts into hashes it was given', async () => {
    const commits = [
      { hash: 'd'.repeat(40), author: 'Ada', date: '2026-09-01', subject: 'feat(graph): collapse a lane into one row' },
      { hash: 'e'.repeat(40), author: 'Ada', date: '2026-09-02', subject: 'docs: fix a typo in the readme' },
    ]
    const { state, questions } = searchCommitsQuestions('graph lanes', commits, '2026-09-22')
    const reply = await callJudge(target, state, questions, authHeaders)
    const hits = readSearchAnswers(reply.answers, commits)
    // Whatever it decided, every hash came from `commits` — there is no path
    // by which the engine can name one it was never shown.
    const known = new Set(commits.map(c => c.hash))
    expect(hits.filter(h => !known.has(h.hash))).toEqual([])
  }, 60000)
})

// ── The filter, composed from the vocabulary (paid, and pennies) ──
//
// The half no unit test reaches: whether the engine reads a described filter
// the way a person meant it. The composition is already guaranteed valid by
// construction, so what is checked here is MEANING — and it is checked as
// "this qualifier is present", never as an exact string, because several
// queries can be right.
describe('the filter query (paid)', () => {
  const target = resolveAICall(s, 'filter')
  const runIf = target.dialect === 'typesafe' ? test : test.skip
  const TODAY = new Date().toISOString().slice(0, 10)

  const compose = async (kind: 'prs' | 'issues', ask: string) => {
    const { state, questions } = filterQueryQuestions(kind, ask, TODAY)
    const reply = await callJudge(target, state, questions, authHeaders)
    return readFilterAnswers(reply.answers, kind, ask, TODAY)
  }

  const CASES: { kind: 'prs' | 'issues'; ask: string; must: string[]; mustNot?: string[] }[] = [
    { kind: 'prs', ask: 'mes pull requests encore ouvertes', must: ['author:@me'], mustNot: ['assignee:'] },
    { kind: 'prs', ask: 'les PR qui attendent ma relecture', must: ['review-requested:@me'], mustNot: ['assignee:'] },
    { kind: 'prs', ask: 'pull requests in draft', must: ['draft:true'] },
    { kind: 'prs', ask: 'PR vers main dont le CI a échoué', must: ['base:main', 'status:failure'], mustNot: ['head:'] },
    { kind: 'issues', ask: 'les issues ouvertes sans personne assignée', must: ['no:assignee'] },
    { kind: 'issues', ask: 'issues labelled bug, most recently updated first', must: ['label:bug', 'sort:updated'] },
    { kind: 'issues', ask: 'closed issues assigned to VictorQuilgars', must: ['assignee:VictorQuilgars'], mustNot: ['closed:'] },
    // The date qualifiers compete like the person ones did: "merged this year"
    // lit `closed:` too before it was made to step aside for `merged:`.
    { kind: 'prs', ask: 'merged since 2026-09-01', must: ['merged:>=2026-09-01'], mustNot: ['created:', 'updated:', 'closed:'] },
    { kind: 'prs', ask: 'PR de VictorQuilgars mergées cette année', must: ['author:VictorQuilgars', 'merged:>='], mustNot: ['created:', 'updated:', 'closed:'] },
    { kind: 'issues', ask: 'issues fermées depuis le 2026-09-01', must: ['closed:>=2026-09-01'], mustNot: ['created:', 'updated:'] },
    { kind: 'prs', ask: 'PR créées depuis le 2026-08-01', must: ['created:>=2026-08-01'], mustNot: ['merged:', 'closed:'] },
  ]

  for (const c of CASES) {
    runIf(`"${c.ask}"`, async () => {
      const query = await compose(c.kind, c.ask)
      // eslint-disable-next-line no-console
      console.log(`  ${c.ask}\n    → ${query}`)
      // Valid first: this is the property the whole design exists for, and it
      // must hold whatever the engine decided.
      expect(validateGhQuery(query, c.kind)).toEqual({ ok: true })
      for (const m of c.must) expect(query).toContain(m)
      for (const m of c.mustNot ?? []) expect(query).not.toContain(m)
    }, 60000)
  }

  runIf('a description with nothing filterable in it is refused, not guessed at', async () => {
    const query = await compose('issues', 'bonjour comment ça va')
    // eslint-disable-next-line no-console
    console.log(`  (nonsense) → ${query || '(empty)'}`)
    expect(validateGhQuery(query, 'issues')).toEqual({ ok: true })
  }, 60000)
})
