import { modelKind } from '../utils/aiModelKind'

// The heuristic that lets the settings page point at suitable models. It
// labels and suggests, never gates — so the contract is: right on the ids
// that exist today, silent on the ones it cannot read.

describe('what an id says about its model', () => {
  test.each([
    ['openai/gpt-oss-120b', 'reasoning'],
    ['deepseek-r1-distill-llama-70b', 'reasoning'],
    ['o3-mini', 'reasoning'],          // thinks first, however small
    ['qwq-32b', 'reasoning'],
    ['claude-haiku-4-5-20251001', 'fast'],
    ['gemini-2.0-flash', 'fast'],
    ['gpt-4o-mini', 'fast'],
    ['gemini-2.5-flash-lite', 'fast'],
    ['llama-3.1-8b-instant', 'fast'],
  ])('%s → %s', (id, kind) => {
    expect(modelKind(id)).toBe(kind)
  })

  test('an id it cannot read stays unlabelled, never guessed', () => {
    expect(modelKind('llama-3.3-70b-versatile')).toBeUndefined()
    expect(modelKind('claude-opus-5')).toBeUndefined()
    // ge-MINI-: the substring is not the word. This one wore "fast" for a release.
    expect(modelKind('gemini-2.5-pro')).toBeUndefined()
  })
})
