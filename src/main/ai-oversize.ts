// ai-oversize.ts — the request the model would not take, said in words the
// user can act on (#185 P2).
//
// Measured, not imagined: asking for the *Complete* level on a 28,000-character
// branch, against the provider this repository's own settings point at, came
// back as
//
//   Request too large for model `openai/gpt-oss-120b` in organization
//   org_01k… service tier `on_demand` on tokens per minute (TPM): Limit 8000,
//   Requested 10013, please reduce your message size and try again.
//
// and that string is what the app showed. It names an organization id, a
// service tier and a unit nobody chose, and it does not name the one thing
// that caused it or the one control that fixes it. Worse, the retry loop then
// sent the same oversized request twice more, half a second apart: three
// certain failures where one was already certain.
//
// So this classifies the refusal and hands back a sentence that says what was
// sent, what the ceiling was, and which control to move — the shape #183
// settled on for a truncated ANSWER, applied to a prompt that never left.
//
// Free of `electron` and `vscode`: both products meet the same providers.

import { type DiffDetail, lessDetail } from './ai-diff'

/** A refusal for size, with whatever numbers the provider chose to give. */
export interface Oversize {
  /** The ceiling, in tokens, when the provider names one. */
  limit?: number
  /** What the request came to, when the provider names it. */
  requested?: number
}

/**
 * The phrases that mean "this prompt does not fit", across the providers.
 *
 * Deliberately several independent shapes rather than one clever regex: these
 * are five vendors' prose, they are rewritten without notice, and a classifier
 * that misses is only back to today's raw string.
 *
 * A plain rate limit is NOT one of these. "Rate limit reached … Limit 30000,
 * Requested 500" means wait, and waiting is exactly what the retry loop does;
 * turning that into "your diff is too big" would send someone to a setting
 * that cannot help. Hence the requirement of a size phrase, never of numbers
 * alone.
 */
const SIZE_PHRASES = [
  /maximum context length/i,
  /context[ _-]?length[ _-]?exceeded/i,
  /exceeds? the (maximum )?(number of )?(input )?tokens/i,
  /input token count/i,
  /prompt is too long/i,
  /request too large/i,
  /reduce (the length of )?(your |the )?(message|messages|prompt|input)/i,
  /too many tokens/i,
  /(exceeds|larger than) the (available |maximum )?context/i,
]

/** Where each provider hides the two numbers, when it gives them at all. */
const NUMBERS: Array<{ re: RegExp; limit: 1 | 2; requested: 1 | 2 }> = [
  // Groq: "… (TPM): Limit 8000, Requested 10013, please reduce …"
  { re: /Limit (\d+), Requested (\d+)/i, limit: 1, requested: 2 },
  // OpenAI: "maximum context length is 8192 tokens. However, your messages
  // resulted in 10013 tokens."
  { re: /maximum context length is (\d+) tokens?[\s\S]*?resulted in (\d+) tokens?/i, limit: 1, requested: 2 },
  // Anthropic: "prompt is too long: 250000 tokens > 200000 maximum"
  { re: /(\d+) tokens? > (\d+) maximum/i, limit: 2, requested: 1 },
  // Google: "The input token count (1234567) exceeds the maximum number of
  // tokens allowed (1048576)."
  { re: /input token count \((\d+)\)[\s\S]*?allowed \((\d+)\)/i, limit: 2, requested: 1 },
]

/**
 * Read a provider's refusal. `null` means "not about size" — which includes
 * every ordinary rate limit, and is what keeps the retry loop doing its job.
 */
export function readOversize(message: string): Oversize | null {
  if (!message || !SIZE_PHRASES.some(re => re.test(message))) return null
  for (const { re, limit, requested } of NUMBERS) {
    const m = message.match(re)
    if (m) return { limit: Number(m[limit]), requested: Number(m[requested]) }
  }
  return {}
}

const thousands = (n: number): string => n.toLocaleString('en-US')

/**
 * The provider's own words, kept but bounded.
 *
 * They are worth keeping — every account's ceiling is different, and the
 * sentence above cannot know whether this one came from a context window or a
 * per-minute cap. They are not worth an upsell and a billing URL inside a
 * one-line error, which is what Groq appends.
 */
const clip = (raw: string, max = 200): string =>
  raw.length > max ? raw.slice(0, max).trimEnd() + '…' : raw

/**
 * The sentence the user reads instead.
 *
 * It names the model, the two numbers when there are two, and ONE control
 * — the one that would actually make this request smaller. A message offering
 * three settings is a message nobody acts on.
 */
export function oversizeMessage(o: Oversize, ctx: {
  model: string
  /** The level this feature was sent at, when it carries a diff at all. */
  detail?: DiffDetail
  /** Reply headroom, whose tokens count against the same ceiling. */
  headroom?: number
  /** The provider's own words, kept — the limits differ per account. */
  raw: string
}): string {
  const size = o.requested && o.limit
    ? `${thousands(o.requested)} tokens against a limit of ${thousands(o.limit)}`
    : 'more than it takes'

  const fix = advice(ctx.detail)
  // The reply's ceiling is part of the same request on a per-minute cap, so
  // it is worth a clause — but never the headline: the diff is the large half.
  const also = (ctx.headroom ?? 1) > 1
    ? ` Its reply length is set to ${ctx.headroom}× as well, which is part of the same total.`
    : ''

  return `${ctx.model} would not take this request — ${size}. ${fix}${also} (${clip(ctx.raw)})`
}

function advice(detail?: DiffDetail): string {
  const next = detail ? lessDetail(detail) : null
  if (!detail) {
    return 'There is no diff to send less of here, so this needs a model with more room — Settings › AI Assistant.'
  }
  if (!next) {
    return 'The model is already being sent the file list alone, so the change is simply larger than it can hold: '
      + 'this needs a model with more room, in Settings › AI Assistant.'
  }
  if (next === 'standard') {
    return 'The whole diff is being sent. Set "What the model sees" to Standard for this feature in '
      + 'Settings › AI Assistant and it will be shared across every file instead of sent entire.'
  }
  return 'Set "What the model sees" to Summary for this feature in Settings › AI Assistant and the model gets '
    + 'the list of files and their line counts rather than their contents.'
}
