// Every IPC handler is registered through this, and the preload sends every
// call with an envelope in front of its arguments: { repo } — the repository
// the window was showing when it asked, or one it named explicitly. The
// envelope is taken off here and turned into the request's context, so a
// handler that reads state.gitService gets the service of THAT repository,
// through every await, without carrying a path itself.
//
// It is also where the arguments are looked at before a handler sees them
// (ipc/validate.ts): the last line of the hardening the audit asked for was the
// door itself, since the checks that existed were per method and by memory. A
// refused argument answers `{ error }` — the shape every other refusal has —
// and never becomes a rejected promise across the bridge.
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { runForRepo, sessionFor } from '../sessions'
import { argError, envelopeError } from './validate'

export interface Envelope { repo?: string | null }

export function handle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, (event, envelope: Envelope | undefined, ...args: any[]) => {
    const badEnvelope = envelopeError(envelope?.repo)
    if (badEnvelope) return { success: false, error: badEnvelope }
    return runForRepo(envelope?.repo, () => {
      // The repository of THIS request, so "inside the repository" is measured
      // against the one the call is about rather than the one on screen.
      const bad = argError(channel, args, sessionFor()?.path ?? null)
      if (bad) return { success: false, error: bad }
      return fn(event, ...args)
    })
  })
}
