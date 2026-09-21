/**
 * Point a branch at a remote branch — the act, wherever it is offered (#308).
 *
 * It existed in the side bar alone, as `Change Upstream…` (#280), and the
 * reference card's pencil ran something else entirely: `setUpstream(branch)`
 * with no target, which can only ever set `<default remote>/<same name>`. On a
 * branch nobody has published that is a branch the remote does not have, so the
 * pencil — the universal sign for *edit this* — could only fail. Two acts, one
 * icon, and the weaker one behind it.
 *
 * A hook rather than a handler inside the side bar, because the card that
 * offers the same act is mounted by the host, outside that panel — the same
 * reason `usePullRequestCode` is one.
 *
 * The remote branches are LISTED in the prompt rather than left to be typed
 * from memory, and the current upstream is what it opens on: changing it is
 * usually a correction of one, not an invention.
 */
import { useCallback } from 'react'

export interface ChangeUpstreamDeps {
  t: (key: any, ...args: any[]) => string
  showToast: (msg: string, type?: 'ok' | 'err') => void
  showPrompt: (message: string, initial?: string) => Promise<string | null>
  /** The lists are stale the moment it succeeds. */
  onDone?: () => void
}

/** How many remote branches the prompt shows — a list, not a directory. */
export const UPSTREAM_CHOICES = 40

export function useChangeUpstream({ t, showToast, showPrompt, onDone }: ChangeUpstreamDeps) {
  return useCallback(async (branch: string, currentUpstream = '') => {
    const { branches: remotes } = await window.gitAPI.listRemoteBranches().catch(() => ({ branches: [] as string[] }))
    const shown = remotes.slice(0, UPSTREAM_CHOICES).join('\n')
    const answer = await showPrompt(
      shown ? `${t('sb.branch.upstreamPrompt')}\n\n${shown}` : t('sb.branch.upstreamPrompt'),
      currentUpstream,
    )
    const target = answer?.trim()
    if (!target || target === currentUpstream) return
    const r = await window.gitAPI.setUpstream(branch, target)
    // The refusal is git-core's sentence — "origin/x is not on the remote —
    // publish x to create it" — and it is shown as it came: it names the act
    // that fixes it, which "could not set upstream" does not.
    if (r.success) { showToast(t('sb.branch.upstreamSet', branch, target)); onDone?.() }
    else showToast(t('toast.err', r.error ?? ''), 'err')
  }, [t, showToast, showPrompt, onDone])
}
