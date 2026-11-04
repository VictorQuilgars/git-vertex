import { useEffect, useState, type ReactNode } from 'react'
import MdLite from '../GitHubPanel/mdLite'
import { useLang } from '../../i18n/LanguageContext'
import './MarkdownField.css'

/**
 * A markdown field with a Write / Preview switch (#337) — the comment box and
 * the description editors of an issue or a pull request, and the two
 * composers.
 *
 * It wraps the caller's own `<textarea>` rather than drawing one: each caller
 * already owns its field's class, its id for the label, its AI reveal
 * (`readOnly` while the model writes) and its rows, and none of that is this
 * component's business. Preview only HIDES the textarea — never unmounts it —
 * so the caret, the undo history and anything holding a ref to it survive a
 * look at the rendering.
 *
 * The preview is drawn by the same `MdLite` that draws the posted body and the
 * comments, so what is previewed is what will be read after posting — in this
 * app. GitHub's own renderer covers more (tables, HTML); `MdLite` prints what
 * it does not recognise as its source, so the preview never claims a
 * rendering it does not do.
 */
export default function MarkdownField({ value, openLink, children, className }: {
  value: string
  openLink?: (url: string) => void
  /** The field itself — a `<textarea>` the caller configures. */
  children: ReactNode
  className?: string
}) {
  const { t } = useLang()
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  // A field emptied — a comment just posted, a draft cleared — goes back to
  // Write: previewing nothing is never where the next keystroke belongs.
  useEffect(() => { if (!value) setMode('write') }, [value])

  return (
    <div className={`mdf${className ? ` ${className}` : ''}`}>
      <div className="mdf-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'write'}
          className={`mdf-tab${mode === 'write' ? ' mdf-tab--on' : ''}`}
          onClick={() => setMode('write')}>
          {t('md.write')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'preview'}
          className={`mdf-tab${mode === 'preview' ? ' mdf-tab--on' : ''}`}
          onClick={() => setMode('preview')}>
          {t('md.preview')}
        </button>
      </div>
      <div className="mdf-write" hidden={mode !== 'write'}>{children}</div>
      {mode === 'preview' && (
        <div className="mdf-preview" role="tabpanel">
          {value.trim()
            ? <MdLite source={value} openLink={openLink} />
            : <div className="mdf-empty">{t('md.nothing')}</div>}
        </div>
      )}
    </div>
  )
}
