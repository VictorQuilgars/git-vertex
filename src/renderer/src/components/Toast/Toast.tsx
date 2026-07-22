import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import './Toast.css'

interface ToastAction {
  label: string
  onClick: () => void
}

// One or several action buttons. `sticky` keeps the toast up until the user
// acts or dismisses it — used for decisions (e.g. "a conflict is coming,
// continue?") that must not silently time out.
type ToastArg = ToastAction | ToastAction[]

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  actions?: ToastAction[]
  sticky?: boolean
}

interface ToastContextValue {
  success: (msg: string, action?: ToastArg, sticky?: boolean) => void
  error: (msg: string, action?: ToastArg, sticky?: boolean) => void
  info: (msg: string, action?: ToastArg, sticky?: boolean) => void
}

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const addToast = useCallback((message: string, type: ToastItem['type'], action?: ToastArg, sticky?: boolean) => {
    const id = ++counter.current
    const actions = action ? (Array.isArray(action) ? action : [action]) : undefined
    setToasts(prev => [...prev, { id, message, type, actions, sticky }])
    // Sticky toasts wait for the user; otherwise leave more time when an action
    // (e.g. undo) is offered than for a plain notification.
    if (!sticky) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, actions?.length ? 8000 : 4000)
    }
  }, [])

  const ctx: ToastContextValue = {
    success: (msg, action, sticky) => addToast(msg, 'success', action, sticky),
    error: (msg, action, sticky) => addToast(msg, 'error', action, sticky),
    info: (msg, action, sticky) => addToast(msg, 'info', action, sticky),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item toast-${t.type}`}>
            <span className="toast-icon">
              {t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span className="toast-msg">{t.message}</span>
            {t.actions?.map((a, i) => (
              <button
                key={i}
                className="toast-action"
                onClick={() => {
                  setToasts(prev => prev.filter(x => x.id !== t.id))
                  a.onClick()
                }}
              >{a.label}</button>
            ))}
            <button
              className="toast-dismiss"
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            >×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
