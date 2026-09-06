// Running a prompt, and what the model wrote before: explanations, notes and changelogs kept per repository.
import { app } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { resolveAICall, appendInstructions, type AIFeature } from './ai-resolve'
import { callProvider } from './ai-call'
import { BASE_BUDGET, headroomFor, headroomKey, nextHeadroom } from './ai-budgets'
import { detailFor, DIFF_FEATURES } from './ai-diff'
import { readOversize, oversizeMessage } from './ai-oversize'
import { type Run, type ChangelogRecord, type ChangelogStore, type NoteRecord, type NoteStore } from './ai-features'
import { type Raw } from './ai-material'
import fs from 'fs'
import { readFileSync, writeFileSync } from 'fs'
import { state } from './app-state'
import { readSettings, writeSettings } from './settings-store'

// ── Shared AI pipeline ─────────────────────────────────────────
// Reads the configured provider/model/key from settings and runs one prompt
// with the same 3-attempt retry loop for every AI feature (commit message,
// recompose, explain, …). Returns { text } or { error }.
// The resolution and the wire shapes live in electron-free modules
// (ai-resolve.ts, ai-call.ts — the theme-validate pattern) so the unit suite
// exercises the real resolution and the manual live suite (tests-live/, run
// by hand: it spends API money) drives the exact production path. This
// function owns only the policy: reading settings, retrying, logging.
export async function runAIPrompt(prompt: string, feature?: AIFeature): Promise<{ text?: string; error?: string }> {
  const s = readSettings()
  const target = resolveAICall(s, feature)
  prompt = appendInstructions(prompt, s, feature)
  console.log(`[ai] feature=${feature ?? '-'} provider=${target.provider} model=${target.model} hasKey=${!!target.apiKey}`)
  // A custom endpoint may run keyless — local runtimes do (#169).
  if (!target.apiKey && !target.keyless) return { error: 'NO_API_KEY' }

  // The room this feature gets, times what it has learned about needing more.
  let headroom = headroomFor(s, feature)
  const base = feature ? BASE_BUDGET[feature] : 512
  let grew = false

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const answer = await callProvider(target, prompt, base * headroom)
      console.log(`[ai] attempt=${attempt} budget=${base * headroom} length=${answer.text.length} truncated=${answer.truncated}`)

      // Cut off mid-answer. Retrying with the SAME room is how this used to
      // fail three times and report an empty response: a reasoning model
      // spends its budget thinking, and thinks exactly as long each time.
      if (answer.truncated) {
        const more = nextHeadroom(headroom)
        if (more) {
          headroom = more
          grew = true
          console.log(`[ai] truncated — retrying with ${headroom}× the room`)
          continue
        }
        // At the top step and still cut off: say so, rather than hand back
        // half an answer or call it empty.
        return {
          error: `The answer did not fit — ${target.model} is still being cut off at ${base * headroom} tokens. `
            + 'Raise the reply length for this feature in Settings › AI Assistant, or choose a less verbose model.',
        }
      }

      if (answer.text) {
        // What it took to get an answer is remembered, and is remembered in
        // the control the user can see — a correction made on their behalf
        // must be one they can find and undo.
        if (grew && feature) {
          const now = readSettings()
          now[headroomKey(feature)] = String(headroom)
          writeSettings(now)
          console.log(`[ai] kept ${headroom}× for ${feature}`)
        }
        return { text: answer.text }
      }
      console.log(`[ai] empty response on attempt ${attempt}, retrying…`)
      if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt))
    } catch (e: any) {
      console.error(`[ai] attempt=${attempt} error:`, e.message)
      // A prompt that does not fit will not fit half a second later either.
      // Retrying it twice more is three certain failures where one was
      // already certain — and the raw provider string names an organization
      // id and a service tier rather than the control that fixes it (#185).
      const big = readOversize(e.message ?? '')
      if (big) {
        return { error: oversizeMessage(big, {
          model: target.model,
          detail: feature && (DIFF_FEATURES as readonly string[]).includes(feature)
            ? detailFor(s, feature) : undefined,
          headroom,
          raw: e.message,
        }) }
      }
      if (attempt === 3) return { error: e.message ?? 'API error' }
      await new Promise(r => setTimeout(r, 500 * attempt))
    }
  }
  return { error: 'The model returned an empty response after 3 attempts' }
}

/** Which level this feature is set to — read fresh, so a change in Settings
 *  applies to the next call rather than the next launch. */
export const diffOptsFor = (feature: string) => ({ detail: detailFor(readSettings(), feature) })

// AI conflict resolution: sends the whole conflicted file (markers included)
// plus an optional user instruction ("keep the new import, drop the old one")
// and asks for the fully-resolved file. The renderer drops the result into
// the resolver's manual-edit output, so the user always reviews before saving.
export const AI_CONFLICT_MAX_CHARS = 24000

// Explain: plain-language summary of what a commit changes. Read-only.
// Output in French — it's shown in the (French) UI, unlike commit messages
// which the project convention keeps in English.
// Explanations are cached per repo+hash (userData/ai-explanations.json) so
// re-opening one costs no API call; `force` regenerates. A hash's diff is
// immutable, so the cache never goes stale.
export const EXPL_CACHE_MAX_PER_REPO = 200

export const explCachePath = () => join(app.getPath('userData'), 'ai-explanations.json')

export function readExplCache(): Record<string, Record<string, string>> {
  try { return JSON.parse(fs.readFileSync(explCachePath(), 'utf-8')) } catch { return {} }
}

export function saveExplanation(repoPath: string, hash: string, explanation: string): void {
  const cache = readExplCache()
  const repo = cache[repoPath] ?? {}
  repo[hash] = explanation
  // Naive size cap: JSON preserves insertion order — drop the oldest entry.
  const keys = Object.keys(repo)
  if (keys.length > EXPL_CACHE_MAX_PER_REPO) delete repo[keys[0]]
  cache[repoPath] = repo
  try { fs.writeFileSync(explCachePath(), JSON.stringify(cache)) } catch { /* cache is best-effort */ }
}

// ── AI beyond the commit message (#70 P1) ──────────────────────
// Four reads and one proposal. The whole of each — which base a branch is
// read against, what is asked, on how many tokens, and what a refusal says —
// lives in ai-features.ts, which the extension host calls with its own git
// and its own provider. These handlers own the two things that ARE this
// process's: the repository it has open, and how it reaches a model.

/** The git this process runs, in the shape the shared module takes. */
export const rawGit = (): Raw => (args: string[]) => (state.gitService as any).git.raw(args)

export const runFeature: Run = (prompt, feature) => runAIPrompt(prompt, feature)

/**
 * The readings this app has kept, per repository
 * (`userData/ai-notes.json`, the shape the changelogs and the commit
 * explanations use). Commit explanations keep their own older file: a
 * commit's diff is immutable, so that store needs none of the staleness
 * this one carries.
 */
export const notesCachePath = () => join(app.getPath('userData'), 'ai-notes.json')

export function readNotesCache(): Record<string, NoteRecord[]> {
  try { return JSON.parse(fs.readFileSync(notesCachePath(), 'utf-8')) } catch { return {} }
}

export const writeNotesCache = (cache: Record<string, NoteRecord[]>): void => {
  try { fs.writeFileSync(notesCachePath(), JSON.stringify(cache)) } catch { /* best-effort */ }
}

export const NOTES_MAX_PER_REPO = 200

export const noteStore = (repoPath: string): NoteStore => ({
  async all() { return readNotesCache()[repoPath] ?? [] },
  async get(kind, key) {
    return (readNotesCache()[repoPath] ?? []).find(n => n.kind === kind && n.key === key) ?? null
  },
  async set(record) {
    const cache = readNotesCache()
    // One note per subject: a second reading of the same branch replaces the
    // first rather than growing a pile nobody asked for.
    const kept = (cache[repoPath] ?? []).filter(n => !(n.kind === record.kind && n.key === record.key))
    kept.unshift(record)
    cache[repoPath] = kept.slice(0, NOTES_MAX_PER_REPO)
    writeNotesCache(cache)
  },
  async forget(kind, key) {
    const cache = readNotesCache()
    if (!cache[repoPath]) return
    cache[repoPath] = cache[repoPath].filter(n => !(n.kind === kind && n.key === key))
    writeNotesCache(cache)
  },
})

/**
 * The changelogs this app has written, per repository and branch
 * (`userData/ai-changelogs.json`, the shape ai-explanations.json uses).
 *
 * A changelog is written to be pasted, so people come back to it — and
 * closing the drawer used to mean paying for it again. Unlike a commit's
 * explanation this one CAN go stale, which is why the record carries the two
 * shas it was written from: the drawer offers an update instead of quietly
 * showing yesterday's text.
 */
export const changelogCachePath = () => join(app.getPath('userData'), 'ai-changelogs.json')

export function readChangelogCache(): Record<string, Record<string, ChangelogRecord>> {
  try { return JSON.parse(fs.readFileSync(changelogCachePath(), 'utf-8')) } catch { return {} }
}

export const writeChangelogCache = (cache: Record<string, Record<string, ChangelogRecord>>): void => {
  try { fs.writeFileSync(changelogCachePath(), JSON.stringify(cache)) } catch { /* best-effort */ }
}

export const changelogStore = (repoPath: string): ChangelogStore => ({
  async get(branch) { return readChangelogCache()[repoPath]?.[branch] ?? null },
  async all() { return readChangelogCache()[repoPath] ?? {} },
  async forget(branch) {
    const cache = readChangelogCache()
    if (!cache[repoPath]?.[branch]) return
    delete cache[repoPath][branch]
    writeChangelogCache(cache)
  },
  async set(branch, record) {
    const cache = readChangelogCache()
    const repo = cache[repoPath] ?? {}
    repo[branch] = record
    // One per branch, and branches are deleted — the same naive cap the
    // explanations use, for the same reason.
    const keys = Object.keys(repo)
    if (keys.length > 100) delete repo[keys[0]]
    cache[repoPath] = repo
    writeChangelogCache(cache)
  },
})
