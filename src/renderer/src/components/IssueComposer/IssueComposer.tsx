import React, { useState, useEffect, useRef, type RefObject } from 'react'
import { Icon } from '../Icon/Icon'
import './IssueComposer.css'
import { useLang } from '../../i18n/LanguageContext'
import { PickField } from '../PRComposer/PRComposer'
import type { GithubLabel } from '../GitHubPanel/GithubRow'
import { Brand } from '../BrandMark/BrandMark'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { revealText, type Reveal } from '../../utils/aiReveal'

/**
 * The issue composer — the PR composer's sibling, and it speaks that
 * component's form language on purpose: the same PanelDrawer shape, the same
 * pr-* field styles, the same PickField. Two composers with two stylesheets
 * would disagree the way the two hover cards did (#95 §3).
 *
 * What is its own: one POST carries everything (an issue's create endpoint
 * takes labels and assignees, a pull request's does not), and the AI's
 * material is THE FIELDS THEMSELVES — a rough note in the title or the
 * description, however few words. There is no separate field to describe
 * into: the brief and the finished issue are the same language in the same
 * place, so the button reads what is there, rewrites it in place, and the
 * way back is one click. A first attempt summoned a second input for the
 * sentence; a second input for the same language is a form asking twice.
 */
export default function IssueComposer({ owner, repo, anchor, onClose, onCreated, onStartBranch, showToast }: {
  owner: string
  repo: string
  /** The left panel. The composer is a drawer out of it, like its sibling. */
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  /** The issue exists — the host reloads the list that should now hold it. */
  onCreated?: (number: number) => void
  /**
   * Start the branch this issue suggests — the same call the row's menu and
   * the detail make. Offered as a checkbox: creating an issue to work on it
   * NOW is the common case, and the composer already knows everything the
   * prompt needs.
   */
  onStartBranch?: (issue: { number: number; title: string; url: string }) => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}) {
  const { t } = useLang()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [assignees, setAssignees] = useState<string[]>([])
  const [withBranch, setWithBranch] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The universes the pickers offer — the repository's own.
  const [repoLabels, setRepoLabels] = useState<GithubLabel[]>([])
  const [people, setPeople] = useState<string[]>([])
  useEffect(() => {
    ;(window.gitAPI as any).githubListRepoLabels?.(owner, repo).then((r: any) => {
      if (Array.isArray(r?.labels)) setRepoLabels(r.labels)
    })
    ;(window.gitAPI as any).githubListAssignees?.(owner, repo).then((r: any) => {
      if (Array.isArray(r?.assignees)) setPeople(r.assignees)
    })
  }, [owner, repo])
  const labelDots = Object.fromEntries(repoLabels.map(l => [l.name, l.color]))
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>) => (id: string) =>
    set(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // ── Written from what is there ────────────────────────────────
  // The click generates. The wait breathes on the fields the answer will
  // land in, the answer writes itself in word by word, and what was typed
  // is one click away — because the model REPLACED it, and a replacement
  // without a way back is not a proposal.
  const [generating, setGenerating] = useState(false)
  const [writing, setWriting] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [restorePoint, setRestorePoint] = useState<{ title: string; body: string } | null>(null)
  const reveal = useRef<Reveal | null>(null)
  useEffect(() => () => reveal.current?.stop(), [])

  const generate = async () => {
    if (generating || writing) return
    const note = [title.trim(), body.trim()].filter(Boolean).join('\n\n')
    if (!note) return
    setGenerating(true); setGenError(null)
    const r = await ((window.gitAPI as any).aiGenerateIssue?.(note)
      ?? Promise.resolve({ error: 'not-implemented' })).catch((e: any) => ({ error: e.message }))
    setGenerating(false)
    if (r?.error || !r?.title) { setGenError(r?.error ?? 'empty answer'); return }
    // It fills the fields; it never submits. The proposal is reviewed —
    // and what it replaced is kept, per generation, for the restore line.
    setRestorePoint({ title, body })
    setWriting(true)
    reveal.current = revealText(r.title, setTitle, () => {
      reveal.current = revealText(r.body ?? '', setBody, () => setWriting(false))
    })
  }

  const restore = () => {
    if (!restorePoint) return
    reveal.current?.stop()
    setWriting(false)
    setTitle(restorePoint.title)
    setBody(restorePoint.body)
    setRestorePoint(null)
  }

  const hasMaterial = !!(title.trim() || body.trim())

  async function handleSubmit() {
    if (!title.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    const r = await ((window.gitAPI as any).githubCreateIssue?.(
      owner, repo, title.trim(), body, labels, assignees)
      ?? Promise.resolve({ error: 'not-implemented' })).catch((e: any) => ({ error: e.message }))
    setSubmitting(false)
    if (r?.error || !r?.number) {
      setError(r?.error === 'not_authenticated' ? t('pr.noAuth') : t('pr.error', r?.error ?? ''))
      return
    }
    showToast(t('ghn.created', r.number), 'ok')
    onCreated?.(r.number)
    onClose()
    // After the drawer: the branch prompt is its own dialog, and the issue
    // it names already exists — the order a person would do it in.
    if (withBranch) onStartBranch?.({ number: r.number, title: title.trim(), url: r.url })
  }

  return (
    <PanelDrawer anchor={anchor} title={t('ghn.title')} brand="github"
      closeLabel={t('common.close')} onClose={onClose}>
      <div className="pr-body">
        <div className="pr-field">
          <span className="pr-label pr-label--split">
            <label htmlFor="gv-issue-title">
              {t('ghn.titleLabel')} <span className="ic-required">*</span>
            </label>
            {/* The click GENERATES — from whatever the fields hold, a few
                words or a full draft. Nothing to summon, nothing to retype. */}
            <button type="button" className="pr-generate"
              disabled={!hasMaterial || generating || writing}
              title={hasMaterial ? undefined : t('ghn.generateHint')}
              onClick={() => void generate()}>
              <Icon name="ai" size={13} />
              {generating || writing ? t('pr.generating') : t('pr.generate')}
            </button>
          </span>
          <input
            id="gv-issue-title"
            className={`pr-input${generating || writing ? ' pr-ai-writing' : ''}`}
            value={title}
            readOnly={writing}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('ghn.titlePlaceholder')}
            autoFocus
          />
        </div>
        {genError && <div className="pr-error">{genError}</div>}

        <div className="pr-field">
          <label className="pr-label" htmlFor="gv-issue-body">{t('ghn.bodyLabel')}</label>
          <textarea
            id="gv-issue-body"
            className={`pr-textarea${generating || writing ? ' pr-ai-writing' : ''}`}
            value={body}
            readOnly={writing}
            onChange={e => setBody(e.target.value)}
            placeholder={t('ghn.bodyPlaceholder')}
            rows={8}
          />
        </div>
        {restorePoint && !writing && (
          <div className="pr-restore">
            <Icon name="ai" size={12} />
            {t('ai.rewrote')}
            <button type="button" onClick={restore}>{t('ai.restore')}</button>
          </div>
        )}

        <PickField label={t('pr.labelsLabel')} placeholder={t('pr.labelsPlaceholder')}
          filterPlaceholder={t('pr.pickFilter')}
          options={repoLabels.map(l => l.name)} chosen={labels} onToggle={toggle(setLabels)}
          dots={labelDots} />
        <PickField label={t('pr.assigneesLabel')} placeholder={t('pr.assigneesPlaceholder')}
          filterPlaceholder={t('pr.pickFilter')}
          options={people} chosen={assignees} onToggle={toggle(setAssignees)} />

        {onStartBranch && (
          <label className="pr-draft">
            <input type="checkbox" checked={withBranch} onChange={e => setWithBranch(e.target.checked)} />
            {t('ghn.withBranch')}
          </label>
        )}

        {error && <div className="pr-error">{error}</div>}

        <div className="pr-footer">
          <button
            className="pr-btn-primary"
            onClick={handleSubmit}
            disabled={submitting || writing || !title.trim()}
          >
            <Brand name="github" size={13} />
            {submitting ? t('ghn.creating') : t('ghn.submit')}
          </button>
        </div>
      </div>
    </PanelDrawer>
  )
}
