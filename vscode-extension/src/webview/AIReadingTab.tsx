import React, { useCallback } from 'react'
import { AIAnswerBody, type AIAnswerAction } from '../../../src/renderer/src/components/AIAnswer/AIAnswer'
import { CommitComposerBody } from '../../../src/renderer/src/components/CommitComposer/CommitComposer'
import { useLang } from '../../../src/renderer/src/i18n/LanguageContext'
import { timeAgo } from '../../../src/renderer/src/components/GitHubPanel/GithubRow'
import { useToast } from '../../../src/renderer/src/components/Toast/Toast'

/**
 * A model's reading, in an editor tab.
 *
 * The desktop reads these in a drawer beside the graph. This panel is
 * narrower than the answers' own paragraphs, so here they open the way the
 * extension opens everything else that needs room — the staging editor, the
 * rebase planner, a comparison. Same body, same calls, different frame.
 *
 * What it does NOT do is re-implement any of it: the closures below are the
 * ones App.tsx builds on the desktop, against the same `window.gitAPI`.
 */
export default function AIReadingTab({ kind, aiKey, label }: {
  kind: 'branch' | 'stash' | 'working' | 'changelog' | 'split'
  aiKey?: string
  label?: string
}) {
  const { t } = useLang()
  const toast = useToast()
  const showToast = useCallback((msg: string, type?: 'ok' | 'err') => {
    if (type === 'err') toast.error(msg); else toast.success(msg)
  }, [toast])

  const api = window.gitAPI as any

  // The composer is not a reading — it is a plan you edit — but it fills the
  // tab the same way. Its BODY, not the drawer: PanelDrawer renders nothing
  // without an anchor to measure, so the drawer here would have been a blank
  // tab rather than a visible failure.
  if (kind === 'split') {
    return (
      <div className="ai-tab ai-tab--full">
        <CommitComposerBody
          onClose={() => api.closeSelf?.()}
          onCommitted={() => {}}
          showToast={showToast}
        />
      </div>
    )
  }

  const insert: AIAnswerAction[] = [{
    label: t('ai.changelog.insert'),
    title: t('ai.changelog.insertTitle'),
    run: async (entry: string) => {
      let text = entry
      // The panel has no dialogs of its own, so the two questions and the
      // preview go through VS Code's own prompts — the host's uiPrompt /
      // uiConfirm, which every other panel decision already uses.
      const call = (opts: Record<string, unknown>) =>
        api.insertChangelog?.(text, opts) ?? Promise.resolve({ error: 'not-implemented' })
      let file: string | undefined
      let section: string | undefined
      let force = false
      let r = await call({ branch: aiKey, preview: true })

      if (r?.needsChoice) {
        const picked = await api.uiPick?.(t('ai.changelog.whichFile'), r.candidates ?? [])
        if (!picked) return
        file = picked
        r = await call({ branch: aiKey, file, preview: true })
      }
      if (r?.needsSection) {
        const NEW = t('ai.changelog.newSection')
        const picked = await api.uiPick?.(t('ai.changelog.whichSection', r.path), [NEW, ...(r.sections ?? [])])
        if (!picked) return
        section = picked === NEW ? '::create-a-new-section::' : picked
        r = await call({ branch: aiKey, file, section, preview: true })
      }
      // What this changelog is about — the same three the desktop applies,
      // through VS Code's own prompts.
      if (r?.preview && r.dir) {
        if (!r.dirTouched) { showToast(t('ai.changelog.nothingUnder', aiKey ?? '', r.dir), 'err'); return }
        const WHOLE = t('ai.changelog.scopeBranch')
        const ONLY = t('ai.changelog.scopePackage', r.dir)
        const pref = (await (api.changelogGetScopePref?.() ?? Promise.resolve({})))?.pref
        const picked = await api.uiPick?.(t('ai.changelog.whichScope', r.dir),
          pref === 'package' ? [ONLY, WHOLE] : [WHOLE, ONLY])
        if (!picked) return
        const wants = picked === ONLY ? 'package' : 'branch'
        if (wants !== pref) await api.changelogSetScopePref?.(wants)
        if (wants === 'package') {
          showToast(t('ai.changelog.scoping', r.dir), 'ok')
          const g = await (api.aiGenerateChangelog?.(aiKey, undefined, undefined, r.dir)
            ?? Promise.resolve({ error: 'not-implemented' }))
          if (g?.error || !g?.changelog) { showToast(g?.error ?? t('ai.answer.empty'), 'err'); return }
          text = g.changelog
          r = await call({ branch: aiKey, file: file ?? r.path, section, force, preview: true })
        }
      }
      if (r?.branchGone || r?.alreadyMerged) {
        const ok = await api.uiConfirm?.(r.branchGone
          ? t('ai.changelog.goneConfirm', r.branch)
          : t('ai.changelog.mergedConfirm', r.branch, r.base))
        if (!ok) return
        force = true
        r = await call({ branch: aiKey, file: file ?? r.path, section, force, preview: true })
      }
      if (r?.error) { showToast(r.error, 'err'); return }

      if (r?.preview) {
        const replaces = Array.isArray(r.removed) ? r.removed.length : 0
        if (!r.added && !replaces && !r.created) {
          showToast(t('ai.changelog.insertedNothing', r.path), 'ok'); return
        }
        const lines = [t('ai.changelog.previewHead', r.added ?? 0, r.path), '', ...(r.addedLines ?? [])]
        if (replaces) lines.push('', t('ai.changelog.previewReplaced', replaces))
        if (r.dirty) lines.push('', t('ai.changelog.previewDirty', r.path))
        const ok = await api.uiConfirm?.(lines.join('\n'))
        if (!ok) return
        r = await call({ branch: aiKey, file: file ?? r.path, section, force })
        if (r?.error) { showToast(r.error, 'err'); return }
      }
      const replaced = typeof r?.removed === 'number' ? r.removed : 0
      if (r?.created) showToast(t('ai.changelog.created', r.path), 'ok')
      else if (replaced) showToast(t('ai.changelog.insertedReplacing', r.added ?? 0, replaced, r.path), 'ok')
      else showToast(t('ai.changelog.inserted', r.added ?? 0, r.path), 'ok')
    },
  }]

  const common = { subject: label ?? '', onGenerated: () => {} }

  if (kind === 'changelog') {
    return (
      <div className="ai-tab">
        <AIAnswerBody
          {...common}
          mono
          actions={insert}
          recall={async () => {
            const r = await (api.aiChangelogState?.(aiKey) ?? Promise.resolve(null))
            const c = r?.cached
            if (!c?.text?.trim()) return null
            const behind = (r.newCommits ?? 0) > 0
            return {
              text: c.text,
              meta: [
                t('ai.changelog.meta', c.commits ?? 0, c.base),
                t('ai.changelog.written', timeAgo(new Date(c.at).toISOString(), t)),
              ].join(' · '),
              notice: behind ? t('ai.changelog.behind', r.newCommits)
                : r.baseMoved ? t('ai.changelog.baseMoved') : undefined,
              stale: behind,
            }
          }}
          run={async (_guidance, previous) => {
            const r = await (api.aiGenerateChangelog?.(aiKey, undefined, previous)
              ?? Promise.resolve({ error: 'not-implemented' }))
            return {
              text: r?.changelog,
              meta: r?.base ? t('ai.changelog.meta', r.commits ?? 0, r.base) : undefined,
              error: r?.error,
            }
          }}
        />
      </div>
    )
  }

  const explain = async (guidance?: string) => {
    const r = await (
      kind === 'branch' ? api.aiExplainBranch?.(aiKey, guidance)
        : kind === 'stash' ? api.aiExplainStash?.(aiKey, guidance)
          : api.aiExplainWorking?.(guidance)
      ?? Promise.resolve({ error: 'not-implemented' }))
    return { text: r?.explanation, meta: r?.base ? t('ai.branch.meta', r.base) : undefined, error: r?.error }
  }

  return (
    <div className="ai-tab">
      <AIAnswerBody {...common} guide run={explain} />
    </div>
  )
}
