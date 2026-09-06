// What the model is asked and what it wrote: the drawer, the composer, the explanations, the changelogs, the proposals that arrive by deep link.
import { useState, useCallback } from 'react'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'

export function useAppAi(app: AppChrome & RepoSession & AppGithub & AppConflicts) {
  const { showConfirm, showChoice, t, showToast, loadRepoData } = app

  // AI natural-language search: explicit trigger (Enter / ✨), not per-keystroke.
  const [aiSearch, setAiSearch] = useState(false)
  const [aiSearchHashes, setAiSearchHashes] = useState<Set<string> | null>(null)
  const [aiSearchLoading, setAiSearchLoading] = useState(false)
  // Agent proposals arriving via deep link (MCP propose_commit / propose_rebase_plan):
  // preloaded into the staging form / rebase editor for the user to review —
  // nothing is staged, committed or rewritten until the user acts.
  const [commitProposal, setCommitProposal] = useState<{ message: string; files: string[] } | null>(null)
  /**
   * What the AI drawer is currently reading (#70 P1). One piece of state for
   * the four, because only one can be open: they all come out of the same
   * edge of the same panel, and two would be one on top of the other.
   */
  const [aiRead, setAiRead] = useState<
    | { kind: 'branch' | 'changelog'; ref: string; label: string }
    | { kind: 'stash'; index: number | string; label: string }
    | { kind: 'working' }
    | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  /**
   * Which stack the panel shows, and a token bumped whenever the model has
   * written something. Both live here rather than in the Sidebar because a
   * generation happens in a DRAWER: what it produces has to land in the list
   * and the list has to come into view, and neither can happen from inside
   * the panel that is not being looked at.
   */
  const [sidebarTab, setSidebarTab] = useState<'list' | 'ai'>(
    () => (localStorage.getItem('sb-tab') === 'ai' ? 'ai' : 'list'))
  const [memoryToken, setMemoryToken] = useState(0)
  /** Written: put it in the list, and put the list where it can be seen. */
  const rememberedAI = useCallback(() => {
    setMemoryToken(n => n + 1)
    setSidebarTab('ai')
  }, [])
  /**
   * Put a generated changelog in the repository's changelog — asking about
   * the two things the host refuses to decide on its own.
   *
   * Neither question is a formality. A monorepo has a changelog per package,
   * and writing into the first would file the desktop app's notes under the
   * CLI. And a changelog is KEPT now, so the drawer can be reopened a
   * fortnight after the branch was merged — at which point these bullets are
   * already in the file and inserting them adds a release's worth of
   * duplicates to whatever branch happens to be checked out.
   */
  const insertChangelogGuarded = useCallback(async (entry: string, branch: string) => {
    /** What will be written. A scoped answer replaces it before anything is. */
    let text = entry
    const call = (opts: { branch?: string; file?: string; section?: string; force?: boolean; preview?: boolean }) =>
      ((window.gitAPI as any).insertChangelog?.(text, opts)
        ?? Promise.resolve({ error: 'not-implemented' }))

    // Which file, whether it still makes sense, and — the one that costs the
    // most to get wrong — what exactly would land in it.
    let files: string[] = []
    let section: string | undefined
    let force = false

    let r = await call({ branch, preview: true })

    // Which file — and in a repository that ships several products, possibly
    // all of them: one change that touches the app and the extension belongs
    // in both changelogs, and that is not a case to make people repeat.
    if (r?.needsChoice) {
      const ALL = t('ai.changelog.everyFile', (r.candidates ?? []).length)
      const picked = await showChoice(t('ai.changelog.whichFile'), [...(r.candidates ?? []), ALL])
      if (!picked) return
      files = picked === ALL ? [...(r.candidates ?? [])] : [picked]
      r = await call({ branch, file: files[0], preview: true })
    }
    // This file keeps no section for unreleased work under any of the names
    // one goes by — it is not a Keep a Changelog file, and inventing a
    // section in it would be imposing a convention on someone who chose
    // another. Its own headings are the options, plus making a new one.
    if (r?.needsSection) {
      const NEW = t('ai.changelog.newSection')
      const picked = await showChoice(t('ai.changelog.whichSection', r.path), [NEW, ...(r.sections ?? [])])
      if (!picked) return
      section = picked === NEW ? '::create-a-new-section::' : picked
      r = await call({ branch, file: files[0], section, preview: true })
    }
    if (r?.branchGone || r?.alreadyMerged) {
      const ok = await showConfirm(
        r.branchGone
          ? t('ai.changelog.goneConfirm', r.branch)
          : t('ai.changelog.mergedConfirm', r.branch, r.base), true)
      if (!ok) return
      force = true
      r = await call({ branch, file: files[0] ?? r.path, section, force, preview: true })
    }
    if (r?.error) { showToast(r.error, 'err'); return }

    // ── What this changelog is about ──
    // A changelog in `cli/` describes the CLI. The branch may have touched
    // nothing there, in which case there is no entry to write and no
    // preference can make one true; or it may have touched both, in which
    // case whether the entry covers the branch or only that package is a
    // question about this repository — asked here, where it acts, and
    // restated every time with the alternative one click away.
    if (r?.preview && r.dir) {
      if (!r.dirTouched) {
        showToast(t('ai.changelog.nothingUnder', branch, r.dir), 'err')
        return
      }
      const WHOLE = t('ai.changelog.scopeBranch')
      const ONLY = t('ai.changelog.scopePackage', r.dir)
      const pref = (await ((window.gitAPI as any).changelogGetScopePref?.() ?? Promise.resolve({})))?.pref
      // Remembered, never silent: the preview says which reading it is using
      // and offers the other, so changing your mind is a click rather than a
      // page to find.
      const picked = await showChoice(
        t('ai.changelog.whichScope', r.dir),
        pref === 'package' ? [ONLY, WHOLE] : [WHOLE, ONLY])
      if (!picked) return
      const wants: 'package' | 'branch' = picked === ONLY ? 'package' : 'branch'
      if (wants !== pref) await ((window.gitAPI as any).changelogSetScopePref?.(wants))
      if (wants === 'package') {
        // A different entry, about a different thing — so it is generated,
        // and kept under its own name in the memory.
        showToast(t('ai.changelog.scoping', r.dir), 'ok')
        const g = await ((window.gitAPI as any).aiGenerateChangelog?.(branch, undefined, undefined, r.dir)
          ?? Promise.resolve({ error: 'not-implemented' }))
        if (g?.error || !g?.changelog) { showToast(g?.error ?? t('ai.answer.empty'), 'err'); return }
        text = g.changelog
        r = await call({ branch, file: files[0] ?? r.path, section, force, preview: true })
      }
    }

    // The preview. A changelog is written once and inserted later, into a file
    // that has moved on — half of it may already be there in different words,
    // and once the lines are in, nothing tells you which ones you just added.
    if (r?.preview) {
      const replaces = Array.isArray(r.removed) ? r.removed.length : 0
      if (!r.added && !replaces && !r.created) { showToast(t('ai.changelog.insertedNothing', r.path), 'ok'); return }
      const lines = [
        t('ai.changelog.previewHead', r.added ?? 0, r.path),
        '',
        ...(r.addedLines ?? []).map(l => `  ${l}`),
      ]
      // What a previous insert of this same changelog left in there and that
      // this one supersedes. Regenerating rewords everything, so this is the
      // difference between updating an entry and doubling it.
      if (Array.isArray(r.removed) && r.removed.length) {
        lines.push('', t('ai.changelog.previewReplaced', r.removed.length))
        for (const l of r.removed.slice(0, 4)) lines.push(`  ${l}`)
        if (r.removed.length > 4) lines.push('  …')
      }
      if (r.missing?.length) lines.push('', t('ai.changelog.previewMissing', r.missing.length))
      if (r.skipped?.length) lines.push('', t('ai.changelog.previewSkipped', r.skipped.length))
      // What the section already says, because the useful check is a
      // comparison and no similarity score can make it for you: two wordings
      // of one change can share almost no words.
      if (r.existing?.length) {
        lines.push('', t('ai.changelog.previewExisting', r.existing.length))
        for (const e of r.existing.slice(0, 4)) lines.push(`  ${e}`)
        if (r.existing.length > 4) lines.push(`  …`)
      }
      if (r.similar?.length) {
        lines.push('', t('ai.changelog.previewSimilar', r.similar.length))
        for (const sim of r.similar.slice(0, 3)) lines.push(`  ${sim.line}`, `  ↳ ${sim.existing}`)
      }
      if (r.dirty) lines.push('', t('ai.changelog.previewDirty', r.path))
      // Every other file gets its own preview under the same question: the
      // sections differ, and so does what each already says.
      for (const extra of files.slice(1)) {
        const p = await call({ branch, file: extra, section, force, preview: true })
        if (p?.error || !p?.preview) continue
        lines.push('', t('ai.changelog.previewHead', p.added ?? 0, p.path),
          ...(p.addedLines ?? []).map((l: string) => `  ${l}`))
      }
      const ok = await showConfirm(lines.join('\n'), !!(r.similar?.length || r.dirty))
      if (!ok) return
      const targets = files.length ? files : [r.path as string]
      let added = 0
      let replaced = 0
      for (const target of targets) {
        const w = await call({ branch, file: target, section, force })
        if (w?.error) { showToast(w.error, 'err'); return }
        added += w?.added ?? 0
        replaced += typeof w?.removed === 'number' ? w.removed : 0
        if (w?.created) showToast(t('ai.changelog.created', w.path), 'ok')
      }
      if (added || replaced) {
        showToast(replaced
          ? t('ai.changelog.insertedReplacing', added, replaced, targets.join(', '))
          : t('ai.changelog.inserted', added, targets.join(', ')), 'ok')
      } else showToast(t('ai.changelog.insertedNothing', targets.join(', ')), 'ok')
      loadRepoData()
      return
    }
    const replaced = typeof r?.removed === 'number' ? r.removed : 0
    if (r?.created) showToast(t('ai.changelog.created', r.path), 'ok')
    else if (!r?.added && !replaced) showToast(t('ai.changelog.insertedNothing', r.path), 'ok')
    else if (replaced) showToast(t('ai.changelog.insertedReplacing', r.added ?? 0, replaced, r.path), 'ok')
    else showToast(t('ai.changelog.inserted', r.added, r.path), 'ok')
    // The file is a working-tree change now; the panel has to see it.
    loadRepoData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChoice, showConfirm, showToast, t])

  return {
    aiSearch, setAiSearch, aiSearchHashes, setAiSearchHashes, aiSearchLoading, setAiSearchLoading, commitProposal, setCommitProposal, aiRead, setAiRead, composerOpen, setComposerOpen, sidebarTab, setSidebarTab, memoryToken, setMemoryToken, rememberedAI, insertChangelogGuarded,
  }
}

export type AppAi = ReturnType<typeof useAppAi>
