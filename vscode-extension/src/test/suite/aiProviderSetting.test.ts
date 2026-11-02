import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { EXT_ROOT } from './roots'
import { AI_PROVIDER_CATALOG } from '../../../../src/renderer/src/utils/aiProviders'

// `gitVertex.aiProvider` is the editor-level pin, and its enum is a SECOND
// list of providers, written in package.json where the catalog cannot reach.
// A value there that the catalog does not know resolves to Groq; a value the
// catalog dropped is a choice in the editor's settings that does nothing.
// Pure — it reads two files — so it runs without a display.

suite('the editor-level provider pin', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'))
  const prop = pkg.contributes.configuration.properties['gitVertex.aiProvider']

  test('every value it offers is a catalog provider', () => {
    const ids = AI_PROVIDER_CATALOG.map(p => p.id)
    for (const v of prop.enum as string[]) assert.ok(ids.includes(v), `${v} is not in the catalog`)
  })

  test('GitHub Copilot can be pinned, and every value says what it needs', () => {
    assert.ok((prop.enum as string[]).includes('copilot'))
    assert.strictEqual(prop.enumDescriptions.length, prop.enum.length)
  })
})
