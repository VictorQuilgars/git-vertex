/**
 * What an error says, without the wrapper the desktop's IPC puts around it.
 *
 * A handler that throws in the main process reaches the window as
 * `Error invoking remote method 'git:list-worktrees': Error: <the message>` —
 * Electron names the channel and the error's class in front of the message.
 * That is a fact about the plumbing, and a person reading a list that failed to
 * load has no use for the channel name; the VS Code panel's host answers the
 * bare message, so the same failure read differently in the two products.
 *
 * Only that wrapper goes, and the generic `Error: ` right behind it. A more
 * specific class (`TypeError: …`) is worth keeping and is kept.
 */
const IPC_WRAPPER = /^(?:Error: )?Error invoking remote method '[^']*': (?:Error: )?/

export function plainError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(IPC_WRAPPER, '')
}
