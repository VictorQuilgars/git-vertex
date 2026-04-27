import React, { useState, useEffect, useRef } from 'react'
import './Dialog.css'

// ── Prompt dialog ─────────────────────────────────────────────────
interface PromptDialogProps {
  message: string
  defaultValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function PromptDialog({ message, defaultValue = '', onConfirm, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => { if (value.trim() !== '' || defaultValue === '') onConfirm(value) }

  return (
    <div className="dlg-overlay" onMouseDown={onCancel}>
      <div className="dlg-box" onMouseDown={e => e.stopPropagation()}>
        <div className="dlg-message">{message}</div>
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
