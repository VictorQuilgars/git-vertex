// WorkingChangesEmpty.tsx — what the staging pane shows when there is nothing
// to stage.
//
// Working Changes is always selectable in the panel, and on a clean tree the
// pane used to have nothing to say. This is what it says instead: the branch
// header stays, and under it three sections — what to do next, what needs
// attention, what to start.
//
// ⚠️ Every row is computed from the repository's state. A row that is not true
// is not drawn: no "Publish" on a branch that is published, no "Push 3" on a
// branch that is level with its upstream. A pane of greyed-out suggestions is a
// pane nobody reads; one with two true rows is one that gets clicked.
//
// Nothing here is the AI's: Recompose is offered as a row with an outlined
// action, never a filled button — a proposal the model makes is not the
// purpose of the pane.

import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import './WorkingChangesEmpty.css'

export interface NextStepsState {
  branch: string
  /** Has an upstream at all. Undefined = unknown, which reads as "has one". */
  hasUpstream?: boolean
  /** The remote a publish would go to — `origin`. */
  remoteName?: string | null
  ahead?: number
  behind?: number
  /** Open pull requests, when the host knows. Undefined = no GitHub here. */
  openPRs?: number
  /** Open issues, same. */
  openIssues?: number
}

export interface NextStepsActions {
  onPublish?: () => void
  onPush?: () => void
  onPull?: () => void
  onRecompose?: () => void
  onShowPRs?: () => void
  onStartFromIssue?: () => void
  onCreateBranch?: () => void
}

/**
 * The rows of "Next steps", in the order they are shown. Pure, so the rule
 * "only what is true" can be tested without rendering anything.
 */
export function nextSteps(state: NextStepsState, actions: NextStepsActions, t: (k: any, ...a: any[]) => string) {
  const rows: { key: string; icon: string; label: string; button: string; onClick: () => void }[] = []
  const remote = state.remoteName ?? 'origin'

  if (state.hasUpstream === false && actions.onPublish) {
    rows.push({ key: 'publish', icon: 'cloud', label: t('wc.publish', state.branch, remote),
      button: t('wc.publishBtn'), onClick: actions.onPublish })
  }
  if ((state.ahead ?? 0) > 0 && actions.onPush) {
    rows.push({ key: 'push', icon: 'push', label: t('wc.push', state.ahead!, remote),
      button: t('wc.pushBtn'), onClick: actions.onPush })
  }
  if ((state.behind ?? 0) > 0 && actions.onPull) {
    rows.push({ key: 'pull', icon: 'download', label: t('wc.pull', state.behind!, remote),
      button: t('wc.pullBtn'), onClick: actions.onPull })
  }
  if (actions.onRecompose) {
    rows.push({ key: 'recompose', icon: 'ai', label: t('wc.recompose'),
      button: t('wc.recomposeBtn'), onClick: actions.onRecompose })
  }
  return rows
}

export default function WorkingChangesEmpty({ state, actions }: {
  state: NextStepsState
  actions: NextStepsActions
}) {
  const { t } = useLang()
  const steps = nextSteps(state, actions, t)
  const hasAttention = state.openPRs !== undefined
  const canStart = !!(actions.onStartFromIssue || actions.onCreateBranch)

  return (
    <div className="wce">
      {steps.length > 0 && (
        <section className="wce-section">
          <h4 className="wce-title">{t('wc.nextSteps')}</h4>
          {steps.map(s => (
            <div key={s.key} className="wce-row">
              <Icon name={s.icon as never} size={14} className="wce-row-ico" />
              <span className="wce-row-label">{s.label}</span>
              <button className={`wce-row-btn${s.key === 'recompose' ? ' wce-row-btn--ai' : ''}`}
                onClick={s.onClick}>{s.button}</button>
            </div>
          ))}
        </section>
      )}

      {hasAttention && (
        <section className="wce-section">
          <h4 className="wce-title">{t('wc.attention')}</h4>
          <button className="wce-row wce-row--link" onClick={actions.onShowPRs} disabled={!actions.onShowPRs}>
            <Icon name="pullRequest" size={14} className="wce-row-ico" />
            <span className="wce-row-label">
              {state.openPRs === 0 ? t('wc.noPRs') : t('wc.openPRs', state.openPRs!)}
            </span>
          </button>
        </section>
      )}

      {canStart && (
        <section className="wce-section">
          <h4 className="wce-title">{t('wc.startNew')}</h4>
          {actions.onStartFromIssue && (
            <button className="wce-start" onClick={actions.onStartFromIssue}>
              {t('wc.startFromIssue')}
            </button>
          )}
          {actions.onCreateBranch && (
            <button className="wce-start" onClick={actions.onCreateBranch}>
              {t('wc.createBranch')}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
