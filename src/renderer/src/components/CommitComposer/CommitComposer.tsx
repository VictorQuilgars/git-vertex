import { useCallback, useEffect, useState, type RefObject } from 'react'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { measureSplit, type SplitGroup } from '../../../../main/split-plan'
import './CommitComposer.css'

type Group = SplitGroup

/**
 * The commit composer (#70 P1) — a working tree cut into atomic commits.
 *
 * `aiRecomposeCommit` rewrites the message of a commit that already exists.
 * This is the other half: work that is one heap on disk, proposed as a
 * sequence, reviewed, edited, and only then applied.
 *
 * Two things propose here, and both land on this one screen: the configured
 * model, asked when the drawer opens, and an agent over MCP (`propose_split`,
 * #88), whose plan arrives by deep link as `proposal`. The agent's plan is
 * measured against the working tree as it is NOW, exactly as the model's
 * answer is — it was checked on the agent's side, but the tree may have moved
 * since.
 *
 * **File-level, and that is a decision.** A commit here takes whole files —
 * every hunk of them, staged or not. `propose_split` takes files for the same
 * reason: promising hunks with a file-level apply behind them would be the
 * worse kind of gap. The drawer says so, because a user who expects hunks and
 * gets files loses the distinction between what they staged and what they did
 * not.
 *
 * Nothing is applied until the button is pressed, and what is applied is what
 * is on screen — the plan is editable, so a proposal that is 80% right is
 * worth more than one that has to be perfect or discarded.
 */
export interface CommitComposerProps {
  onClose: () => void
  /** Committed something — the panel and the graph have to be reloaded. */
  onCommitted: () => void
  showToast: (msg: string, kind?: 'ok' | 'err') => void
  /**
   * A split an agent proposed (MCP `propose_split`). When given, the model is
   * not asked: this is the plan under review.
   */
  proposal?: SplitGroup[]
  /**
   * A branch whose commits are recomposed instead of the working tree being
   * split (#293). Only ever the checked-out one: the plan is applied where
   * the composer commits, so the host refuses any other before asking.
   */
  subject?: string
}

/** What a recomposition was proposed from — see ai-features.ts::RecomposePlan. */
interface RecomposePlan { branch: string; base: string; onto: string; tip: string; commits: number }

/**
 * The drawer. In the VS Code panel there is no room for one, so the same body
 * fills an editor tab there — and PanelDrawer renders NOTHING without an
 * anchor to measure, so handing it a null one would have produced a blank tab
 * rather than an obvious failure.
 */
export default function CommitComposer({ anchor, ...props }: CommitComposerProps & {
  anchor: RefObject<HTMLElement | null>
}) {
  const { t } = useLang()
  return (
    <PanelDrawer anchor={anchor} title={props.subject ? t('cc.recomposeTitle', props.subject) : t('cc.title')} icon="ai"
      closeLabel={t('common.close')} onClose={props.onClose}>
      <CommitComposerBody {...props} />
    </PanelDrawer>
  )
}

export function CommitComposerBody({ onClose, onCommitted, showToast, subject, proposal }: CommitComposerProps) {
  const { t } = useLang()
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loose, setLoose] = useState<string[]>([])
  const [invented, setInvented] = useState<string[]>([])
  /** The commit being made, while it is being made. Null when idle. */
  const [applying, setApplying] = useState<number | null>(null)
  const [made, setMade] = useState(0)
  /** Set when the plan recomposes a branch: applying it unwinds that branch first. */
  const [plan, setPlan] = useState<RecomposePlan | null>(null)

  /**
   * The agent's plan, measured against what is uncommitted now. Its paths
   * were checked by the MCP server when it was sent; a file committed or
   * reverted since then is dropped here and counted, and a file changed since
   * then comes in loose — the same three outcomes as the model's answer.
   */
  const measureAgentPlan = useCallback(async (plan: SplitGroup[]) => {
    const w = await window.gitAPI.getWorkingChanges()
    const known = [...new Set([
      ...(w?.staged ?? []).map(f => f.path),
      ...(w?.unstaged ?? []).map(f => f.path),
      ...(w?.untracked ?? []),
    ])].sort()
    if (!known.length) return { error: t('cc.agentNothing') }
    const measured = measureSplit(plan, known)
    if (!measured.groups.length) return { error: t('cc.agentStale') }
    return measured
  }, [t])

  const propose = useCallback(async () => {
    setBusy(true); setError(null)
    let r: any
    try {
      // An agent's plan is measured, not asked for; otherwise the model proposes — for the
      // working tree, or for the branch being recomposed.
      r = proposal
        ? await measureAgentPlan(proposal)
        : await (window.gitAPI as any).aiProposeCommitSplit?.(subject) ?? { error: 'not-implemented' }
    } catch (e: any) {
      r = { error: e?.message ?? (proposal ? t('cc.agentReadFailed') : 'AI error') }
    }
    setBusy(false)
    if (r?.error) {
      setError(r.error === 'NO_API_KEY' ? t('panel.aiNoKey') : r.error)
      return
    }
    setGroups(r.groups ?? [])
    setLoose(r.unassigned ?? [])
    setInvented(r.invented ?? [])
    setPlan(r.recompose ?? null)
  }, [t, subject, proposal, measureAgentPlan])

  useEffect(() => { void propose() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const setMessage = (i: number, message: string) =>
    setGroups(gs => gs.map((g, n) => n === i ? { ...g, message } : g))

  /**
   * A file belongs to exactly one place, so a move is a remove and an add.
   *
   * A commit the move empties goes with its last file: its message described
   * those files, and a commit with none is a row that can only ever block the
   * apply. An empty commit the user just ADDED stays — it is waiting for
   * something, which is not the same as having lost everything.
   */
  const move = (file: string, to: number | null) => {
    setGroups(gs => {
      const from = gs.findIndex(g => g.files.includes(file))
      const next = gs.map((g, n) => {
        if (n === from) return { ...g, files: g.files.filter(f => f !== file) }
        if (n === to) return { ...g, files: [...g.files, file] }
        return g
      })
      return next.filter((g, n) => n !== from || g.files.length > 0)
    })
    setLoose(l => to === null ? (l.includes(file) ? l : [...l, file]) : l.filter(f => f !== file))
  }

  /** Dropping a commit does not drop its work: the files come back loose. */
  const dropGroup = (i: number) => {
    setLoose(l => [...l, ...groups[i].files])
    setGroups(gs => gs.filter((_, n) => n !== i))
  }

  const swap = (i: number, j: number) => setGroups(gs => {
    if (j < 0 || j >= gs.length) return gs
    const out = [...gs]
    ;[out[i], out[j]] = [out[j], out[i]]
    return out
  })

  const addGroup = () => setGroups(gs => [...gs, { message: '', files: [] }])

  /**
   * The message is the thing being reviewed, so it is never clipped: the box
   * takes the height of what is in it. A proposal whose body is cut off after
   * two lines is a proposal nobody read.
   */
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const ready = groups.length > 0
    && groups.every(g => g.message.trim() && g.files.length)
    && applying === null

  /**
   * Applied one commit at a time, through the calls the staging panel already
   * uses. The index is cleared first: the split decides what each commit
   * holds, and whatever happened to be staged beforehand must not ride along
   * with the first one.
   *
   * A failure stops the sequence and says how far it got. It cannot undo what
   * it already committed — and pretending otherwise, by rolling back history
   * the user can see in the graph, would be worse than saying it plainly.
   */
  const apply = async () => {
    const all = [...groups.flatMap(g => g.files), ...loose]
    setApplying(0); setMade(0); setError(null)
    // Once a branch has been unwound, a failure leaves its work uncommitted —
    // never lost — and the message says where its old tip is.
    let unwound = false
    const fail = (msg: string, done: number) => {
      setApplying(null)
      const text = done > 0 ? t('cc.failedAfter', done, msg) : msg
      setError(unwound && plan ? `${text} ${t('cc.recomposeRecover', plan.tip.slice(0, 7))}` : text)
      if (done > 0 || unwound) onCommitted()
    }
    // Recomposing: take the branch back to its fork point, everything it
    // carried left staged — then the plan is applied exactly as a split of
    // the working tree is. The host refuses if the branch moved, is not the
    // one checked out, or the tree has changes of its own.
    if (plan) {
      const reset = await window.gitAPI.recomposeReset(plan.branch, plan.onto, plan.tip)
        .catch((e: any) => ({ success: false, error: e?.message }))
      if ((reset as any)?.success === false) { fail((reset as any).error ?? t('cc.clearFailed'), 0); return }
      unwound = true
    }
    const clear = await window.gitAPI.unstage(all).catch((e: any) => ({ success: false, error: e?.message }))
    if ((clear as any)?.success === false) { fail((clear as any).error ?? t('cc.clearFailed'), 0); return }

    for (let i = 0; i < groups.length; i++) {
      setApplying(i)
      const st = await window.gitAPI.stage(groups[i].files).catch((e: any) => ({ success: false, error: e?.message }))
      if ((st as any)?.success === false) { fail((st as any).error ?? t('cc.stageFailed'), i); return }
      const c = await window.gitAPI.commit(groups[i].message.trim()).catch((e: any) => ({ success: false, error: e?.message }))
      if ((c as any)?.success === false) { fail((c as any).error ?? t('cc.commitFailed'), i); return }
      setMade(i + 1)
    }
    setApplying(null)
    showToast(t('cc.made', groups.length), 'ok')
    onCommitted()
    onClose()
  }

  const total = groups.reduce((n, g) => n + g.files.length, 0)

  const fileRow = (file: string, from: number | null) => (
    <li key={file} className="cc-file">
      <span className="cc-file-path" title={file}>{file}</span>
      <select
        className="cc-file-move"
        value={from === null ? 'none' : String(from)}
        title={t('cc.moveTitle')}
        disabled={applying !== null}
        onChange={e => move(file, e.target.value === 'none' ? null : Number(e.target.value))}
      >
        {groups.map((_, n) => <option key={n} value={n}>{t('cc.commitN', n + 1)}</option>)}
        <option value="none">{t('cc.leaveOut')}</option>
      </select>
    </li>
  )

  return (
    <div className="cc-body">
        {/* Whose plan this is. The drawer looks the same either way, and a
            user who did not ask for a split has to see why one is open. */}
        {proposal && <div className="cc-origin">{t('cc.fromAgent')}</div>}

        {busy && (
          <div className="cc-wait" role="status">
            <span className="cc-breath" aria-hidden="true" />
            {t('cc.proposing')}
          </div>
        )}

        {error && <div className="cc-error">{error}</div>}

        {!busy && groups.length > 0 && (
          <>
            <div className="cc-summary">
              {t('cc.summary', total, groups.length)}
              <span className="cc-note">{t('cc.wholeFiles')}</span>
              {plan && <span className="cc-note">{t('cc.recomposeNote', plan.commits, plan.branch, plan.base)}</span>}
            </div>

            {invented.length > 0 && (
              <div className="cc-warn" title={invented.join('\n')}>
                {proposal ? t('cc.agentInvented', invented.length) : t('cc.invented', invented.length)}
              </div>
            )}

            {groups.map((g, i) => (
              <div key={i} className={`cc-group${applying === i ? ' cc-group--applying' : ''}${i < made ? ' cc-group--done' : ''}`}>
                <div className="cc-group-head">
                  <span className="cc-group-n">{i + 1}</span>
                  <div className="cc-group-tools">
                    <button type="button" title={t('cc.up')} disabled={i === 0 || applying !== null}
                      onClick={() => swap(i, i - 1)}>▲</button>
                    <button type="button" title={t('cc.down')} disabled={i === groups.length - 1 || applying !== null}
                      onClick={() => swap(i, i + 1)}>▼</button>
                    <button type="button" title={t('cc.drop')} disabled={applying !== null}
                      onClick={() => dropGroup(i)}>×</button>
                  </div>
                </div>
                <textarea
                  ref={fit}
                  className="cc-message"
                  value={g.message}
                  disabled={applying !== null}
                  placeholder={t('panel.commitMsg.placeholder')}
                  onChange={e => { setMessage(i, e.target.value); fit(e.currentTarget) }}
                />
                <ul className="cc-files">{g.files.map(f => fileRow(f, i))}</ul>
              </div>
            ))}

            <button type="button" className="cc-add" disabled={applying !== null} onClick={addGroup}>
              <Icon name="plus" size={11} /> {t('cc.addCommit')}
            </button>

            {/* Files the split left out. They are SHOWN rather than dropped:
                a file that quietly stays uncommitted is work the user thinks
                they committed. */}
            {loose.length > 0 && (
              <div className="cc-loose">
                <div className="cc-loose-head">{t('cc.looseHead', loose.length)}</div>
                <ul className="cc-files">{loose.map(f => fileRow(f, null))}</ul>
              </div>
            )}

            <div className="cc-apply-row">
              <button type="button" className="cc-apply" disabled={!ready} onClick={apply}>
                {applying !== null ? t('cc.applying', applying + 1, groups.length) : t('cc.apply', groups.length)}
              </button>
              {!ready && applying === null && <span className="cc-hint">{t('cc.hint')}</span>}
            </div>
        </>
      )}
    </div>
  )
}
