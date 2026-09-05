// ai-prompts.ts — what the model is asked, for the features #70 P1 adds, and
// how its answer is read back.
//
// Free of `electron` and of git on purpose (the theme-validate pattern): the
// desktop main process imports it, the extension's aiService imports it, and
// the unit suite exercises the parsing without spending an API call. The four
// prompts that already shipped live in two copies — one per product — and the
// two have drifted in wording more than once; these do not get to.
//
// Nothing here talks to a provider or reads a repository: prompts in,
// text out, answers parsed. Material comes from ai-material.ts.

import { renderDiff, type DiffDetail } from './ai-diff'

/**
 * The cut for text that is NOT a diff — a commit log, a search index, a
 * changelog. A diff goes through renderDiff instead, which cuts by file and
 * keeps the map whole (#185).
 */
export const truncateDiff = (diff: string, max = 6000): string =>
  diff.length > max ? diff.slice(0, max) + '\n... [diff truncated]' : diff

/** How much of a diff a prompt shows, and within what budget. */
export interface DiffOpts { detail?: DiffDetail; budget?: number }

/** The user's focus, appended in the shape aiExplainCommit established. */
const guided = (guidance?: string): string =>
  guidance?.trim() ? `\n\nUser guidance (what to focus the explanation on): ${guidance.trim()}` : ''

/**
 * Explain a branch — what it carries that the base does not.
 *
 * The subjects go with the diff because a branch is a story its commits tell
 * in order, and a squashed diff alone cannot say which change came as a fix
 * for which other. The diffstat goes because the diff is cut and the stat is
 * not: it is how the answer can say "and 40 more files" honestly.
 */
export function explainBranchPrompt(
  branch: string, base: string, subjects: string[], diffstat: string, diff: string,
  guidance?: string, diffOpts: DiffOpts = {},
): string {
  const log = subjects.length
    ? subjects.map(s => `- ${s}`).join('\n')
    : '(no commit of its own — the branch is level with the base)'
  return `You are a Git expert. Explain in English, simply and concretely, what the branch \`${branch}\` carries that \`${base}\` does not: which behaviours change, and what the branch is evidently for. 4 to 8 sentences maximum, no bullet list, no preamble.${guided(guidance)}

Commits on the branch, newest last:
${log}

Files touched:
${truncateDiff(diffstat, 2000)}

Combined diff:
\`\`\`diff
${renderDiff(diff, diffOpts)}
\`\`\``
}

/**
 * Explain a stash. Its message is a label the user wrote in a hurry ("WIP on
 * main"), so it is handed over as a hint and explicitly not trusted — the
 * whole point of the feature is the stash whose label says nothing.
 */
export function explainStashPrompt(
  label: string, diff: string, guidance?: string, diffOpts: DiffOpts = {},
): string {
  return `You are a Git expert. Explain in English, simply and concretely, what work is parked in this stash: which files and behaviours it changes, and what it was evidently in the middle of. 3 to 6 sentences maximum, no bullet list, no preamble.${guided(guidance)}

The stash's own label (written in passing — treat it as a hint, not as truth): ${label || '(none)'}

Diff:
\`\`\`diff
${renderDiff(diff, diffOpts)}
\`\`\``
}

/**
 * Explain the working tree. Staged and unstaged arrive separately, because
 * the split is itself information: what is staged is what the user has
 * already decided belongs to the next commit.
 */
export function explainWorkingPrompt(
  staged: string, unstaged: string, diffstat: string, guidance?: string, diffOpts: DiffOpts = {},
): string {
  // Half the budget each: the two halves are one change, and giving the whole
  // budget to whichever comes first is the prefix cut wearing another hat.
  const half = { ...diffOpts, budget: Math.floor((diffOpts.budget ?? 8000) / 2) }
  const section = (title: string, diff: string): string =>
    diff.trim() ? `\n\n${title}:\n\`\`\`diff\n${renderDiff(diff, half)}\n\`\`\`` : ''
  return `You are a Git expert. Explain in English, simply and concretely, what the uncommitted work in this repository does: which files and behaviours change, and what it is evidently in the middle of. Where staged and unstaged changes tell different stories, say so. 3 to 6 sentences maximum, no bullet list, no preamble.${guided(guidance)}

Files touched:
${truncateDiff(diffstat, 2000)}${section('Staged changes', staged)}${section('Unstaged changes', unstaged)}`
}

/**
 * A changelog for what a branch adds over its base.
 *
 * Written to the shape this repository's own CHANGELOG.md uses — `###`
 * sections under Keep a Changelog's headings — because a changelog that has
 * to be reformatted before it can be pasted has not saved anyone anything.
 * Empty sections are forbidden rather than tolerated: a model given five
 * headings will fill five headings.
 */
export function changelogPrompt(
  branch: string, base: string, entries: string[], diffstat: string, previous?: string,
): string {
  const log = entries.length ? entries.join('\n\n') : '(no commit)'
  // Extending rather than rewriting: the branch grew, and a changelog whose
  // existing lines are reworded on every new commit is one nobody can review
  // twice. The earlier text is the starting point, not a suggestion.
  const carry = previous?.trim() ? `

You have already written the changelog below for the EARLIER commits of this branch. Extend it to cover the whole list: keep its existing bullets word for word, edit one only where a later commit made it wrong, and add bullets for what is new — under the headings they belong to, creating a heading only if it has something under it.

The changelog so far:
${truncateDiff(previous.trim(), 4000)}` : ''

  return `You are a release engineer. Write the changelog entry for what \`${branch}\` adds over \`${base}\`, in English, as Markdown.${carry}

Rules:
- Group under \`### Added\`, \`### Changed\`, \`### Fixed\`, \`### Removed\` — ONLY the headings that have something under them. Never emit an empty section.
- One bullet per user-visible change, written for someone who uses the product and has not read the diff. Merge commits that are one change into one bullet; drop commits that change nothing a user could notice (formatting, lockfiles, internal renames) unless nothing else is left.
- No preamble, no closing note, no version heading, no code fences around the whole answer.

Commits, newest last (subject then body):
${truncateDiff(log, 8000)}

Files touched:
${truncateDiff(diffstat, 2000)}`
}

// ── The four that shipped before this module existed ────────────────────────
//
// They lived in a copy per product — `src/main/index.ts` and
// `vscode-extension/src/aiService.ts` — and the copies had already drifted:
// the desktop asked about "files/behaviors" with "no bullet lists", the
// extension about "files and behaviours" with "no bullet list", and their
// refusals spelled analyse both ways. Two products, two answers to the same
// question, for no reason anybody chose. #185 P2.

/** A commit message for what is staged. */
export function commitMessagePrompt(diff: string, diffOpts: DiffOpts = {}): string {
  return `You are a Git expert. Analyze this diff and generate a concise commit message following Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). Reply ONLY with the commit message in English.

Diff:
\`\`\`diff
${renderDiff(diff, diffOpts)}
\`\`\``
}

/**
 * A commit's message, rewritten from what it actually changed.
 *
 * The current message is handed over labelled as unreliable — the whole point
 * of the feature is the commit whose message is "wip" or is about the change
 * the author meant to make.
 */
export function rewordCommitPrompt(
  diff: string, currentMsg: string, diffOpts: DiffOpts = {},
): string {
  return `You are a Git expert. Rewrite this commit's message based on what the diff ACTUALLY changes. Follow Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf). First line: type(scope): description (max 72 chars). If the change warrants it, add a short body (1-3 lines) after a blank line explaining the why. Reply ONLY with the commit message in English — no preamble, no code fences.

Current message (may be inaccurate or vague):
${currentMsg}

Diff:
\`\`\`diff
${renderDiff(diff, diffOpts)}
\`\`\``
}

/** Explain one commit. The sibling of explainBranchPrompt, older by a year. */
export function explainCommitPrompt(
  diff: string, subject: string, guidance?: string, diffOpts: DiffOpts = {},
): string {
  return `You are a Git expert. Explain in English, simply and concretely, what this commit does: which files and behaviours change, and why it was probably done. 3 to 6 sentences maximum, no bullet list, no preamble.${guided(guidance)}

Commit message: ${subject}

Diff:
\`\`\`diff
${renderDiff(diff, diffOpts)}
\`\`\``
}

/** How many subjects a pull request description is given before they are cut. */
export const PR_SUBJECTS_MAX = 50
/** A description reads a whole branch, so it gets twice a commit's budget. */
export const PR_DIFF_BUDGET = 12000

/** A pull request's title and description, from the branch's own evidence. */
export function pullRequestPrompt(
  baseName: string, headName: string, subjects: string[], diffstat: string, diff: string,
  diffOpts: DiffOpts = {},
): string {
  const listed = subjects.slice(0, PR_SUBJECTS_MAX)
  const omitted = subjects.length - listed.length
  return [
    `You write pull request titles and descriptions for a Git branch.`,
    `First line of your reply: the title — imperative, specific, at most 72 characters.`,
    `Then a blank line, then the description in Markdown: one short paragraph saying what the branch does and why, then a bullet list of the notable changes. No heading that restates the title, no preamble, no code fences around the reply.`,
    `Write in English. Reply with nothing but the title and the description.`,
    ``,
    `Branch: ${headName} into ${baseName}`,
    `Commit subjects (${subjects.length}):`,
    listed.map(s => `- ${s}`).join('\n') + (omitted > 0 ? `\n- … and ${omitted} more` : ''),
    ``,
    `Diffstat:`,
    truncateDiff(diffstat, 3000),
    ``,
    // What used to stand here — "the full diff is too large to include; what
    // follows is its beginning" — became false the day the cut stopped being
    // a prefix (#185). renderDiff says what it withheld, per file, inside the
    // fence; a second claim about it from out here can only contradict that.
    `Diff:`,
    '```diff',
    renderDiff(diff, { budget: PR_DIFF_BUDGET, ...diffOpts }),
    '```',
  ].join('\n')
}

/**
 * A pull request answer, read back as a title and a body.
 *
 * The first non-empty line is the title, stripped of the decoration a model
 * adds when asked for one (quotes, a `#`, bold stars); the rest is the body.
 * Both products parsed this identically, in the same fifteen lines, twice.
 */
export function parsePullRequest(text: string): { title: string; body: string } | null {
  const lines = (text ?? '').replace(/```[a-z]*/gi, '').split('\n')
  const at = lines.findIndex(l => l.trim())
  if (at < 0) return null
  return {
    title: lines[at].trim().replace(/^["'#*\s]+|["'*\s]+$/g, ''),
    body: lines.slice(at + 1).join('\n').trim(),
  }
}

/** One commit a split proposes: a message and the files it takes. */
export interface SplitGroup { message: string; files: string[] }

/** What came back from a split, once measured against the real file list. */
export interface SplitProposal {
  groups: SplitGroup[]
  /** Real files the model placed nowhere — the UI has to offer them. */
  unassigned: string[]
  /** Paths the model invented, kept so the UI can say the answer was edited. */
  invented: string[]
}

/**
 * Cut the working tree into commits.
 *
 * File-level, not hunk-level, and that is a scope decision rather than a
 * shortcut: a hunk-level split needs a hunk-level review screen, which is what
 * #88 (`propose_split`) is for. A file that genuinely belongs to two commits
 * is the case this cannot serve, and the prompt says so rather than letting
 * the model invent a partial path.
 *
 * The format is the conflict resolver's, not JSON: a model that has to close
 * braces around code it also has to escape gets it wrong often enough to
 * matter, and this answer is parsed, not eval'd.
 */
export function splitPrompt(
  files: string[], diffstat: string, diff: string, diffOpts: DiffOpts = {},
): string {
  return `You are a Git expert. Below is the uncommitted work in a repository. Cut it into a sequence of small, atomic commits — each one a single self-contained change that would build and read on its own.

Rules:
- Every file goes in EXACTLY ONE commit. Use the paths below verbatim; never invent, shorten or complete a path.
- Order the commits so that each one makes sense applied after the previous (a refactor before what uses it, a fix before the test that proves it).
- Prefer few commits over many: two files that only make sense together belong together. If the work really is one change, answer with one commit.
- Each message follows Conventional Commits (feat/fix/docs/chore/refactor/style/test/perf); first line \`type(scope): description\` under 72 characters, in English. A body is optional, and earns its place only by saying why.
- A message describes the CHANGE and nothing else. Never restate these instructions in it — a body that begins "Files go in exactly one commit" is a leak of this prompt into the repository's history.

Reply in EXACTLY this format, and nothing else:

=== COMMIT ===
MESSAGE:
<the commit message, one or more lines>
FILES:
<one path per line>
=== COMMIT ===
MESSAGE:
...

Files (${files.length}):
${files.join('\n')}

Files touched:
${truncateDiff(diffstat, 2000)}

Diff:
\`\`\`diff
${renderDiff(diff, { budget: 12000, ...diffOpts })}
\`\`\``
}

/**
 * Read a split back, and make it true.
 *
 * The model's answer is a proposal about files that exist, so it is checked
 * against them rather than believed: an invented path is dropped (and
 * reported), a file placed twice belongs to the first commit that claimed it,
 * and anything left over comes back as `unassigned` — the UI shows those,
 * because silently dropping a file from a split loses work.
 */
export function parseSplit(text: string, knownFiles: string[]): SplitProposal {
  const known = new Set(knownFiles)
  const taken = new Set<string>()
  const invented: string[] = []
  const groups: SplitGroup[] = []

  for (const block of text.split(/^\s*={3,}\s*COMMIT\s*={3,}\s*$/mi).slice(1)) {
    const i = block.search(/^\s*FILES:\s*$/mi)
    if (i === -1) continue
    const message = block.slice(0, i).replace(/^\s*MESSAGE:\s*/i, '').trim()
    const files: string[] = []
    for (const raw of block.slice(i).split('\n').slice(1)) {
      const path = raw.trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, '')
      if (!path) continue
      if (!known.has(path)) { invented.push(path); continue }
      if (taken.has(path)) continue
      taken.add(path)
      files.push(path)
    }
    // A commit that lost every file it was given has nothing to apply. Its
    // message is not worth keeping either — it described those files.
    if (message && files.length) groups.push({ message, files })
  }

  return { groups, unassigned: knownFiles.filter(f => !taken.has(f)), invented }
}
