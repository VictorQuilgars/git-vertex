import React, { useState, useEffect, useRef } from 'react'
import './Dialog.css'

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
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = multiline ? taRef.current : inputRef.current
    el?.focus()
    el?.select()
  }, [multiline])

  const submit = () => { if (value.trim() !== '' || defaultValue === '') onConfirm(value) }

  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div className={`dlg-box${multiline ? ' dlg-box--wide' : ''}`} onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-message">{message}</div>
        {multiline ? (
          <>
            <textarea
              ref={taRef}
              className="dlg-textarea"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
                if (e.key === 'Escape') onCancel()
              }}
              spellCheck={false}
            />
            <div className="dlg-hint">{t('dlg.hint')}</div>
          </>
        ) : (
          <input
            ref={inputRef}
            className="dlg-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') onCancel()
            }}
          />
        )}
        <div className="dlg-actions">
          <button className="dlg-btn dlg-cancel" onClick={onCancel}>Annuler</button>
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm()
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onConfirm, onCancel])

  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div className="dlg-box" onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-message" style={{ whiteSpace: 'pre-line' }}>{message}</div>
        <div className="dlg-actions">
          <button className="dlg-btn dlg-cancel" onClick={onCancel}>Annuler</button>
          <button className={`dlg-btn ${danger ? 'dlg-danger' : 'dlg-ok'}`} onClick={onConfirm}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  )
}
