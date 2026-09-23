import * as assert from 'assert'
import {
  resolveSettings, writeSetting, deleteSetting, maskedSettings, migrateSecretsOutOfState,
} from '../../secretStore'

// Where the panel's credentials live. They used to live in `gvSettings` — VS
// Code's globalState, which is NOT encrypted on disk — so every AI key and
// every GitHub token was readable by anything that could read the profile, and
// the panel handed them to its webview besides.
//
// Pure, so it runs without a display: the memento and the secret store are
// both interfaces, and the whole point of the module is which of the two a
// given setting goes to.

const MASK = '••••••••'

/** A memento that is a map, which is all this module asks of one. */
function fakeState(initial: Record<string, string> = {}) {
  let store: Record<string, string> = { ...initial }
  return {
    memento: {
      get: <T>(_k: string, fallback: T): T => (store as unknown as T) ?? fallback,
      update: async (_k: string, value: Record<string, string>) => { store = { ...value } },
    } as any,
    read: () => store,
  }
}

/** A secret store that records what it was asked to keep. */
function fakeSecrets(initial: Record<string, string> = {}) {
  const kept: Record<string, string> = { ...initial }
  return {
    secrets: {
      get: async (k: string) => kept[k],
      store: async (k: string, v: string) => { kept[k] = v },
      delete: async (k: string) => { delete kept[k] },
    },
    kept,
  }
}

suite('the panel’s credential store', () => {
  test('a credential goes to the keychain and leaves a mask behind', async () => {
    const { memento, read } = fakeState()
    const { secrets, kept } = fakeSecrets()
    await writeSetting(memento, secrets, 'aiGroqKey', 'gsk_real')

    // The value the store keeps, and the placeholder the settings map keeps.
    assert.strictEqual(kept['gvSetting:aiGroqKey'], 'gsk_real')
    assert.strictEqual(read().aiGroqKey, MASK)
    assert.ok(!JSON.stringify(read()).includes('gsk_real'))
  })

  test('an ordinary setting never reaches the keychain', async () => {
    const { memento, read } = fakeState()
    const { secrets, kept } = fakeSecrets()
    await writeSetting(memento, secrets, 'aiDefaultModel', 'gpt-4o-mini')
    assert.strictEqual(read().aiDefaultModel, 'gpt-4o-mini')
    assert.deepStrictEqual(Object.keys(kept), [])
  })

  test('resolving puts the credential back where the mask was', async () => {
    const { memento } = fakeState({ aiGroqKey: MASK, theme: 'aqua-dark' })
    const { secrets } = fakeSecrets({ 'gvSetting:aiGroqKey': 'gsk_real' })
    const all = await resolveSettings(memento, secrets)
    assert.strictEqual(all.aiGroqKey, 'gsk_real')
    assert.strictEqual(all.theme, 'aqua-dark')
  })

  test('a credential the store lost resolves to empty, never to the mask', async () => {
    // A mask reaching a provider as a key is a 401 that reads like a bad key —
    // and sends the user to regenerate something that was fine.
    const { memento } = fakeState({ aiGroqKey: MASK })
    const { secrets } = fakeSecrets()
    assert.strictEqual((await resolveSettings(memento, secrets)).aiGroqKey, '')
  })

  test('the mask coming back means "leave it as it is"', async () => {
    const { memento, read } = fakeState({ aiGroqKey: MASK })
    const { secrets, kept } = fakeSecrets({ 'gvSetting:aiGroqKey': 'gsk_real' })
    await writeSetting(memento, secrets, 'aiGroqKey', MASK)
    assert.strictEqual(kept['gvSetting:aiGroqKey'], 'gsk_real')
    assert.strictEqual(read().aiGroqKey, MASK)
  })

  test('clearing a credential removes it from both', async () => {
    const { memento, read } = fakeState({ aiGroqKey: MASK })
    const { secrets, kept } = fakeSecrets({ 'gvSetting:aiGroqKey': 'gsk_real' })
    await writeSetting(memento, secrets, 'aiGroqKey', '')
    assert.deepStrictEqual(Object.keys(kept), [])
    assert.ok(!('aiGroqKey' in read()))
  })

  test('deleting a setting takes its credential with it', async () => {
    const { memento, read } = fakeState({ githubToken: MASK })
    const { secrets, kept } = fakeSecrets({ 'gvSetting:githubToken': 'ghp_real' })
    await deleteSetting(memento, secrets, 'githubToken')
    assert.deepStrictEqual(Object.keys(kept), [])
    assert.ok(!('githubToken' in read()))
  })

  test('what the webview sees carries no credential at all', async () => {
    const { memento } = fakeState({ aiGroqKey: MASK, githubToken: MASK, theme: 'aqua-dark' })
    const masked = maskedSettings(memento)
    assert.strictEqual(masked.aiGroqKey, MASK)
    assert.strictEqual(masked.githubToken, MASK)
    assert.strictEqual(masked.theme, 'aqua-dark')
  })

  suite('moving what an older version left in globalState', () => {
    test('every credential moves, and the settings map keeps only masks', async () => {
      const { memento, read } = fakeState({
        aiGroqKey: 'gsk_plain', aiMistralKey: 'mk_plain', githubToken: 'ghp_plain',
        theme: 'aqua-dark', aiDefaultModel: 'gpt-4o-mini',
      })
      const { secrets, kept } = fakeSecrets()
      const moved = await migrateSecretsOutOfState(memento, secrets)

      assert.deepStrictEqual(moved.sort(), ['aiGroqKey', 'aiMistralKey', 'githubToken'])
      assert.strictEqual(kept['gvSetting:aiMistralKey'], 'mk_plain')
      assert.strictEqual(kept['gvSetting:githubToken'], 'ghp_plain')
      // Nothing readable is left behind — the point of the whole exercise.
      const left = JSON.stringify(read())
      for (const secret of ['gsk_plain', 'mk_plain', 'ghp_plain']) {
        assert.ok(!left.includes(secret), `${secret} is still in globalState`)
      }
      assert.strictEqual(read().theme, 'aqua-dark')
    })

    test('running twice moves nothing the second time', async () => {
      const { memento } = fakeState({ aiGroqKey: 'gsk_plain' })
      const { secrets } = fakeSecrets()
      assert.deepStrictEqual(await migrateSecretsOutOfState(memento, secrets), ['aiGroqKey'])
      assert.deepStrictEqual(await migrateSecretsOutOfState(memento, secrets), [])
    })

    test('an empty credential is not something to move', async () => {
      const { memento } = fakeState({ aiXaiKey: '', aiOpenaiKey: '' })
      const { secrets, kept } = fakeSecrets()
      assert.deepStrictEqual(await migrateSecretsOutOfState(memento, secrets), [])
      assert.deepStrictEqual(Object.keys(kept), [])
    })

    test('a store with nothing in it is left alone', async () => {
      const { memento } = fakeState({ theme: 'aqua-dark' })
      const { secrets } = fakeSecrets()
      assert.deepStrictEqual(await migrateSecretsOutOfState(memento, secrets), [])
    })

    test('the custom-provider blob counts, since its entries carry keys', async () => {
      const blob = JSON.stringify([{ id: 'gw', baseUrl: 'https://gw/v1', key: 'k_plain' }])
      const { memento, read } = fakeState({ aiCustomProviders: blob })
      const { secrets, kept } = fakeSecrets()
      assert.deepStrictEqual(await migrateSecretsOutOfState(memento, secrets), ['aiCustomProviders'])
      assert.ok(!JSON.stringify(read()).includes('k_plain'))
      assert.ok(kept['gvSetting:aiCustomProviders'].includes('k_plain'))
    })
  })
})
