// ai:* and changelog:* — the AI features.
import { ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { providerById, providerCredential, authHeaders } from '../../renderer/src/utils/aiProviders'
import { SECRET_MASK, maskSecrets, resolveSecretWrite } from '../settings-secrets'
import { commitMessagePrompt, rewordCommitPrompt, explainCommitPrompt, pullRequestPrompt, parsePullRequest, truncateDiff } from '../ai-prompts'
import { explainBranch, explainStash, explainWorking, generateChangelog, proposeCommitSplit, changelogState, changelogList, noteList, insertedIn, withInserted, scopeHasChanges, type NoteRecord } from '../ai-features'
import { resolveBase } from '../ai-material'
import { findChangelogs, isMergedInto, mergeIntoChangelog } from '../changelog-file'
import fs from 'fs'
import path from 'path'
import { readFileSync, writeFileSync } from 'fs'
import { state } from '../app-state'
import { readSettings, writeSettings } from '../settings-store'
import { runAIPrompt, diffOptsFor, AI_CONFLICT_MAX_CHARS, explCachePath, readExplCache, saveExplanation, rawGit, runFeature, noteStore, changelogStore } from '../ai-runtime'



export function registerAiHandlers(): void {
  ipcMain.handle('ai:get-api-key', () => {
    return { key: maskSecrets(readSettings()).groqApiKey ?? '' }
  })

  ipcMain.handle('ai:set-api-key', (_event, key: string) => {
    const s = readSettings()
    const resolved = resolveSecretWrite(s, 'groqApiKey', key)
    if (resolved !== null) { s.groqApiKey = resolved; writeSettings(s) }
    return { success: true }
  })

  ipcMain.handle('ai:list-models', async () => {
    const apiKey = readSettings().geminiApiKey
    if (!apiKey) return { error: 'NO_API_KEY' }
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      const data = await res.json() as any
      return { models: (data.models ?? []).map((m: any) => m.name) }
    } catch (e: any) { return { error: e.message } }
  })

  ipcMain.handle('ai:list-provider-models', async (_event, provider: string, apiKey: string, baseUrl?: string) => {
    // The settings page holds a mask for a key it never saw; the stored one
    // answers for it here.
    if (apiKey === SECRET_MASK) {
      const s = readSettings()
      const def = providerById(s, provider)
      apiKey = def ? providerCredential(s, def) : ''
    }
    // Everything that is not Anthropic or Google is the OpenAI dialect: one
    // GET {base}/models serves the catalog's clouds, the customs, and the
    // keyless local runtimes (#169). `baseUrl` arrives from the settings page
    // for entries not saved yet; otherwise the catalog/customs know it.
    const generic = async (base: string, def?: ReturnType<typeof providerById>) => {
      // The def's quirks apply when we have it; an entry not saved yet probes
      // with plain Bearer — save first for a gateway that wants otherwise.
      const headers = authHeaders({ apiKey, authHeader: def?.authHeader, extraHeaders: def?.extraHeaders })
      const res = await fetch(`${base.replace(/\/+$/, '')}/models`, { headers })
      const data = await res.json().catch(() => ({})) as any
      if (!res.ok || data.error) return { error: data.error?.message ?? `HTTP ${res.status}` }
      const list: any[] = Array.isArray(data) ? data : (data.data ?? data.models ?? [])
      const ids = list.map((m: any) => (m.id ?? m.name) as string).filter(Boolean)
      return { models: (provider === 'groq'
        ? ids.filter((id: string) => !id.startsWith('whisper') && !id.startsWith('distil-whisper'))
        : ids).sort() }
    }
    if (provider !== 'anthropic' && provider !== 'google') {
      const def = providerById(readSettings(), provider)
      const base = baseUrl || def?.baseUrl
      if (base && (apiKey || def?.custom)) {
        try { return await generic(base, def) } catch (e: any) { return { error: e.message } }
      }
    }
    if (!apiKey) return { error: 'NO_API_KEY' }
    try {
      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
        })
        const data = await res.json() as any
        if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
        return { models: (data.data ?? []).map((m: any) => m.id as string).sort() }
      }
      if (provider === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
        const data = await res.json() as any
        if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
        const ids = (data.models ?? [])
          .map((m: any) => (m.name as string).replace('models/', ''))
          .filter((id: string) => id.startsWith('gemini'))
          .sort()
        return { models: ids }
      }
      if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        const data = await res.json() as any
        console.log('[groq models] status:', res.status, 'keys:', Object.keys(data))
        if (!res.ok || data.error) return { error: data.error?.message ?? `HTTP ${res.status}` }
        const list: any[] = Array.isArray(data) ? data : (data.data ?? data.models ?? [])
        console.log('[groq models] count:', list.length, 'sample:', list.slice(0, 3).map((m: any) => m.id))
        const ids = list
          .map((m: any) => (m.id ?? m.name) as string)
          .filter((id: string) => {
            if (!id) return false
            // exclure uniquement les modèles audio/transcription
            if (id.startsWith('whisper') || id.startsWith('distil-whisper')) return false
            return true
          })
          .sort()
        return { models: ids }
      }
      if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` }
        })
        const data = await res.json() as any
        if (data.error) return { error: data.error.message ?? JSON.stringify(data.error) }
        const ids = (data.data ?? [])
          .map((m: any) => m.id as string)
          .filter((id: string) => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
          .sort()
        return { models: ids }
      }
      return { error: 'Provider inconnu' }
    } catch (e: any) { return { error: e.message } }
  })

  ipcMain.handle('ai:generate-commit-message', async () => {
    if (!state.gitService) { console.log('[ai] no state.gitService'); return { error: 'No repository open' } }
    let stagedDiff = ''
    try {
      const git = (state.gitService as any).git
      stagedDiff = await git.raw(['diff', '--cached'])
    } catch { return { error: 'Failed to get the diff' } }
    if (!stagedDiff.trim()) { console.log('[ai] no staged diff'); return { error: 'No staged changes to analyze' } }

    const r = await runAIPrompt(commitMessagePrompt(stagedDiff, diffOptsFor('commit')), 'commit')
    return r.error ? { error: r.error } : { message: r.text }
  })

  /**
   * A saved filter, described in words (#150).
   *
   * The completion in the drawer helps someone who knows the vocabulary is
   * there. It does nothing for someone who knows what they want and not how
   * GitHub spells it — "the ones waiting on my review that nobody has touched
   * in a fortnight" is one sentence and four qualifiers.
   *
   * ⚠️ The vocabulary is HANDED to the model rather than assumed: the two
   * sections do not share one (`review:` is a pull request's, `milestone:` an
   * issue's), and a model left to guess writes GitHub's web search syntax, which
   * is close enough to look right and wrong enough to be refused.
   *
   * The answer is not trusted either — see the renderer, which runs it through
   * the same validator a typed query goes through before it is put in the field.
   * This is the rare AI action whose output can be checked before anyone sees
   * it, and not checking it would be a decision.
   */

  ipcMain.handle('ai:filter-query', async (_e, kind: 'prs' | 'issues', described: string, vocabulary: string) => {
    if (!described.trim()) return { error: 'nothing to describe' }
    const what = kind === 'prs' ? 'pull requests' : 'issues'
    const prompt = [
      `You write GitHub search queries that filter ${what}.`,
      `ONLY these qualifiers exist. Using any other is an error:`,
      vocabulary,
      // Measured against the configured model: without these three the answers
      // are valid and wrong. "head contains fix or feat" came back as
      // `head:fix head:feat`, which ANDs and therefore matches nothing, and
      // "pull requests I wrote" lost its author entirely for want of @me.
      `Every term is combined with AND. There is no OR and no wildcard: the same qualifier given twice matches nothing.`,
      `base: and head: match a branch name by PREFIX, case-insensitively.`,
      `@me stands for the signed-in user wherever a user_name is taken.`,
      `Rules: reply with the query and nothing else — no prose, no quotes, no backticks.`,
      `Use only the qualifiers listed. Bare words are allowed as free text.`,
      `If the request cannot be expressed exactly, reply with the closest single query that can.`,
      ``,
      `Request: ${described.trim()}`,
    ].join('\n')
    const r = await runAIPrompt(prompt, 'filter')
    if (r.error) return { error: r.error }
    // Models like to wrap an answer in prose or fences however firmly they are
    // told not to. The first non-empty line, stripped of them, is the query.
    const query = (r.text ?? '')
      .replace(/```[a-z]*/gi, '')
      .split('\n').map(l => l.trim()).filter(Boolean)[0] ?? ''
    return query ? { query: query.replace(/^["'`]|["'`]$/g, '') } : { error: 'empty answer' }
  })

  /**
   * The composer's title and description, generated together (#130).
   *
   * A commit message summarises one staged diff; a request summarises
   * `base..head` — N subjects AND their cumulative diff, and a branch of thirty
   * commits is the normal case, not the edge one. What goes in, decided: the
   * subjects always (they are the authors' own summary, and they are small),
   * the diffstat always (breadth survives even when depth cannot), and as much
   * of the three-dot diff as fits. When it does not fit, the prompt SAYS so —
   * a model reading a silently cut diff describes half a branch with full
   * confidence.
   *
   * One call for both fields: they are one answer about one branch, and two
   * calls would let them disagree.
   */
  ipcMain.handle('ai:generate-pr-description', async (_e, baseName: string, headName: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    const git = (state.gitService as any).git
    // The caller speaks in short branch names. The base is compared as the
    // REMOTE holds it when possible — that is what the request will land on —
    // and the head as the LOCAL repo does, since the local tip is what gets
    // pushed. A branch on a remote that is not `origin` falls through to its
    // bare name, which git still resolves for anything local.
    const resolveRef = async (name: string, preferLocal: boolean): Promise<string> => {
      const candidates = preferLocal
        ? [`refs/heads/${name}`, `refs/remotes/origin/${name}`]
        : [`refs/remotes/origin/${name}`, `refs/heads/${name}`]
      for (const c of candidates) {
        try { await git.raw(['rev-parse', '--verify', '--quiet', c]); return c } catch { /* next */ }
      }
      return name
    }
    try {
      const base = await resolveRef(baseName, false)
      const head = await resolveRef(headName, true)
      const subjects = (await git.raw(['log', '--format=%s', `${base}..${head}`]) as string)
        .split('\n').map((s: string) => s.trim()).filter(Boolean)
      if (subjects.length === 0) return { error: `No commits between ${baseName} and ${headName}` }
      const diffstat = await git.raw(['diff', '--stat', `${base}...${head}`]) as string
      const diff = await git.raw(['diff', `${base}...${head}`]) as string

      const prompt = pullRequestPrompt(baseName, headName, subjects, diffstat, diff, diffOptsFor('pr'))
      const r = await runAIPrompt(prompt, 'pr')
      if (r.error) return { error: r.error }
      const parsed = parsePullRequest(r.text ?? '')
      return parsed ?? { error: 'empty answer' }
    } catch (e: any) { return { error: e.message } }
  })

  /**
   * An issue from a sentence (#95's sibling surface). The brief is the only
   * material — there is no diff to read: the model turns "the graph loses the
   * selection after a rebase" into a title and a body someone else can act on.
   * One call for both fields, like the PR description: they are one answer.
   */

  ipcMain.handle('ai:generate-issue', async (_e, described: string) => {
    if (!described.trim()) return { error: 'nothing to describe' }
    const prompt = [
      `You write GitHub issues from a maintainer's note — anything from a few words to a full draft. Keep what is right, tighten what is not, and structure it.`,
      `First line of your reply: the title — specific, at most 72 characters, no trailing period.`,
      `Then a blank line, then the body in Markdown: a short paragraph of context saying what is wrong or wanted and why it matters, then a bullet list of what done looks like. Only state what the note supports — never invent reproduction steps, versions or numbers it does not contain.`,
      `Write in English, whatever language the note is in. Reply with nothing but the title and the body.`,
      ``,
      `Note: ${described.trim()}`,
    ].join('\n')
    const r = await runAIPrompt(prompt, 'issue')
    if (r.error) return { error: r.error }
    const lines = (r.text ?? '').replace(/```[a-z]*/gi, '').split('\n')
    const at = lines.findIndex(l => l.trim())
    if (at < 0) return { error: 'empty answer' }
    const title = lines[at].trim().replace(/^["'#*\s]+|["'*\s]+$/g, '')
    const body = lines.slice(at + 1).join('\n').trim()
    return { title, body }
  })

  // Recompose: regenerate an EXISTING commit's message from its actual diff.
  // The renderer applies the result through the normal amend/reword flow, so
  // the user always reviews the proposal before anything is rewritten.
  ipcMain.handle('ai:recompose-commit', async (_e, hash: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    let diff = ''
    let currentMsg = ''
    try {
      const git = (state.gitService as any).git
      diff = await git.raw(['diff-tree', '--no-commit-id', '-p', '--root', hash])
      currentMsg = (await git.raw(['log', '-1', '--pretty=format:%B', hash])).trim()
    } catch { return { error: 'Failed to get the commit diff' } }
    if (!diff.trim()) return { error: 'This commit has no changes to analyze (merge commit?)' }

    const prompt = rewordCommitPrompt(diff, currentMsg, diffOptsFor('commit'))
    const r = await runAIPrompt(prompt, 'commit')
    return r.error ? { error: r.error } : { message: r.text }
  })

  ipcMain.handle('ai:resolve-conflict', async (_e, filepath: string, instruction?: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    const fileRes = await state.gitService.getFileContent(filepath)
    if (fileRes.error) return { error: fileRes.error }
    const content = fileRes.content ?? ''
    if (!/^<{7}/m.test(content)) return { error: 'No conflict markers found in this file' }
    if (content.length > AI_CONFLICT_MAX_CHARS) {
      return { error: `File too long for AI resolution (${content.length} characters, max ${AI_CONFLICT_MAX_CHARS})` }
    }

    const extra = instruction?.trim()
      ? `\n\nUser guidance (follow it when choosing between sides): ${instruction.trim()}`
      : ''
    const prompt = `You are a Git merge expert. This file contains merge conflict markers (<<<<<<<, =======, >>>>>>>, and possibly ||||||| base sections). Resolve every conflict by producing the correct merged file: keep the intent of BOTH sides when they are compatible, otherwise pick the side that keeps the file consistent.${extra}

  CRITICAL formatting rules:
  - Copy the chosen lines EXACTLY as they appear: preserve every space, tab, indentation, trailing whitespace and blank line. Never reformat, re-indent, trim or normalize anything outside the conflicted regions — and inside them, reproduce the chosen side's lines byte-for-byte.
  - No conflict markers, no code fences, no commentary inside the file.

  Reply in EXACTLY this format:
  EXPLANATION: <1 to 3 sentences in English explaining which sides you chose and why>
  ===FILE===
  <the complete resolved file content, every line>

  File (${filepath}):
  ${content}`
    const r = await runAIPrompt(prompt, 'conflict')
    if (r.error) return { error: r.error }
    const raw = r.text ?? ''
    // Split explanation from file on the ===FILE=== marker; if the model
    // ignored the format, treat the whole reply as the file.
    let explanation = ''
    let resolution = raw
    const markerIdx = raw.indexOf('===FILE===')
    if (markerIdx !== -1) {
      explanation = raw.slice(0, markerIdx).replace(/^EXPLANATION:\s*/i, '').trim()
      resolution = raw.slice(markerIdx + '===FILE==='.length).replace(/^\n/, '')
    }
    // Some models still wrap output in fences despite instructions — strip them.
    const fenced = resolution.match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```\s*$/)
    if (fenced) resolution = fenced[1]
    if (/^[<=>]{7}/m.test(resolution)) return { error: "The AI proposal still contains conflict markers — try again, possibly with a more precise instruction" }
    return { resolution, explanation }
  })

  // Natural-language commit search: sends a compact one-line-per-commit index
  // (hash, author, date, subject) and asks the model which commits match the
  // user's free-form query. Returns { hashes } of full hashes.
  ipcMain.handle('ai:search-commits', async (_e, query: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    if (!query?.trim()) return { hashes: [] }
    let index = ''
    try {
      const git = (state.gitService as any).git
      // Short hashes + truncated subjects keep the index small: free-tier
      // providers cap tokens/minute and reject large prompts outright (the
      // 300-commit/24k-chars first version did exactly that).
      index = await git.raw(['log', '--all', '--max-count=200', '--date=short', '--pretty=format:%h|%an|%ad|%s'])
      index = index.split('\n').map(l => l.length > 90 ? l.slice(0, 90) : l).join('\n')
    } catch { return { error: 'Could not read the history' } }
    if (!index.trim()) return { hashes: [] }

    const today = new Date().toISOString().slice(0, 10)
    const prompt = `You are a Git history search engine. Today is ${today}. Below is a commit index, one commit per line: hash|author|date|subject.\n\nUser query (may be French or English, may reference dates, authors, file kinds, change intent): "${query.trim()}"\n\nReply with ONLY the hashes of matching commits, one per line, best matches first, at most 50. If nothing matches, reply with exactly NONE.\n\nIndex:\n${truncateDiff(index, 12000)}`
    const r = await runAIPrompt(prompt, 'search')
    if (r.error) return { error: r.error }
    const text = (r.text ?? '').trim()
    if (!text || text === 'NONE') return { hashes: [] }
    const short = [...text.matchAll(/\b[0-9a-f]{7,40}\b/g)].map(m => m[0])
    if (short.length === 0) return { hashes: [] }
    // Expand the short hashes the model echoed back to full ones so the graph
    // can match them against CommitNode.hash.
    try {
      const git = (state.gitService as any).git
      const full = await git.raw(['rev-parse', ...short.slice(0, 50)])
      return { hashes: full.trim().split('\n').filter((h: string) => /^[0-9a-f]{40}$/.test(h)) }
    } catch {
      // Some hash didn't resolve (hallucinated) — resolve one by one, drop bad ones.
      const git = (state.gitService as any).git
      const hashes: string[] = []
      for (const s of short.slice(0, 50)) {
        try {
          const h = (await git.raw(['rev-parse', s])).trim()
          if (/^[0-9a-f]{40}$/.test(h)) hashes.push(h)
        } catch { /* hallucinated hash — skip */ }
      }
      return { hashes }
    }
  })

  ipcMain.handle('ai:get-explanations', () => {
    if (!state.gitService) return { explanations: {} }
    return { explanations: readExplCache()[state.gitService.repoPath] ?? {} }
  })

  ipcMain.handle('ai:explain-commit', async (_e, hash: string, force = false, guidance?: string) => {
    if (!state.gitService) return { error: 'No repository open' }
    // A guided explanation is an answer to a different question: it neither
    // reads nor writes the cache, or an unguided request would later be served
    // someone else's focus.
    if (!force && !guidance?.trim()) {
      const cached = readExplCache()[state.gitService.repoPath]?.[hash]
      if (cached) return { explanation: cached, cached: true }
    }
    let diff = ''
    let currentMsg = ''
    try {
      const git = (state.gitService as any).git
      diff = await git.raw(['diff-tree', '--no-commit-id', '-p', '--root', hash])
      currentMsg = (await git.raw(['log', '-1', '--pretty=format:%s', hash])).trim()
    } catch { return { error: 'Failed to get the commit diff' } }
    if (!diff.trim()) return { error: 'This commit has no changes to analyze (merge commit?)' }

    const prompt = explainCommitPrompt(diff, currentMsg, guidance, diffOptsFor('explain'))
    const r = await runAIPrompt(prompt, 'explain')
    if (r.error) return { error: r.error }
    if (!guidance?.trim()) saveExplanation(state.gitService.repoPath, hash, r.text ?? '')
    return { explanation: r.text }
  })

  ipcMain.handle('ai:note-list', async () =>
    state.gitService ? noteList(rawGit(), noteStore(state.gitService.repoPath)) : { entries: [] })

  ipcMain.handle('ai:forget-note', async (_e, kind: NoteRecord['kind'], key: string) => {
    if (!state.gitService) return { success: false }
    await noteStore(state.gitService.repoPath).forget(kind, key)
    return { success: true }
  })

  /** A commit explanation can be dropped too — same gesture, older store. */
  ipcMain.handle('ai:forget-explanation', async (_e, hash: string) => {
    if (!state.gitService) return { success: false }
    const cache = readExplCache()
    if (cache[state.gitService.repoPath]?.[hash]) {
      delete cache[state.gitService.repoPath][hash]
      try { fs.writeFileSync(explCachePath(), JSON.stringify(cache)) } catch { /* best-effort */ }
    }
    return { success: true }
  })

  /** How much of a diff a feature shows, as this user has set it (#185). */

  ipcMain.handle('ai:explain-branch', async (_e, branch: string, guidance?: string) =>
    state.gitService
      ? explainBranch(rawGit(), runFeature, branch,
          { guidance, store: noteStore(state.gitService.repoPath), diff: diffOptsFor('explain') })
      : { error: 'No repository open' })

  ipcMain.handle('ai:explain-stash', async (_e, index: number | string, guidance?: string) =>
    state.gitService
      ? explainStash(rawGit(), runFeature, index,
          { guidance, store: noteStore(state.gitService.repoPath), diff: diffOptsFor('explain') })
      : { error: 'No repository open' })

  ipcMain.handle('ai:explain-working', async (_e, guidance?: string) =>
    state.gitService
      ? explainWorking(rawGit(), runFeature,
          { guidance, store: noteStore(state.gitService.repoPath), diff: diffOptsFor('explain') })
      : { error: 'No repository open' })

  ipcMain.handle('ai:changelog-list', async () =>
    state.gitService
      ? changelogList(rawGit(), changelogStore(state.gitService.repoPath))
      : { entries: [] })

  ipcMain.handle('ai:forget-changelog', async (_e, branch: string) => {
    if (!state.gitService) return { success: false }
    await changelogStore(state.gitService.repoPath).forget(branch)
    return { success: true }
  })

  ipcMain.handle('ai:changelog-state', async (_e, branch: string, scope?: string) =>
    state.gitService
      ? changelogState(rawGit(), changelogStore(state.gitService.repoPath), branch, scope)
      : { error: 'No repository open' })

  ipcMain.handle('ai:generate-changelog', async (_e, branch: string, base?: string, previous?: string, scope?: string) =>
    state.gitService
      ? generateChangelog(rawGit(), runFeature, branch, base,
          { previous, scope, store: changelogStore(state.gitService.repoPath) })
      : { error: 'No repository open' })

  /**
   * How this repository keeps its changelogs, as this repository says it.
   *
   * A preference, not a setting page: it is asked once, in the preview, where
   * it acts — and restated there every time with the alternative one click
   * away, so changing your mind never means finding a page. It lives beside
   * `gitvertex.defaultRemote` in the repository's own git config, which is
   * where a per-repository answer belongs and where anyone can read it back.
   */
  ipcMain.handle('changelog:get-scope-pref', async () => {
    if (!state.gitService) return { pref: null }
    try {
      const v = (await rawGit()(['config', '--local', '--get', 'gitvertex.changelogScope'])).trim()
      return { pref: v === 'package' || v === 'branch' ? v : null }
    } catch { return { pref: null } }
  })

  ipcMain.handle('changelog:set-scope-pref', async (_e, pref: 'package' | 'branch') => {
    if (!state.gitService) return { success: false }
    try {
      await rawGit()(['config', '--local', 'gitvertex.changelogScope', pref])
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  /**
   * Put the entry where changelogs live — the last step of the work, and the
   * one that was still being done by hand. It only ever ADDS lines, and it
   * writes into the working tree, so the diff is right there in the staging
   * pane to be read or thrown away.
   */
  ipcMain.handle('changelog:insert', async (_e, entry: string, opts?: { branch?: string; file?: string; section?: string; force?: boolean; preview?: boolean }) => {
    if (!state.gitService) return { error: 'No repository open' }
    const raw = rawGit()

    // ── Two things it refuses to decide on its own ──
    // Which file, when the repository tracks several: a monorepo has one per
    // package, and writing into the first would put the desktop app's notes in
    // the CLI's changelog.
    const candidates = await findChangelogs(raw)
    let rel = opts?.file ?? candidates[0] ?? 'CHANGELOG.md'
    if (!opts?.file && candidates.length > 1) return { needsChoice: true, candidates }
    if (opts?.file && candidates.length && !candidates.includes(opts.file)) {
      return { error: `${opts.file} is not a changelog this repository tracks` }
    }

    // And whether it still makes sense at all. A changelog is KEPT now, so the
    // drawer can be reopened a fortnight after the branch was merged — or after
    // it was deleted — at which point these bullets are already in the file, and
    // inserting them adds a release's worth of duplicates to whatever branch is
    // checked out.
    if (!opts?.force && opts?.branch) {
      const alive = await raw(['rev-parse', '--verify', '--quiet', opts.branch]).catch(() => '')
      if (!alive.trim()) return { branchGone: true, branch: opts.branch, path: rel }
      const base = await resolveBase(raw, opts.branch)
      if (base && await isMergedInto(raw, opts.branch, base)) {
        return { alreadyMerged: true, branch: opts.branch, base, path: rel }
      }
    }

    const abs = join(state.gitService.repoPath, rel)
    let existing: string | null = null
    try { existing = fs.readFileSync(abs, 'utf-8') } catch { /* the file is new */ }
    // What a previous insert of THIS changelog put in THIS file — the answer to
    // regenerating, which rewords everything it wrote.
    const store = changelogStore(state.gitService.repoPath)
    const record = opts?.branch ? await store.get(opts.branch) : null
    const ours = insertedIn(record, rel)
    const merged = mergeIntoChangelog(existing, entry, ours, opts?.section)

    // This file keeps no section for unreleased work under any name it goes by.
    // Where the entry belongs is the reader's call, not a template's.
    if (merged.needsSection) {
      return {
        needsSection: true, path: rel,
        sections: merged.shape?.sections.map(h => h.text) ?? [],
      }
    }

    // Nothing is written until the reader has seen what would be. The file is
    // often not what it was when the changelog was generated — half of it may
    // already be in there in different words, and once the lines are in, no
    // amount of reading tells you which ones you just put there.
    if (opts?.preview) {
      let dirty = false
      try { dirty = !!(await raw(['status', '--porcelain', '--', rel])).trim() } catch { /* not fatal */ }
      // Which package this changelog is about, and whether the branch has
      // anything to say about it. A changelog at the root is about everything.
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
      const dirTouched = opts?.branch ? await scopeHasChanges(raw, opts.branch, dir) : true
      return {
        preview: true, path: rel, dirty, dir, dirTouched,
        added: merged.added, addedLines: merged.addedLines,
        skipped: merged.skipped, similar: merged.similar, existing: merged.existing,
        // An ARRAY in the preview (the reader sees which lines), a COUNT after
        // the write (the toast says how many). Same word, two shapes, and the
        // caller checks which by asking whether it is an array.
        removed: merged.removed, missing: merged.missing,
        created: merged.created, sectionCreated: merged.sectionCreated,
      }
    }

    if (!merged.added && !merged.removed.length && !merged.created) {
      return { path: rel, added: 0, created: false }
    }
    try {
      fs.writeFileSync(abs, merged.content)
    } catch (e: any) {
      return { error: e.message }
    }
    // Remember what is ours in there, so regenerating can take it back out.
    if (record && opts?.branch) {
      await store.set(opts.branch, withInserted(record, rel, merged.ours))
    }
    return {
      path: rel, added: merged.added, removed: merged.removed.length,
      created: merged.created, sectionCreated: merged.sectionCreated,
    }
  })

  ipcMain.handle('ai:propose-commit-split', async () =>
    state.gitService ? proposeCommitSplit(rawGit(), runFeature, diffOptsFor('compose')) : { error: 'No repository open' })
}
