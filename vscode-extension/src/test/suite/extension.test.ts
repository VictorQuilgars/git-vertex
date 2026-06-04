import * as assert from 'assert'
import * as vscode from 'vscode'

suite('Extension activation', () => {
  test('Extension is present', () => {
    const ext = vscode.extensions.getExtension('VictorQuilgars.git-vertex')
    assert.ok(ext, 'Extension not found — check publisher/name in package.json')
  })

  test('Extension activates without error', async () => {
    const ext = vscode.extensions.getExtension('VictorQuilgars.git-vertex')
    if (!ext) { return } // covered by previous test
    await ext.activate()
    assert.ok(ext.isActive, 'Extension did not activate')
  })

  test('Commands are registered after activation', async () => {
    const all = await vscode.commands.getCommands(true)
    const expected = ['gitVertex.open', 'gitVertex.openFile', 'gitVertex.configure']
    for (const cmd of expected) {
      assert.ok(all.includes(cmd), `Command "${cmd}" not registered`)
    }
  })

  test('Configuration defaults are correct', () => {
    const cfg = vscode.workspace.getConfiguration('gitVertex')
    assert.strictEqual(cfg.get('appPath'), '')
    assert.strictEqual(cfg.get('showStatusBar'), true)
  })
})
