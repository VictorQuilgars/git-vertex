// aiModelKind.ts — what KIND of model an id names, as far as an id can say.
//
// Why this exists: a reasoning model spends its budget thinking before it
// emits anything — the right choice for reading a branch or a conflict, and
// a tax on a feature that answers in one line at every commit. The settings
// page tells the user which temperament suits each feature; this is the
// heuristic that lets it also point at concrete models from the lists the
// connected providers actually serve.
//
// A HEURISTIC, and held to suggestion duty only: it labels options and picks
// candidates, it never gates a choice. Unknown ids stay unlabelled rather
// than guessed.

export type ModelKind = 'reasoning' | 'fast'

const REASONING = /gpt-oss|(^|[^a-z0-9])o[134](-|$)|deepseek-r|qwq|thinking|reason/i
const FAST = /haiku|flash|mini|instant|nano|-[1-9]b\b|small/i

export function modelKind(id: string): ModelKind | undefined {
  // Reasoning wins the tie: `o3-mini` thinks first however small it is.
  if (REASONING.test(id)) return 'reasoning'
  if (FAST.test(id)) return 'fast'
  return undefined
}
