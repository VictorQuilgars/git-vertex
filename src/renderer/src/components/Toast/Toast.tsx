import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import './Toast.css'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'
import { useJournal } from '../../contexts/JournalContext'

/** Action feedback stays centred, clear of the commit controls. Successes
 * expire; errors and decisions stay until dismissed. Long output is available
 * on demand, and interacting with a notification pauses its countdown.
 */

interface ToastAction {
  label: string
  onClick: () => void
}

// One or several action buttons. `sticky` keeps the chip up until the user
// acts or dismisses it — used for decisions (e.g. "a conflict is coming,
// continue?") that must not silently time out.
type ToastArg = ToastAction | ToastAction[]

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
  actions?: ToastAction[]
  sticky?: boolean
  /** How many times this same message arrived in a row. */
  count: number
}

interface ToastContextValue {
  success: (msg: string, action?: ToastArg, sticky?: boolean) => void
  error: (msg: string, action?: ToastArg, sticky?: boolean) => void
  info: (msg: string, action?: ToastArg, sticky?: boolean) => void
}

/** Read once, then gone. */
export const TOAST_TIMEOUT = 4000
/** Long enough to reach for the action it offers. */
export const TOAST_ACTION_TIMEOUT = 8000
/**
 * Past this, the stack is covering the window it is reporting on. The oldest
 * goes — including an error, which is the one compromise here: an error that
 * has been pushed off by four newer ones is no longer the thing to read.
 */
export const TOAST_STACK_MAX = 4

const ICONS = { success: 'check', error: 'conflict', info: 'info' } as const

const ToastContext = createContext<ToastContextValue>({
  success: () => {},
  error: () => {},
  info: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t: tr } = useLang()  // `t` is already the toast item in the map below
  const journal = useJournal()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const clocks = useRef(new Map<number, { remaining: number; started: number; paused: Set<string> }>())
  // The list, decided outside React's updater. Collapsing a repeat and
  // capping the stack both have to read what is already up, and a state
  // updater is not the place to read from: it may run twice, and it may run
  // late — while the timer this call has to arm is decided now.
  const list = useRef<ToastItem[]>([])

  /** Put a list up, and stop the timers of whatever is no longer in it. */
  const commit = useCallback((next: ToastItem[]) => {
    const kept = new Set(next.map(t => t.id))
    timers.current.forEach((timer, id) => {
      if (!kept.has(id)) { clearTimeout(timer); timers.current.delete(id) }
    })
    clocks.current.forEach((_, id) => { if (!kept.has(id)) clocks.current.delete(id) })
    list.current = next
    setToasts(next)
  }, [])

  const drop = useCallback((id: number) => {
    commit(list.current.filter(t => t.id !== id))
  }, [commit])

  // Nothing may outlive the provider — a timer firing into an unmounted tree
  // is a warning in the console and a leak in the panel, which mounts and
  // unmounts with the view.
  useEffect(() => {
    const pending = timers.current
    return () => { pending.forEach(clearTimeout); pending.clear() }
  }, [])

  /** Start, or restart, a chip's countdown. A sticky chip gets none. */
  const arm = useCallback((id: number, actions: ToastAction[] | undefined, sticky: boolean) => {
    const existing = timers.current.get(id)
    if (existing) { clearTimeout(existing); timers.current.delete(id) }
    const paused = clocks.current.get(id)?.paused ?? new Set<string>()
    clocks.current.delete(id)
    if (sticky) return
    clocks.current.set(id, {
      remaining: actions?.length ? TOAST_ACTION_TIMEOUT : TOAST_TIMEOUT,
      started: Date.now(), paused,
    })
    if (paused.size) return
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id)
      drop(id)
    }, actions?.length ? TOAST_ACTION_TIMEOUT : TOAST_TIMEOUT))
  }, [drop])

  const pause = (id: number, reason: string) => {
    const clock = clocks.current.get(id)
    if (!clock) return
    if (!clock.paused.size) {
      clock.remaining = Math.max(0, clock.remaining - (Date.now() - clock.started))
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
    }
    clock.paused.add(reason)
  }

  const resume = (id: number, reason: string) => {
    const clock = clocks.current.get(id)
    if (!clock || !clock.paused.delete(reason) || clock.paused.size) return
    clock.started = Date.now()
    timers.current.set(id, setTimeout(() => drop(id), clock.remaining))
  }

  const addToast = useCallback((
    message: string, type: ToastItem['type'], action?: ToastArg, sticky?: boolean,
  ) => {
    const actions = action ? (Array.isArray(action) ? action : [action]) : undefined
    // An error waits for the reader; everything else is on a timer. `sticky`
    // still forces it either way, which is what a decision chip needs.
    const stays = sticky ?? type === 'error'

    // The same message twice running is one chip that counts, not two that
    // stack: a loop over ten files should not bury the window. A chip
    // carrying an action is never collapsed — the action belongs to one event.
    const last = list.current[list.current.length - 1]
    const repeat = !!last && last.message === message && last.type === type
      && !last.actions && !actions
    const id = repeat ? last.id : ++counter.current

    const grown = repeat
      ? [...list.current.slice(0, -1), { ...last, sticky: stays, count: last.count + 1 }]
      : [...list.current, { id, message, type, actions, sticky: stays, count: 1 }]
    const next = grown.length > TOAST_STACK_MAX
      ? grown.slice(grown.length - TOAST_STACK_MAX)
      : grown
    commit(next)

    // After the commit, so a repeat restarts its chip's countdown rather than
    // letting the first arrival's deadline stand — and so a chip the cap just
    // pushed off is never armed at all.
    if (next.some(t => t.id === id)) arm(id, actions, stays)
  }, [arm, commit])

  const ctx: ToastContextValue = {
    success: (msg, action, sticky) => addToast(msg, 'success', action, sticky),
    error: (msg, action, sticky) => addToast(msg, 'error', action, sticky),
    info: (msg, action, sticky) => addToast(msg, 'info', action, sticky),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* The container is in the tree from the start and stays there: a live
          region announces what is inserted INTO it, so one created at the same
          moment as its message announces nothing. */}
      <div className="chip-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => (
          <div key={t.id} className={`chip chip--${t.type}`}
            onMouseEnter={() => pause(t.id, 'pointer')}
            onMouseLeave={() => resume(t.id, 'pointer')}
            onFocusCapture={() => pause(t.id, 'focus')}
            onBlurCapture={event => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resume(t.id, 'focus')
            }}
            // An error interrupts; the rest waits its turn. Nested on purpose
            // — the item's own role is what a reader uses for that node.
            role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="chip-icon"><Icon name={ICONS[t.type]} size={16} /></span>
            <div className="chip-body">
              {t.message.length > 180 || t.message.includes('\n') ? (
                <>
                  <span className="chip-msg chip-msg--preview">{t.message.split('\n')[0]}</span>
                  <details className="chip-details">
                    <summary>
                      <span className="chip-details-show">{tr('toast.details')}</span>
                      <span className="chip-details-hide">{tr('toast.hideDetails')}</span>
                    </summary>
                    <div className="chip-output">{t.message}</div>
                  </details>
                </>
              ) : <span className="chip-msg">{t.message}</span>}
              <div className="chip-actions">
                {t.count > 1 && <span className="chip-count">×{t.count}</span>}
                {/* Not a ToastAction: an action would make this chip un-collapsible
                    (a chip carrying one is never merged with its repeat), and ten
                    identical failures would then bury the window they report on. */}
                {t.type === 'error' && journal.enabled && (
                  <button
                    className="chip-journal"
                    title={tr('notifs.openJournal')}
                    onClick={() => journal.setOpen(true)}
                  >{tr('notifs.openJournalShort')}</button>
                )}
                {t.actions?.map((a, i) => (
                  <button
                    key={i}
                    className="chip-action"
                    onClick={() => { drop(t.id); a.onClick() }}
                  >{a.label}</button>
                ))}
              </div>
            </div>
            <button
              className="chip-dismiss"
              title={tr('common.dismiss')}
              aria-label={tr('common.dismiss')}
              onClick={() => drop(t.id)}
            >×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
