import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { Icon, type IconName } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { revealText, type Reveal } from '../../utils/aiReveal'
import './AIAnswer.css'

/** What a run of the model came back with. */
export interface AIAnswerResult { text?: string; meta?: string; error?: string }

/**
 * What the app already knows, before anything is asked. A drawer that opens
 * on a stored answer costs nothing; one that regenerates it costs a call the
 * reader did not ask for — and got the last time they closed the drawer by
 * mistake.
 */
export interface AIAnswerMemory {
  text: string
  meta?: string
  /** The stored text no longer covers the thing — say why, in a sentence. */
  notice?: string
  /** Present ⇒ the button offers to bring it up to date, not to start over. */
  stale?: boolean
}

/** A button beside Copy, for whatever else can be done with the answer. */
export interface AIAnswerAction {
  label: string
  title?: string
  run: (text: string) => void | Promise<void>
}

/**
 * One model answer about one thing, read in a drawer (#70 P1).
 *
 * A branch, a stash, the uncommitted work and a changelog all ask the same
 * question of the app — *say what this is* — and all four used to have
 * nowhere to be said. The commit's explanation lives in the commit's own
 * panel, which the other three do not have; a toast cannot hold a paragraph;
 * and a modal over the graph would hide the thing being explained.
 *
 * So: the composers' drawer, with the composers' manners. It asks on open,
 * breathes while it waits, writes the answer in word by word, and offers the
 * two things a reader of a generated paragraph actually wants — the text on
 * the clipboard, and another go with a focus ("only the migration").
 *
 * `recall` is what makes the changelog affordable: an answer already written
 * is shown instantly, whole, with no call and no writing animation, because
 * it is being remembered rather than composed.
 */
export default function AIAnswer({
  anchor, title, subject, icon, run, recall, guide, mono, actions, onGenerated, onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  /** The drawer's name — the action, not its object. */
  title: string
  /** What the answer is about: the branch, the stash, the working tree. */
  subject: string
  icon?: IconName
  /**
   * One run. `previous` is the text to build on when the reader asked for an
   * update rather than a fresh answer.
   */
  run: (guidance?: string, previous?: string) => Promise<AIAnswerResult>
  /** Asked first, and free. Null (or no text) ⇒ the drawer generates. */
  recall?: () => Promise<AIAnswerMemory | null>
  /** Present ⇒ the answer can be re-asked with a focus. A changelog cannot:
   *  it is a rendering of the commits, not an opinion about them. */
  guide?: boolean
  /** Kept in a monospace block, because it is going to be pasted as source. */
  mono?: boolean
  /** Extra things to do with the answer — inserting it into a file. */
  actions?: AIAnswerAction[]
  /**
   * Something was written and kept. The host puts it in the panel's AI stack
   * and brings that stack into view — a reading that lands in a list nobody
   * is looking at is a reading nobody knows exists.
   */
  onGenerated?: () => void
  onClose: () => void
}) {
  const { t } = useLang()
  const [busy, setBusy] = useState(true)
  const [text, setText] = useState('')
  const [meta, setMeta] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** The shown text came from the store, so it can be re-asked for. */
  const [remembered, setRemembered] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guidance, setGuidance] = useState('')
  const [writing, setWriting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const reveal = useRef<Reveal | null>(null)
  /** The full answer, whatever the reveal has shown of it so far. */
  const full = useRef('')

  useEffect(() => () => reveal.current?.stop(), [])

  const show = (value: string, revealIt: boolean) => {
    full.current = value
    if (!revealIt) { setText(value); setWriting(false); return }
    setWriting(true)
    reveal.current = revealText(value, setText, () => setWriting(false))
  }

  const ask = useCallback(async (focus?: string, previous?: string) => {
    reveal.current?.stop()
    setBusy(true); setError(null); setText(''); setCopied(false); setNotice(null)
    let r: AIAnswerResult
    try {
      r = await run(focus, previous)
    } catch (e: any) {
      // A host without the handler rejects rather than answering.
      r = { error: e?.message ?? 'AI error' }
    }
    setBusy(false)
    if (r.error || !r.text?.trim()) {
      setError(r.error === 'NO_API_KEY' ? t('panel.aiNoKey') : (r.error ?? t('ai.answer.empty')))
      return
    }
    setMeta(r.meta ?? null)
    setRemembered(false); setStale(false)
    show(r.text, true)
    onGenerated?.()
  }, [run, t, onGenerated])

  // Asked on open — unless something is already known, in which case that is
  // shown and nothing is spent. The drawer exists because the action was
  // chosen, so a Generate button inside it would be furniture either way.
  useEffect(() => {
    let alive = true
    void (async () => {
      if (recall) {
        let known: AIAnswerMemory | null = null
        try { known = await recall() } catch { known = null }
        if (!alive) return
        if (known?.text?.trim()) {
          setBusy(false)
          setMeta(known.meta ?? null)
          setNotice(known.notice ?? null)
          setStale(!!known.stale)
          setRemembered(true)
          show(known.text, false)
          return
        }
      }
      if (alive) void ask()
    })()
    return () => { alive = false }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    // The whole answer, not the part that happens to have been revealed —
    // which is also why neither this button nor an action waits for the
    // writing animation: the text is complete before its first word shows.
    await navigator.clipboard.writeText(full.current)
    setCopied(true)
  }

  const askAgain = () => { if (!busy && !writing) void ask(guidance.trim() || undefined) }

  /** Bring it up to date (keeping what is there) or start over. */
  const again = () => {
    if (busy || writing) return
    void ask(undefined, stale ? full.current : undefined)
  }

  const act = async (action: AIAnswerAction) => {
    setActing(action.label)
    try { await action.run(full.current) } finally { setActing(null) }
  }

  return (
    <PanelDrawer anchor={anchor} title={title} icon={icon ?? 'ai'}
      closeLabel={t('common.close')} onClose={onClose}>
      <div className="aia-body">
        <div className="aia-subject" title={subject}>
          {subject}
          {meta && <span className="aia-meta">{meta}</span>}
        </div>

        {busy && (
          <div className="aia-wait" role="status">
            <span className="aia-breath" aria-hidden="true" />
            {t('panel.aiWorking')}
          </div>
        )}

        {error && (
          <div className="aia-error">
            <span>{error}</span>
            <button type="button" onClick={() => void ask(guidance.trim() || undefined)}>
              {t('ai.answer.retry')}
            </button>
          </div>
        )}

        {/* What the stored answer does not cover. Above the text, because it
            changes how the text should be read. */}
        {notice && !busy && <div className="aia-notice">{notice}</div>}

        {!busy && !error && text && (
          <>
            <div className={`aia-text${mono ? ' aia-text--mono' : ''}${writing ? ' aia-text--writing' : ''}`}>
              {text}
            </div>
            <div className="aia-actions">
              <button type="button" className="aia-copy" onClick={copy}>
                <Icon name="copy" size={12} /> {copied ? t('ai.answer.copied') : t('ai.answer.copy')}
              </button>
              {actions?.map(a => (
                <button key={a.label} type="button" className="aia-copy" title={a.title}
                  disabled={acting !== null} onClick={() => void act(a)}>
                  {acting === a.label ? t('ai.answer.working') : a.label}
                </button>
              ))}
              {/* Only where an answer can be asked for again — a recalled one.
                  A freshly written answer already is the latest. */}
              {remembered && (
                <button type="button" className="aia-again aia-again--inline" onClick={again}>
                  {stale ? t('ai.answer.update') : t('ai.answer.regenerate')}
                </button>
              )}
            </div>
          </>
        )}

        {/* Another go, with a focus. It replaces the answer rather than
            adding to it: what was asked for is a better reading of the same
            thing, not a second opinion to compare against the first. */}
        {guide && !busy && (
          <div className="aia-guide">
            <label htmlFor="gv-ai-guide">{t('ai.answer.guideLabel')}</label>
            <div className="aia-guide-row">
              <input
                id="gv-ai-guide"
                className="aia-guide-input"
                value={guidance}
                placeholder={t('ai.answer.guidePlaceholder')}
                onChange={e => setGuidance(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') askAgain() }}
              />
              <button type="button" className="aia-again" onClick={askAgain} disabled={writing}>
                {t('ai.answer.again')}
              </button>
            </div>
          </div>
        )}
      </div>
    </PanelDrawer>
  )
}
