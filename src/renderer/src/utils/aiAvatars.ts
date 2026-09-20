import claude from '../assets/ai-avatars/claude.svg'
import openai from '../assets/ai-avatars/openai.svg'
import gemini from '../assets/ai-avatars/gemini.svg'

// Official product marks, bundled for offline use in both HTML avatars and
// SVG graph nodes. Source URLs and display adaptations live beside the assets.
const svgUri = (svg: string): string =>
  'data:image/svg+xml;base64,' + btoa(svg)

function avatar(svg: string): string {
  // A neutral tile and inset keep each mark readable in light/dark themes and
  // inside the circular clipping used by the graph. The artwork is unchanged.
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">`
    + `<rect width="48" height="48" fill="#fff"/>`
    + `<image x="5" y="5" width="38" height="38" href="${svgUri(svg)}"/>`
    + `</svg>`)
}

const brands = { claude: avatar(claude), openai: avatar(openai), gemini: avatar(gemini) }

export function aiAvatarDataUri(name: string, email: string): string | null {
  const n = (name || '').trim().toLowerCase()
  const e = (email || '').trim().toLowerCase()
  const domain = e.split('@')[1] ?? ''
  // GitHub identities (including Copilot) have real avatars of their own.
  if (domain === 'users.noreply.github.com') return null
  if (domain === 'anthropic.com' || /^(claude)(?:$|\s+(?:code|opus|sonnet|haiku|\d)\b)/.test(n)) return brands.claude
  if (domain === 'openai.com' || /^(chatgpt|openai|codex)(?:$|\s+\d)/.test(n)) return brands.openai
  if (/^gemini(?:$|\s+(?:cli|code|\d)\b)/.test(n)
    || (domain === 'google.com' && e.startsWith('gemini'))) return brands.gemini
  return null
}
