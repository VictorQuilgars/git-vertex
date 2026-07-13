// Brand logos for AI co-authors that don't have a GitHub account (Claude,
// ChatGPT/OpenAI, Gemini). Returned as a data-URI so both the commit detail
// panel (<img>) and the graph node (<image>) can use it directly, skipping the
// GitHub/Gravatar resolution. Co-authors with a real GitHub account (e.g.
// Copilot, via its users.noreply.github.com email) are resolved normally and
// must NOT be listed here.

const svgUri = (svg: string): string =>
  'data:image/svg+xml;base64,' + btoa(svg)

// Anthropic / Claude — clay tile with the white radiating sunburst mark.
function claudeSvg(): string {
  const rays = Array.from({ length: 12 }, (_, i) =>
    `<rect x='23' y='5' width='2' height='11' rx='1' transform='rotate(${i * 30} 24 24)'/>`
  ).join('')
  return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>`
    + `<rect width='48' height='48' rx='9' fill='#D97757'/>`
    + `<g fill='#fff'>${rays}</g></svg>`
}

// OpenAI / ChatGPT — black tile with a white six-fold knot approximation.
function openaiSvg(): string {
  const petals = Array.from({ length: 6 }, (_, i) =>
    `<rect x='22.2' y='9' width='3.6' height='14' rx='1.8' transform='rotate(${i * 60} 24 24)'/>`
  ).join('')
  return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>`
    + `<rect width='48' height='48' rx='9' fill='#10A37F'/>`
    + `<g fill='#fff'>${petals}<circle cx='24' cy='24' r='3.4'/></g></svg>`
}

// Google Gemini — blue tile with a white four-point spark.
function geminiSvg(): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'>`
    + `<rect width='48' height='48' rx='9' fill='#1A73E8'/>`
    + `<path fill='#fff' d='M24 10c.8 6.8 3.2 9.2 10 10-6.8.8-9.2 3.2-10 10-.8-6.8-3.2-9.2-10-10 6.8-.8 9.2-3.2 10-10z'/>`
    + `</svg>`
}

let cache: Record<string, string> | null = null
function brands(): Record<string, string> {
  if (!cache) cache = { claude: svgUri(claudeSvg()), openai: svgUri(openaiSvg()), gemini: svgUri(geminiSvg()) }
  return cache
}

export function aiAvatarDataUri(name: string, email: string): string | null {
  const n = (name || '').toLowerCase()
  const e = (email || '').toLowerCase()
  const b = brands()
  if (e.includes('anthropic.com') || n.includes('claude')) return b.claude
  if (e.includes('openai.com') || n.includes('chatgpt') || n.includes('openai')) return b.openai
  if (n.includes('gemini') || e.includes('gemini')) return b.gemini
  return null
}
