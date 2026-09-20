import { aiAvatarDataUri } from '../aiAvatars'

describe('AI co-author avatars', () => {
  test.each([
    ['Claude', 'noreply@anthropic.com'],
    ['Claude Opus 4.1', ''],
    ['ChatGPT', ''],
    ['Codex', ''],
    ['OpenAI', 'agent@openai.com'],
    ['Gemini CLI', ''],
    ['Gemini', 'gemini@google.com'],
  ])('%s has an embedded logo without an avatar lookup', (name, email) => {
    const uri = aiAvatarDataUri(name, email)!
    expect(uri).toMatch(/^data:image\/svg\+xml;base64,/)
    const svg = atob(uri.split(',')[1])
    expect(svg).toContain('data:image/svg+xml;base64,')
    expect(svg).not.toContain('href="https://')
  })

  test('provider identities and model names resolve to the same artwork', () => {
    expect(aiAvatarDataUri('Claude Sonnet 4', '')).toBe(aiAvatarDataUri('', 'NOREPLY@ANTHROPIC.COM'))
    expect(aiAvatarDataUri(' Codex ', '')).toBe(aiAvatarDataUri('ChatGPT', ''))
  })

  test.each([
    ['Claude Martin', 'claude@example.com'],
    ['Alice', 'alice@anthropic.com.example.org'],
    ['Alice', 'gemini-fan@example.com'],
    ['Copilot', '175728472+Copilot@users.noreply.github.com'],
    ['Claude', '123+claude@users.noreply.github.com'],
  ])('preserves the normal avatar resolution for %s <%s>', (name, email) => {
    expect(aiAvatarDataUri(name, email)).toBeNull()
  })
})
