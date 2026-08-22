import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import './Toast.css'
import { Icon } from '../Icon/Icon'
import { useLang } from '../../i18n/LanguageContext'

/**
 * The chip that confirms an action — #127.
 *
 * It is the only feedback most git operations give, so three things are load
 * bearing and each one is a decision, not an accident:
 *
 * - **A chip, not a card.** One line, a real icon in the colour of the
 *   outcome, on the ordinary raised surface. The whole surface used to be
 *   tinted per type, which made every confirmation shout as loudly as every
 *   failure. Only the icon carries the colour now.
 * - **An error does not expire.** A success is over the moment it is read and
 *   goes on a timer; a failure is something the user has to act on, and a
 *   message that vanishes on its own is one they may never have read.
 * - **It is announced.** The stack is a live region, so a screen reader says
 *   what happened; errors carry `role="alert"` so they interrupt rather than
 *   wait their turn.
 *
 * Placement is in Toast.css and is also a decision: bottom CENTRE, because
 * bottom-right is where the Commit button lives — the confirmation of what
 * you just did used to cover the control you reach for next.
 *
 * ── THE RULE, written once so it stops being decided per handler ──
 *
 *   A MUTATING action confirms. Something changed — on disk, in the index,
 *   on the remote, in a setting — and the only proof the user gets is this
 *   chip. Its failure says so too, and does not expire.
 *
 *   NAVIGATION does not. Opening a repository, a modal, a diff, a browser or
 *   a terminal is its own confirmation: the screen is already different. A
 *   chip there is noise that pushes a real one off the stack.
 *
 * The awkward cases are the ones where a mutation is ALSO self-evident — a
 * row leaving a list it was just removed from. Those follow navigation: what
 * the user can see, the chip does not need to say. `RightPanel.handle()` is
 * where the staging area applies this, and App.tsx notes the calls where the
 * answer went the other way.
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
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
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
    if (sticky) return
    timers.current.set(id, setTimeout(() => {
      timers.current.delete(id)
      drop(id)
    }, actions?.length ? TOAST_ACTION_TIMEOUT : TOAST_TIMEOUT))
  }, [drop])

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
      ? [...list.current.slice(0, -1), { ...last, count: last.count + 1 }]
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
            // An error interrupts; the rest waits its turn. Nested on purpose
            // — the item's own role is what a reader uses for that node.
            role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="chip-icon"><Icon name={ICONS[t.type]} size={13} /></span>
            <span className="chip-msg">{t.message}</span>
            {t.count > 1 && <span className="chip-count">×{t.count}</span>}
            {t.actions?.map((a, i) => (
              <button
                key={i}
                className="chip-action"
                onClick={() => { drop(t.id); a.onClick() }}
              >{a.label}</button>
            ))}
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
