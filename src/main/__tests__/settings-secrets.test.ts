import { SECRET_MASK, SECRET_KEYS, isSecretSetting, unsealedSecrets, maskSecrets, openSecrets, resolveSecretWrite, sealSecrets, type Cipher } from '../settings-secrets'
import { AI_PROVIDER_CATALOG } from '../../renderer/src/utils/aiProviders'

// A cipher that is not the Keychain: reversible, visibly not the input.
const reversing: Cipher = {
  available: () => true,
  seal: v => Buffer.from(v).toString('base64'),
  open: v => Buffer.from(v, 'base64').toString(),
}
const unavailable: Cipher = { available: () => false, seal: () => { throw new Error('no') }, open: () => { throw new Error('no') } }

describe('secrets at rest', () => {
  test('a secret is sealed on write and opened on read; the rest of the file is untouched', () => {
    const written = sealSecrets({ githubToken: 'ghp_abc', aiOpenaiKey: 'sk-1', theme: 'aqua-dark', autoFetchInterval: '5' }, reversing)
    expect(written.githubToken).toMatch(/^enc:v1:/)
    expect(written.githubToken).not.toContain('ghp_abc')
    expect(written.theme).toBe('aqua-dark')
    expect(written.autoFetchInterval).toBe('5')
    expect(openSecrets(written, reversing)).toEqual({ githubToken: 'ghp_abc', aiOpenaiKey: 'sk-1', theme: 'aqua-dark', autoFetchInterval: '5' })
  })

  test('a file written in clear by an older version reads as it is, and is sealed by the next write', () => {
    const clear = { githubToken: 'ghp_old' }
    expect(openSecrets(clear, reversing)).toEqual(clear)
    expect(sealSecrets(clear, reversing).githubToken).toMatch(/^enc:v1:/)
    expect(sealSecrets(sealSecrets(clear, reversing), reversing)).toEqual(sealSecrets(clear, reversing))  // not sealed twice
  })

  test('with no protected storage the file stays in clear, and a sealed value reads as absent rather than garbage', () => {
    expect(sealSecrets({ githubToken: 'ghp_x' }, unavailable).githubToken).toBe('ghp_x')
    expect(openSecrets({ githubToken: 'enc:v1:whatever' }, unavailable).githubToken).toBe('')
    const broken: Cipher = { ...reversing, open: () => { throw new Error('key changed') } }
    expect(openSecrets({ githubToken: 'enc:v1:abc' }, broken).githubToken).toBe('')
  })

  test('the custom providers blob is sealed whole', () => {
    const blob = JSON.stringify([{ id: 'local', baseUrl: 'http://localhost:1234/v1', key: 'k1' }])
    const written = sealSecrets({ aiCustomProviders: blob }, reversing)
    expect(written.aiCustomProviders).not.toContain('k1')
    expect(openSecrets(written, reversing).aiCustomProviders).toBe(blob)
  })
})

describe('secrets toward the window', () => {
  test('a set secret is a mask, an unset one is what it was', () => {
    const shown = maskSecrets({ githubToken: 'ghp_abc', aiOpenaiKey: '', theme: 'aqua-dark' })
    expect(shown.githubToken).toBe(SECRET_MASK)
    expect(shown.aiOpenaiKey).toBe('')
    expect(shown.theme).toBe('aqua-dark')
  })

  test('each custom provider key is masked inside the blob, keyless ones left alone', () => {
    const shown = maskSecrets({ aiCustomProviders: JSON.stringify([{ id: 'a', baseUrl: 'x', key: 'k' }, { id: 'b', baseUrl: 'y', key: '' }]) })
    expect(JSON.parse(shown.aiCustomProviders)).toEqual([{ id: 'a', baseUrl: 'x', key: SECRET_MASK }, { id: 'b', baseUrl: 'y', key: '' }])
  })

  test('a mask sent back keeps what is stored; a new value replaces it; an empty one clears it', () => {
    const stored = { githubToken: 'ghp_abc' }
    expect(resolveSecretWrite(stored, 'githubToken', SECRET_MASK)).toBeNull()
    expect(resolveSecretWrite(stored, 'githubToken', 'ghp_new')).toBe('ghp_new')
    expect(resolveSecretWrite(stored, 'githubToken', '')).toBe('')
    expect(resolveSecretWrite(stored, 'theme', 'aqua-light')).toBe('aqua-light')
  })

  test('a masked provider key is restored from the stored entry with the same id', () => {
    const stored = { aiCustomProviders: JSON.stringify([{ id: 'a', baseUrl: 'x', key: 'k-a' }]) }
    const sent = JSON.stringify([
      { id: 'a', baseUrl: 'x2', key: SECRET_MASK },      // edited URL, untouched key
      { id: 'b', baseUrl: 'y', key: 'k-b' },             // new entry with its key
      { id: 'c', baseUrl: 'z', key: SECRET_MASK },       // masked but never stored: no key
    ])
    expect(JSON.parse(resolveSecretWrite(stored, 'aiCustomProviders', sent)!)).toEqual([
      { id: 'a', baseUrl: 'x2', key: 'k-a' },
      { id: 'b', baseUrl: 'y', key: 'k-b' },
      { id: 'c', baseUrl: 'z', key: '' },
    ])
  })
})

describe('which settings are credentials — derived, never listed', () => {
  const { AI_PROVIDER_CATALOG } = require('../../renderer/src/utils/aiProviders')

  test("every provider's key setting is a secret, including the ones added later", () => {
    // The failure this replaces: the list was written by hand when there were
    // four providers. #169 made adding a cloud a catalog LINE — and four keys
    // (Mistral, DeepSeek, xAI, OpenRouter) then went to disk in clear and
    // reached the window unmasked, because nobody edited a second list.
    for (const p of AI_PROVIDER_CATALOG) {
      if (!p.keySetting) continue
      expect(isSecretSetting(p.keySetting)).toBe(true)
    }
  })

  test('a provider added tomorrow is sealed by arriving, not by being remembered', () => {
    expect([...SECRET_KEYS]).toEqual(expect.arrayContaining(
      AI_PROVIDER_CATALOG.map((p: any) => p.keySetting).filter(Boolean)))
  })

  test('the legacy spellings no catalog entry names are still secrets', () => {
    // Written by versions that predate the pair rework; a file from one of
    // them must not be read back into the clear.
    expect(isSecretSetting('groqApiKey')).toBe(true)
    expect(isSecretSetting('geminiApiKey')).toBe(true)
  })

  test('a key already sitting in clear is sealed the next time anything saves', () => {
    const cipher = { available: () => true, seal: (v: string) => `S(${v})`, open: (v: string) => v.slice(2, -1) }
    const sealed = sealSecrets({ aiMistralKey: 'mk_plain', aiDeepseekKey: 'sk_plain' }, cipher)
    expect(sealed.aiMistralKey).toBe('enc:v1:S(mk_plain)')
    expect(sealed.aiDeepseekKey).toBe('enc:v1:S(sk_plain)')
  })

  test('and it is masked on its way to the window', () => {
    const masked = maskSecrets({ aiOpenrouterKey: 'sk-or-plain', aiXaiKey: 'xai-plain' })
    expect(masked.aiOpenrouterKey).toBe(SECRET_MASK)
    expect(masked.aiXaiKey).toBe(SECRET_MASK)
  })
})

describe('what an older version left in clear', () => {
  test('a secret with a value that is not sealed is named', () => {
    expect(unsealedSecrets({
      aiMistralKey: 'mk_plain', aiGroqKey: 'enc:v1:xxxx', theme: 'aqua-dark',
    })).toEqual(['aiMistralKey'])
  })

  test('an empty secret is not an exposure — there is nothing there', () => {
    expect(unsealedSecrets({ aiXaiKey: '', aiDeepseekKey: '' })).toEqual([])
  })

  test('a non-secret setting is never named, whatever it holds', () => {
    expect(unsealedSecrets({ gitBinaryPath: '/usr/bin/git', aiDefaultModel: 'gpt-4o-mini' })).toEqual([])
  })

  test('the blob of custom providers counts, since it carries keys', () => {
    expect(unsealedSecrets({ aiCustomProviders: '[{"id":"gw","key":"k"}]' })).toEqual(['aiCustomProviders'])
  })

  test('every provider the catalog knows can be caught by it', () => {
    // The four that shipped unsealed for six releases, and the one that made
    // them visible: this is the list the startup pass has to be able to find.
    const all = Object.fromEntries(AI_PROVIDER_CATALOG
      .filter((p: any) => p.keySetting).map((p: any) => [p.keySetting, 'in-clear']))
    expect(unsealedSecrets(all).sort())
      .toEqual(Object.keys(all).sort())
  })
})
