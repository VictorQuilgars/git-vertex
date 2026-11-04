import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { EXT_ROOT } from './roots'
import { prepareDirDiff, WORKING } from '../../dirDiff'

// The two folders handed to an external compare tool (#79): only what the
// comparison touches, each side as it is there — an added file absent on the
// left, a deleted one absent on the right, a rename under its old name and
// its new one. On a real repository.

suite('folder comparison — the two trees', () => {
  let dir = ''
  let tmp = ''
  let a = '', b = ''
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  const write = (rel: string, body: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), body)
  }
  const files = (root: string): string[] => {
    const out: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name)
        if (e.isDirectory()) walk(p)
        else out.push(path.relative(root, p).split(path.sep).join('/'))
      }
    }
    walk(root)
    return out.sort()
  }

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-dirdiff-repo-'))
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-dirdiff-out-'))
    execFileSync('git', ['init', '-q', '-b', 'main', dir])
    git('config', 'user.email', 't@t'); git('config', 'user.name', 'T')
    write('same.txt', 'never changes\n')
    write('edit.txt', 'one\n')
    write('gone.txt', 'bye\n')
    write('old/name.txt', 'a body long enough to be the same file\nline two\nline three\n')
    write('bin.dat', Buffer.from([0, 1, 2, 255, 254]))
    git('add', '-A'); git('commit', '-q', '-m', 'a')
    a = git('rev-parse', 'HEAD').trim()
    write('edit.txt', 'one\ntwo\n')
    write('new/added.txt', 'hello\n')
    fs.rmSync(path.join(dir, 'gone.txt'))
    fs.mkdirSync(path.join(dir, 'moved'))
    fs.renameSync(path.join(dir, 'old/name.txt'), path.join(dir, 'moved/name.txt'))
    write('bin.dat', Buffer.from([0, 1, 2, 255, 253]))
    git('add', '-A'); git('commit', '-q', '-m', 'b')
    b = git('rev-parse', 'HEAD').trim()
  })
  suiteTeardown(() => { for (const d of [dir, tmp]) fs.rmSync(d, { recursive: true, force: true }) })

  test('two commits: only what differs, each side as it was', async () => {
    const d = await prepareDirDiff(dir, a, b, tmp)
    assert.deepStrictEqual(files(d.leftDir), ['bin.dat', 'edit.txt', 'gone.txt', 'old/name.txt'])
    assert.deepStrictEqual(files(d.rightDir), ['bin.dat', 'edit.txt', 'moved/name.txt', 'new/added.txt'])
    assert.strictEqual(fs.readFileSync(path.join(d.leftDir, 'edit.txt'), 'utf8'), 'one\n')
    assert.strictEqual(fs.readFileSync(path.join(d.rightDir, 'edit.txt'), 'utf8'), 'one\ntwo\n')
    // Bytes, not text: a binary file reaches the tool as it is.
    assert.deepStrictEqual([...fs.readFileSync(path.join(d.rightDir, 'bin.dat'))], [0, 1, 2, 255, 253])
    assert.strictEqual(d.files, 5)
  })

  test('against the working tree, the right side is what is on disk now', async () => {
    write('edit.txt', 'one\ntwo\nthree, not committed\n')
    try {
      const d = await prepareDirDiff(dir, b, WORKING, tmp)
      assert.deepStrictEqual(files(d.leftDir), ['edit.txt'])
      assert.strictEqual(fs.readFileSync(path.join(d.rightDir, 'edit.txt'), 'utf8'), 'one\ntwo\nthree, not committed\n')
      assert.ok(path.basename(d.rightDir) === 'working')
    } finally {
      git('checkout', '--', 'edit.txt')
    }
  })

  test('nothing differs: two empty folders, and the caller is told so', async () => {
    const d = await prepareDirDiff(dir, b, b, tmp)
    assert.strictEqual(d.files, 0)
    assert.notStrictEqual(d.leftDir, d.rightDir)
  })

  test('the four commands are declared and registered, two on a graph row', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'))
    const ext = fs.readFileSync(path.join(EXT_ROOT, 'src', 'extension.ts'), 'utf8')
    const declared = new Set(pkg.contributes.commands.map((c: { command: string }) => c.command))
    for (const id of ['diffDirectory', 'diffDirectoryWithHead', 'openDirectoryDiff', 'openDirectoryDiffWithWorking']) {
      assert.ok(declared.has(`gitVertex.${id}`), id)
      assert.ok(ext.includes(`registerCommand('gitVertex.${id}'`), `${id} is never registered`)
    }
    const onRow = new Set(pkg.contributes.menus['webview/context'].map((m: { command: string }) => m.command))
    for (const id of ['openDirectoryDiff', 'openDirectoryDiffWithWorking']) assert.ok(onRow.has(`gitVertex.commitMenu.${id}`), id)
  })
})
