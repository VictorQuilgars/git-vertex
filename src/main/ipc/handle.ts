// Every IPC handler is registered through this, and the preload sends every
// call with an envelope in front of its arguments: { repo } — the repository
// the window was showing when it asked, or one it named explicitly. The
// envelope is taken off here and turned into the request's context, so a
// handler that reads state.gitService gets the service of THAT repository,
// through every await, without carrying a path itself.
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { runForRepo } from '../sessions'

export interface Envelope { repo?: string | null }

export function handle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
  ipcMain.handle(channel, (event, envelope: Envelope | undefined, ...args: any[]) =>
    runForRepo(envelope?.repo, () => fn(event, ...args)))
}
