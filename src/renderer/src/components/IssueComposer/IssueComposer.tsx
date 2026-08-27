import React, { useState, useEffect, type RefObject } from 'react'
import { Icon } from '../Icon/Icon'
import './IssueComposer.css'
import { useLang } from '../../i18n/LanguageContext'
import { PickField } from '../PRComposer/PRComposer'
import type { GithubLabel } from '../GitHubPanel/GithubRow'
import { Brand } from '../BrandMark/BrandMark'
import PanelDrawer from '../PanelDrawer/PanelDrawer'

/**
 * The issue composer — the PR composer's sibling, and it speaks that
 * component's form language on purpose: the same PanelDrawer shape, the same
 * pr-* field styles, the same PickField. Two composers with two stylesheets
 * would disagree the way the two hover cards did (#95 §3).
 *
 * What is its own: one POST carries everything (an issue's create endpoint
 * takes labels and assignees, a pull request's does not), and the AI writes
 * from a SENTENCE — there is no diff to read, the brief is the material.
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

  // ── Written from a sentence ───────────────────────────────────
  // Summoned, not resident — the same contract as the filter drawer's
  // describe row: Escape folds the row before the drawer, the sentence
  // survives folding, the complaint does not.
  const [describing, setDescribing] = useState(false)
  const [described, setDescribed] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const toggleDescribe = () => { setGenError(null); setDescribing(d => !d) }

  const generate = async () => {
    if (!described.trim() || generating) return
    setGenerating(true); setGenError(null)
    const r = await ((window.gitAPI as any).aiGenerateIssue?.(described)
      ?? Promise.resolve({ error: 'not-implemented' })).catch((e: any) => ({ error: e.message }))
    setGenerating(false)
    if (r?.error || !r?.title) { setGenError(r?.error ?? 'empty answer'); return }
    // It fills the fields; it never submits. The proposal is reviewed.
    setTitle(r.title)
    setBody(r.body ?? '')
    setDescribing(false)
  }

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
            <button type="button" className="pr-generate" aria-expanded={describing}
              onClick={toggleDescribe}>
              <Icon name="ai" size={13} />
              {t('ghn.generate')}
            </button>
          </span>
          <input
            id="gv-issue-title"
            className="pr-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('ghn.titlePlaceholder')}
            autoFocus
          />
        </div>

        {describing && (
          <div className="ic-describe">
            <input className="pr-input" value={described} autoFocus
              placeholder={t('ghn.describePlaceholder')}
              onChange={e => setDescribed(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); void generate() }
                // The row goes first; the drawer only closes once there is no row.
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); toggleDescribe() }
              }} />
            <button type="button" className="ic-ask"
              disabled={!described.trim() || generating}
              onClick={() => void generate()}>
              <Icon name="ai" size={13} />
              {generating ? t('ghn.generating') : t('ghn.write')}
            </button>
          </div>
        )}
        {describing && genError && <div className="pr-error">{genError}</div>}

        <div className="pr-field">
          <label className="pr-label" htmlFor="gv-issue-body">{t('ghn.bodyLabel')}</label>
          <textarea
            id="gv-issue-body"
            className="pr-textarea"
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder={t('ghn.bodyPlaceholder')}
            rows={8}
          />
        </div>

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
            disabled={submitting || !title.trim()}
          >
            <Brand name="github" size={13} />
            {submitting ? t('ghn.creating') : t('ghn.submit')}
          </button>
        </div>
      </div>
    </PanelDrawer>
  )
}
