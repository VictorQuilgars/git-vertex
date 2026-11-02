// copilotLm.ts — the `copilot` dialect in the extension host: GitHub Copilot
// through VS Code's Language Model API (`vscode.lm`), the editor's own,
// supported way for an extension to use the Copilot subscription the user is
// signed into. No key, no URL, no dependency: the desktop drives the Copilot
// CLI for the same dialect (src/main/ai-copilot.ts), and the catalog line is
// shared.
//
// Reached through `(vscode as any).lm`, feature-detected, rather than typed:
// the API is stable from VS Code 1.90, and the extension still declares 1.85.
// Raising `engines` to type one provider would drop every user on 1.85–1.89
// for a feature most of them never switch on; the row says what to do instead.
import * as vscode from 'vscode'

/** The slice of `vscode.lm` this file uses — the stable 1.90 shape. */
interface LmChat {
  id: string
  family: string
  vendor: string
  sendRequest(
    messages: unknown[], options?: { justification?: string }, token?: vscode.CancellationToken,
  ): Thenable<{ text: AsyncIterable<string> }>
}
interface LmApi {
  selectChatModels(selector?: { vendor?: string; id?: string; family?: string }): Thenable<LmChat[]>
}

export const COPILOT_EDITOR_TOO_OLD =
  'GitHub Copilot models need VS Code 1.90 or later — update the editor to use them here.'
export const COPILOT_NO_MODELS =
  'No GitHub Copilot model is available in this editor. Install the GitHub Copilot Chat extension and sign in, then try again.'

const REPLY_TIMEOUT_MS = 120_000

/**
 * A failure that asking again will not fix — no model, no consent, an editor
 * too old. Marked so the retry loop stops at once: a declined consent retried
 * is the same dialog shown three times.
 */
export class CopilotSetupError extends Error {
  readonly fatal = true
}

function lm(): LmApi | null {
  const api = (vscode as any).lm
  const msg = (vscode as any).LanguageModelChatMessage
  return api && typeof api.selectChatModels === 'function' && msg?.User ? api : null
}

/** The ids a picker should offer — deduplicated and sorted, like every other provider's. */
export function copilotModelIds(models: ReadonlyArray<{ id?: string }>): string[] {
  return [...new Set(models.map(m => m?.id).filter((id): id is string => typeof id === 'string' && !!id))].sort()
}

/**
 * The editor's error, said as what to do. `vscode.LanguageModelError` carries a
 * code; NoPermissions is the consent the user declined (or was never asked
 * for), which VS Code lets them change from the Accounts menu.
 */
export function copilotErrorMessage(e: any): string {
  const code = typeof e?.code === 'string' ? e.code : ''
  if (code === 'NoPermissions') {
    return 'Git Vertex is not allowed to use GitHub Copilot\'s models. Allow it when VS Code asks, '
      + 'or under Accounts › Manage Language Model Access, then try again.'
  }
  if (code === 'Blocked') return `GitHub Copilot refused the request${e?.message ? ` — ${e.message}` : ''}. Wait a moment, or choose another model.`
  if (code === 'NotFound') return `That GitHub Copilot model is no longer available${e?.message ? ` — ${e.message}` : ''}. Choose another in Settings › AI Assistant.`
  return e?.message ?? String(e)
}

/** The models the editor offers under the user's Copilot sign-in — the row's probe. */
export async function listCopilotModels(): Promise<{ models?: string[]; error?: string }> {
  const api = lm()
  if (!api) return { error: COPILOT_EDITOR_TOO_OLD }
  try {
    const models = copilotModelIds(await api.selectChatModels({ vendor: 'copilot' }))
    return models.length ? { models } : { error: COPILOT_NO_MODELS }
  } catch (e: any) {
    return { error: copilotErrorMessage(e) }
  }
}

/** One prompt, one answer. The first call is the one VS Code asks consent on. */
export async function callCopilot(model: string, prompt: string): Promise<{ text: string; truncated: boolean }> {
  const api = lm()
  if (!api) throw new CopilotSetupError(COPILOT_EDITOR_TOO_OLD)
  // A stored id first; a family second, for a pair saved under a family name
  // the editor later started answering with versioned ids. No model at all is
  // the editor-level pin `gitVertex.aiProvider: copilot` with `aiModel` left
  // empty: the first model the editor offers, as its description says.
  let chat: LmChat | undefined
  if (model) {
    ;[chat] = await api.selectChatModels({ vendor: 'copilot', id: model })
    if (!chat) [chat] = await api.selectChatModels({ vendor: 'copilot', family: model })
  } else {
    chat = [...await api.selectChatModels({ vendor: 'copilot' })].sort((a, b) => a.id.localeCompare(b.id))[0]
  }
  if (!chat) {
    const any = await api.selectChatModels({ vendor: 'copilot' })
    throw new CopilotSetupError(any.length
      ? `GitHub Copilot does not offer ${model} in this editor. Choose another model in Settings › AI Assistant.`
      : COPILOT_NO_MODELS)
  }
  const cancel = new vscode.CancellationTokenSource()
  const timer = setTimeout(() => cancel.cancel(), REPLY_TIMEOUT_MS)
  try {
    const res = await chat.sendRequest(
      [(vscode as any).LanguageModelChatMessage.User(prompt)],
      { justification: 'Git Vertex uses GitHub Copilot to write commit messages, explanations and descriptions.' },
      cancel.token,
    )
    let text = ''
    for await (const part of res.text) text += part
    // The API reports no length cut-off; an empty answer is the retry loop's.
    return { text: text.trim(), truncated: false }
  } catch (e: any) {
    if (cancel.token.isCancellationRequested) throw new Error(`GitHub Copilot did not answer within ${REPLY_TIMEOUT_MS / 1000} s.`)
    const code = typeof e?.code === 'string' ? e.code : ''
    throw code === 'NoPermissions' || code === 'NotFound'
      ? new CopilotSetupError(copilotErrorMessage(e))
      : new Error(copilotErrorMessage(e))
  } finally {
    clearTimeout(timer)
    cancel.dispose()
  }
}
