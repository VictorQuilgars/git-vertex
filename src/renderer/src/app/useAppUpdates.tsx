// The update overlay and the notification bell.
import { useState, useCallback } from 'react'
import { AppNotification } from '../components/NotificationCenter/NotificationCenter'
import type { AppChrome } from './useAppChrome'
import type { RepoSession } from './useRepoSession'
import type { AppGithub } from './useAppGithub'
import type { AppConflicts } from './useAppConflicts'
import type { AppAi } from './useAppAi'
import type { AppTabs } from './useAppTabs'

// `_app`, underscored: every hook in the chain takes what came before it, and
// this one currently reads none of it. The parameter stays so the shape of the
// chain is uniform; the underscore says the emptiness is deliberate.
export function useAppUpdates(_app: AppChrome & RepoSession & AppGithub & AppConflicts & AppAi & AppTabs) {
  // Update overlay state machine: available → downloading → installing.
  const [updatePhase, setUpdatePhase] = useState<'idle' | 'available' | 'downloading' | 'installing'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updatePct, setUpdatePct] = useState(0)
  const [updateOverlayOpen, setUpdateOverlayOpen] = useState(false)
  // Notification center (bell in the top bar). Persisted in localStorage so
  // notifications survive restarts.
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try { return JSON.parse(localStorage.getItem('notifications') ?? '[]') } catch { return [] }
  })
  // The bell's open state is NOT here: it moved to the journal context (#193),
  // which is mounted above the toasts so an error chip can link to its own
  // entry. `unreadCount` is still only the update notifications — App adds the
  // shown repository's unseen errors to it for the badge.
  const unreadCount = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0)
  // Add a notification, de-duplicated by kind+version so re-checks don't stack.
  const addUpdateNotification = useCallback((version: string) => {
    setNotifications(prev => {
      if (prev.some(n => n.kind === 'update' && n.data?.version === version)) return prev
      const next: AppNotification = {
        id: `update-${version}-${Date.now()}`,
        kind: 'update', data: { version }, ts: Date.now(), read: false,
      }
      return [next, ...prev]
    })
  }, [])
  const startUpdateDownload = useCallback(() => {
    setUpdatePct(0)
    setUpdatePhase('downloading')
    ;(window.gitAPI as any).downloadUpdate?.()
  }, [])

  return {
    updatePhase, setUpdatePhase, updateVersion, setUpdateVersion, updatePct, setUpdatePct, updateOverlayOpen, setUpdateOverlayOpen, notifications, setNotifications, unreadCount, addUpdateNotification, startUpdateDownload,
  }
}

export type AppUpdates = ReturnType<typeof useAppUpdates>
