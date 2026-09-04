// ai-features.ts — the five capabilities #70 P1 adds, whole: material,
// prompt, budget, the refusal when there is nothing to read, and the parsing
// of what comes back.
//
// The desktop main process and the extension host both call THESE, passing
// only their own git and their own way of reaching a provider. That is the
// point: the four features that shipped before this live in two copies, and
// the copies have disagreed about ref resolution, about wording, and about
// which feature's model a call runs on. Here a host cannot hold a different
// opinion — it has none to hold.
//
// Free of `electron` and `vscode` (the theme-validate pattern), so the unit
// suite drives the real thing with a fake git and a fake model.

import type { AIFeature } from './ai-resolve'
import { branchMaterial, changelogMaterial, stashMaterial, workingMaterial, type Raw } from './ai-material'
import {
  explainBranchPrompt, explainStashPrompt, explainWorkingPrompt, changelogPrompt,
  splitPrompt, parseSplit, type SplitProposal,
} from './ai-prompts'

/**
 * One model call. The FEATURE is passed rather than bound by the caller: it
 * decides which model and whose instructions the call runs on, and a host
 * that picked it itself would be free to pick a different one from the other
 * host — which is exactly the drift this module exists to remove.
 */
export type Run = (prompt: string, maxTokens: number, feature: AIFeature) => Promise<{ text?: string; error?: string }>

/** Prose answers in paragraphs; a changelog and a split answer in lists. */
const PROSE_TOKENS = 768
const CHANGELOG_TOKENS = 2048
const SPLIT_TOKENS = 2048

/**
 * None of these caches. A commit's diff is immutable, which is what makes
 * `ai-explanations.json` safe; a branch, a stash and a working tree all move
 * under their answer, and a stored explanation of a moving target is wrong
 * without ever looking wrong.
 */
export async function explainBranch(raw: Raw, run: Run, branch: string, guidance?: string):
Promise<{ explanation?: string; base?: string; error?: string }> {
  const m = await branchMaterial(raw, branch)
  if (!m) return { error: `No base to read ${branch} against — it has no upstream and the repository has no trunk` }
  if (!m.subjects.length && !m.diff.trim()) return { error: `${branch} carries nothing over ${m.base}` }
  const r = await run(explainBranchPrompt(branch, m.base, m.subjects, m.diffstat, m.diff, guidance), PROSE_TOKENS, 'explain')
  return r.error ? { error: r.error } : { explanation: r.text, base: m.base }
}

export async function explainStash(raw: Raw, run: Run, index: number, guidance?: string):
Promise<{ explanation?: string; error?: string }> {
  const m = await stashMaterial(raw, index)
  if (!m.diff.trim()) return { error: 'This stash has no changes to analyze' }
  const r = await run(explainStashPrompt(m.label, m.diff, guidance), PROSE_TOKENS, 'explain')
  return r.error ? { error: r.error } : { explanation: r.text }
}

export async function explainWorking(raw: Raw, run: Run, guidance?: string):
Promise<{ explanation?: string; error?: string }> {
  const m = await workingMaterial(raw)
  if (!m.staged.trim() && !m.unstaged.trim()) return { error: 'Nothing uncommitted to analyze' }
  const r = await run(explainWorkingPrompt(m.staged, m.unstaged, m.diffstat, guidance), PROSE_TOKENS, 'explain')
  return r.error ? { error: r.error } : { explanation: r.text }
}

export async function generateChangelog(raw: Raw, run: Run, branch: string, base?: string):
Promise<{ changelog?: string; base?: string; commits?: number; error?: string }> {
  const m = await changelogMaterial(raw, branch, base)
  if (!m) return { error: `No base to read ${branch} against — it has no upstream and the repository has no trunk` }
  if (!m.entries.length) return { error: `${branch} carries no commit over ${m.base}` }
  const r = await run(changelogPrompt(branch, m.base, m.entries, m.diffstat), CHANGELOG_TOKENS, 'changelog')
  return r.error ? { error: r.error } : { changelog: r.text, base: m.base, commits: m.entries.length }
}

/**
 * The composer proposes; nothing here writes. The renderer stages and commits
 * one group at a time through the calls it already has, so the plan is
 * reviewed — and editable — before any of it becomes history.
 */
export async function proposeCommitSplit(raw: Raw, run: Run):
Promise<SplitProposal & { error?: string }> {
  const empty = { groups: [], unassigned: [], invented: [] }
  const m = await workingMaterial(raw)
  if (!m.files.length) return { ...empty, error: 'Nothing uncommitted to split' }
  if (m.files.length === 1) return { ...empty, error: 'One file is already one commit' }
  const diff = [m.staged, m.unstaged].filter(d => d.trim()).join('\n')
  const r = await run(splitPrompt(m.files, m.diffstat, diff), SPLIT_TOKENS, 'compose')
  if (r.error) return { ...empty, error: r.error }
  const proposal = parseSplit(r.text ?? '', m.files)
  if (!proposal.groups.length) return { ...proposal, error: 'The model proposed no usable commit' }
  return proposal
}
