import { useState, useId } from 'react'
import { useDialogFocus } from './useDialogFocus'
import { useLang } from '../../i18n/LanguageContext'
import './Dialog.css'

/**
 * ── Choice dialog ────────────────────────────────────────────────
 * One question, N answers, none of them typed.
 *
 * Written for "which changelog?" in a repository that tracks several: the
 * app must not pick, and asking someone to type a path they can see in front
 * of them is asking them to make a typo.
 */
export function ChoiceDialog({ message, options, onPick, onCancel }: {
  message: string
  options: string[]
  onPick: (value: string) => void
  onCancel: () => void
}) {
  const { t } = useLang()
  const messageId = useId()
  const boxRef = useDialogFocus(onCancel)
  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={messageId} tabIndex={-1} className="dlg-box" onMouseDown={e => e.stopPropagation()}>
        <div id={messageId} className="dlg-message">{message}</div>
        <div className="dlg-choices">
          {options.map(o => (
            <button key={o} className="dlg-choice" onClick={() => onPick(o)}>{o}</button>
          ))}
        </div>
        <div className="dlg-actions">
          <button className="dlg-btn" onClick={onCancel}>{t('dlg.cancel')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Prompt dialog ─────────────────────────────────────────────────
interface PromptDialogProps {
  message: string
  defaultValue?: string
  // Multi-line editor (commit messages…): wide box, textarea showing the
  // whole value, ⌘/Ctrl+Enter to confirm since Enter inserts a newline.
  multiline?: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({ message, defaultValue = '', multiline = false, onConfirm, onCancel }: PromptDialogProps) {
  const { t } = useLang()
  const messageId = useId()
  const [value, setValue] = useState(defaultValue)
  const boxRef = useDialogFocus(onCancel, multiline ? 'textarea' : 'input')

  const submit = () => { if (value.trim() !== '' || defaultValue === '') onConfirm(value) }

  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={messageId} tabIndex={-1} className={`dlg-box${multiline ? ' dlg-box--wide' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div id={messageId} className="dlg-message">{message}</div>
        {multiline ? (
          <>
            <textarea
              aria-labelledby={messageId}
              className="dlg-textarea"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
              }}
              spellCheck={false}
            />
            <div className="dlg-hint">{t('dlg.hint')}</div>
          </>
        ) : (
          <input
            aria-labelledby={messageId}
            className="dlg-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
            }}
          />
        )}
        <div className="dlg-actions">
          <button className="dlg-btn dlg-cancel" onClick={onCancel}>{t('dlg.cancel')}</button>
          <button className="dlg-btn dlg-ok" onClick={submit}>OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────
interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export function ConfirmDialog({ message, onConfirm, onCancel, danger }: ConfirmDialogProps) {
  const { t } = useLang()
  const messageId = useId()
  // Enter activates whatever has the focus, so where the focus starts is the
  // whole decision: a destructive question opens on Cancel, so the reflex
  // keystroke does nothing; an ordinary one opens on Confirm, so it still
  // answers "yes" the way it always has.
  const boxRef = useDialogFocus(onCancel, danger ? '.dlg-cancel' : '.dlg-ok')

  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={messageId} tabIndex={-1} className="dlg-box" onMouseDown={e => e.stopPropagation()}>
        <div id={messageId} className="dlg-message" style={{ whiteSpace: 'pre-line' }}>{message}</div>
        <div className="dlg-actions">
          <button className="dlg-btn dlg-cancel" onClick={onCancel}>{t('dlg.cancel')}</button>
          <button className={`dlg-btn ${danger ? 'dlg-danger' : 'dlg-ok'}`} onClick={onConfirm}>
            {t('dlg.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
