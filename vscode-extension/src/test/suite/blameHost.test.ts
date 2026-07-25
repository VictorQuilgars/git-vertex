import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execSync } from 'child_process'
import * as vscode from 'vscode'
import { InlineBlameController } from '../../blame/inlineBlame'
import { BlameCodeLensProvider } from '../../blame/codeLens'

// Runs inside the extension host: covers the wiring the pure unit tests can't
// see — command registration, decoration types, the CodeLens provider being
// able to answer for a real TextDocument.

suite('blame — extension host wiring', () => {
  let tmpDir: string
  let document: vscode.TextDocument
  let controller: InlineBlameController
  let codeLens: BlameCodeLensProvider

  suiteSetup(async () => {
    // The test host opens no folder, so nothing has triggered the extension's
    // workspaceContains:.git activation event yet.
    await vscode.extensions.getExtension('VictorQuilgars.git-vertex')?.activate()

    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-blame-host-')))
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Ada', GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_AUTHOR_DATE: '2024-01-01T10:00:00+00:00',
      GIT_COMMITTER_NAME: 'Ada', GIT_COMMITTER_EMAIL: 'ada@example.com',
      GIT_COMMITTER_DATE: '2024-01-01T10:00:00+00:00',
    }
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' })
    execSync('git config user.email "ada@example.com"', { cwd: tmpDir, stdio: 'ignore' })
    execSync('git config user.name "Ada"', { cwd: tmpDir, stdio: 'ignore' })
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'one\ntwo\nthree\n')
    execSync('git add -A', { cwd: tmpDir, stdio: 'ignore' })
    execSync('git commit -m "first"', { cwd: tmpDir, stdio: 'ignore', env })

    document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(tmpDir, 'file.txt')))
    await vscode.window.showTextDocument(document)
    controller = new InlineBlameController()
    codeLens = new BlameCodeLensProvider(controller)
  })

  suiteTeardown(async () => {
    codeLens?.dispose()
    controller?.dispose()
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  test('blame commands are registered', async () => {
    const all = await vscode.commands.getCommands(true)
    for (const cmd of ['gitVertex.toggleLineBlame', 'gitVertex.toggleFileBlame',
      'gitVertex.toggleCodeLens', 'gitVertex.blame.copyHash']) {
      assert.ok(all.includes(cmd), `Command "${cmd}" not registered`)
    }
  })

  test('blame settings expose their defaults', () => {
    const cfg = vscode.workspace.getConfiguration('gitVertex')
    assert.strictEqual(cfg.get('blame.line.enabled'), true)
    assert.strictEqual(cfg.get('blame.messageLength'), 60)
    assert.strictEqual(cfg.get('blame.heatmap.ageThresholdDays'), 90)
    assert.deepStrictEqual(cfg.get('codeLens.scopes'), ['document', 'containers'])
  })

  test('blame resolves for an open document', async () => {
    const lines = await controller.getBlame(document)
    assert.strictEqual(lines.length, 3)
    assert.strictEqual(lines[0].author, 'Ada')
    assert.strictEqual(lines[0].summary, 'first')
  })

  test('a second read of the same version is served from cache', async () => {
    const first = controller.getBlame(document)
    const second = controller.getBlame(document)
    assert.deepStrictEqual(await first, await second)
  })

  test('rendering annotations does not throw, in either mode', async () => {
    const editor = vscode.window.visibleTextEditors.find(e => e.document.uri.fsPath === document.uri.fsPath)
    assert.ok(editor, 'Expected the test file to be visible')
    await controller.render(editor)
    controller.toggleFileBlame(editor)
    await controller.render(editor)
    controller.toggleFileBlame(editor)
    await controller.render(editor)
  })

  test('toggling line blame flips its state', () => {
    const before = controller.isLineBlameEnabled()
    controller.toggleLineBlame()
    assert.strictEqual(controller.isLineBlameEnabled(), !before)
    controller.toggleLineBlame()
    assert.strictEqual(controller.isLineBlameEnabled(), before)
  })

  test('CodeLens answers with a document-level lens', async () => {
    const lenses = await codeLens.provideCodeLenses(document, new vscode.CancellationTokenSource().token)
    assert.ok(lenses.length >= 1, 'Expected at least the document lens')
    const lens = lenses[0]
    assert.strictEqual(lens.range.start.line, 0)
    assert.ok(lens.command?.title.includes('Ada'), `Unexpected title: ${lens.command?.title}`)
    assert.strictEqual(lens.command?.command, 'gitVertex.fileHistory')
  })

  test('CodeLens returns nothing while disabled', async () => {
    codeLens.toggle()
    const lenses = await codeLens.provideCodeLenses(document, new vscode.CancellationTokenSource().token)
    codeLens.toggle()
    assert.deepStrictEqual(lenses, [])
  })

  test('files outside a repository produce no blame', async () => {
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gv-nonrepo-')))
    fs.writeFileSync(path.join(outside, 'plain.txt'), 'x\n')
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(outside, 'plain.txt')))
    assert.deepStrictEqual(await controller.getBlame(doc), [])
    fs.rmSync(outside, { recursive: true, force: true })
  })
})
