import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import PanelDrawer from '../PanelDrawer/PanelDrawer'
import { Icon, type IconName } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { revealText, type Reveal } from '../../utils/aiReveal'
import './AIAnswer.css'

/** What a run of the model came back with. */
export interface AIAnswerResult { text?: string; meta?: string; error?: string }

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
 */
export default function AIAnswer({
  anchor, title, subject, icon, run, guide, mono, onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  /** The drawer's name — the action, not its object. */
  title: string
  /** What the answer is about: the branch, the stash, the working tree. */
  subject: string
  icon?: IconName
  /** One run. Called again, with a focus, when the reader asks for one. */
  run: (guidance?: string) => Promise<AIAnswerResult>
  /** Present ⇒ the answer can be re-asked with a focus. A changelog cannot:
   *  it is a rendering of the commits, not an opinion about them. */
  guide?: boolean
  /** Kept in a monospace block, because it is going to be pasted as source. */
  mono?: boolean
  onClose: () => void
}) {
  const { t } = useLang()
  const [busy, setBusy] = useState(true)
  const [text, setText] = useState('')
  const [meta, setMeta] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guidance, setGuidance] = useState('')
  const [writing, setWriting] = useState(false)
  const [copied, setCopied] = useState(false)
  const reveal = useRef<Reveal | null>(null)
  /** The full answer, whatever the reveal has shown of it so far. */
  const full = useRef('')

  useEffect(() => () => reveal.current?.stop(), [])

  const ask = useCallback(async (focus?: string) => {
    reveal.current?.stop()
    setBusy(true); setError(null); setText(''); setCopied(false)
    let r: AIAnswerResult
    try {
      r = await run(focus)
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
    full.current = r.text
    setWriting(true)
    reveal.current = revealText(r.text, setText, () => setWriting(false))
  }, [run, t])

  // Asked on open: the drawer exists because the action was chosen, so a
  // second click on a "Generate" button inside it would be furniture.
  useEffect(() => { void ask() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    // The whole answer, not the part that happens to have been revealed.
    await navigator.clipboard.writeText(full.current)
    setCopied(true)
  }

  const askAgain = () => { if (!busy && !writing) void ask(guidance.trim() || undefined) }

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

        {!busy && !error && text && (
          <>
            <div className={`aia-text${mono ? ' aia-text--mono' : ''}${writing ? ' aia-text--writing' : ''}`}>
              {text}
            </div>
            <div className="aia-actions">
              <button type="button" className="aia-copy" onClick={copy} disabled={writing}>
                <Icon name="copy" size={12} /> {copied ? t('ai.answer.copied') : t('ai.answer.copy')}
              </button>
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
