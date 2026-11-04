/**
 * What "open every change at once" opens (#284) — the renderer's copy of
 * `ChangeSetSpec` in `src/main/git-core.ts`, which the panel's host answers.
 * Structural, so the two cannot disagree without a compile error on the host.
 */
export type ChangeSetSpec =
  | { kind: 'range'; base: string; head: string; axis: 'diverged' | 'endpoints' }
  | { kind: 'stash'; index: number }

export type OpenAllChanges = (spec: ChangeSetSpec, title: string) => void

type HostOpenAll = (spec: ChangeSetSpec, title: string) => Promise<{ success: boolean; error?: string } | undefined>

/**
 * The host's multi-file diff, or null where it has none.
 *
 * The VS Code panel's host opens the editor's own multi-diff view; the desktop
 * has no such editor and its preload no such method — and a row is offered
 * only where something real is behind it, so `null` means the row is absent.
 * A refusal (an old VS Code, a stash that is gone) is handed to `onError`.
 */
export function hostOpenAllChanges(onError: (message: string) => void): OpenAllChanges | null {
  const fn = (window.gitAPI as any)?.openAllChanges as HostOpenAll | undefined
  if (typeof fn !== 'function') return null
  return (spec, title) => {
    void fn(spec, title)
      .then(r => { if (r && r.success === false) onError(r.error ?? '') })
      .catch(e => onError(String(e?.message ?? e)))
  }
}

/**
 * What a branch's changes are measured against: the checked-out branch for
 * any other one, the repository's merge target for the checked-out one — and
 * nothing when the branch is that target itself, where "its changes" means
 * nothing and no row should promise them.
 */
export function branchChangesBase(branch: string, current: boolean, currentBranch: string, mergeTarget?: string | null): string | null {
  const base = current ? mergeTarget : currentBranch
  return base && base !== branch ? base : null
}
