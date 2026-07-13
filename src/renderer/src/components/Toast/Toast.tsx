import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import './Toast.css'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  action?: ToastAction
}

interface ToastContextValue {
  success: (msg: string, action?: ToastAction) => void
  error: (msg: string, action?: ToastAction) => void
  info: (msg: string, action?: ToastAction) => void
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

  const addToast = useCallback((message: string, type: ToastItem['type'], action?: ToastAction) => {
    const id = ++counter.current
    setToasts(prev => [...prev, { id, message, type, action }])
    // Leave more time to react when an action (e.g. undo) is offered
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, action ? 8000 : 4000)
  }, [])

  const ctx: ToastContextValue = {
    success: (msg, action) => addToast(msg, 'success', action),
    error: (msg, action) => addToast(msg, 'error', action),
    info: (msg, action) => addToast(msg, 'info', action),
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
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  setToasts(prev => prev.filter(x => x.id !== t.id))
                  t.action!.onClick()
                }}
              >{t.action.label}</button>
            )}
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
