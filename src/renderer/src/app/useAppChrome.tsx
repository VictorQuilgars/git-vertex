// What every part of the app talks through: translation, settings, toasts, and the three dialogs (confirm, prompt, choose).
import { useState, useCallback } from 'react'
import { useLang } from '../i18n/LanguageContext'
import { useToast } from '../components/Toast/Toast'
import { useSettings } from '../contexts/SettingsContext'
import { type DialogState } from './shared'

export type ToastAction = { label: string; onClick: () => void }

export function useAppChrome() {
  // ── Dialog state ───────────────────────────────────────────
  const [dlg, setDlg] = useState<DialogState | null>(null)
  const showPrompt = useCallback((message: string, defaultValue = '', multiline = false): Promise<string | null> =>
    new Promise(resolve => setDlg({ kind: 'prompt', message, defaultValue, multiline, resolve }))
  , [])
  const showConfirm = useCallback((message: string, danger = false): Promise<boolean> =>
    new Promise(resolve => setDlg({ kind: 'confirm', message, danger, resolve }))
  , [])
  /** One question, N answers, none of them typed. */
  const showChoice = useCallback((message: string, options: string[]): Promise<string | null> =>
    new Promise(resolve => setDlg({ kind: 'choice', message, options, resolve }))
  , [])
  const closeDlg = useCallback(() => setDlg(null), [])
  // ── Toast (via ToastProvider) ──────────────────────────────
  const toastApi = useToast()
  const { t } = useLang()
  const { get: getSetting } = useSettings()
  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok', action?: ToastAction | ToastAction[], sticky?: boolean) => {
    if (type === 'ok') toastApi.success(msg, action, sticky)
    else toastApi.error(msg, action, sticky)
  }, [toastApi])

  return {
    dlg, setDlg, showPrompt, showConfirm, showChoice, closeDlg, toastApi, t, getSetting, showToast,
  }
}

export type AppChrome = ReturnType<typeof useAppChrome>
