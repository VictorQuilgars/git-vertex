import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { EXT_ROOT } from './roots'
import {
  rootId, treePath, parseTreePath, lsTreeArgs, parseLsTree, baseName, isSymlink, treeFolderName,
} from '../../revisionTree'

// The repository at a revision, as a folder (#72) — the half of the file
// system provider that needs no editor: its URIs, and what `ls-tree` says,
// asked the way the provider asks it, of a real repository.

const H = 'a'.repeat(40)

suite('revision tree — URIs', () => {
  test('a path into the tree is the commit, then the path in the repository', () => {
    assert.strictEqual(treePath(H), `/${H}`)
    assert.strictEqual(treePath(H, 'src/a.ts'), `/${H}/src/a.ts`)
    assert.deepStrictEqual(parseTreePath(`/${H}/src/a.ts`), { commit: H, rel: 'src/a.ts' })
    assert.deepStrictEqual(parseTreePath(`/${H}`), { commit: H, rel: '' })
    assert.deepStrictEqual(parseTreePath(`/${H}/`), { commit: H, rel: '' })
  })

  test('what is not a full hash, or climbs out, is no path into the tree', () => {
    assert.strictEqual(parseTreePath('/main/src'), null)
    assert.strictEqual(parseTreePath('/abc1234/src'), null)
    assert.strictEqual(parseTreePath(`/${H}/../etc/passwd`), null)
  })

  test('a root has one id, the same in every window', () => {
    assert.strictEqual(rootId('/work/repo'), rootId('/work/repo'))
    assert.notStrictEqual(rootId('/work/repo'), rootId('/work/other'))
    assert.match(rootId('/work/repo'), /^[0-9a-f]{12}$/)
  })

  test('the workspace folder says which repository, at which commit', () => {
    assert.strictEqual(treeFolderName('/work/repo', H), 'repo @ aaaaaaa')
    assert.strictEqual(treeFolderName('C:\\work\\repo\\', H, 'aaaaaaa^'), 'repo @ aaaaaaa^')
  })
})

suite('revision tree — ls-tree, on a real repository', () => {
  let dir = ''
  let head = ''
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
  const ls = (rel: string, asFolder: boolean) => parseLsTree(git(...lsTreeArgs(head, rel, asFolder)))

  suiteSetup(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-tree-'))
    execFileSync('git', ['init', '-q', '-b', 'main', dir])
    git('config', 'user.email', 't@t'); git('config', 'user.name', 'T')
    fs.mkdirSync(path.join(dir, 'src', 'deep'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'README.md'), 'hello\n')
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1\n')
    fs.writeFileSync(path.join(dir, 'src', 'deep', 'b.ts'), 'b\n')
    if (process.platform !== 'win32') {
      fs.writeFileSync(path.join(dir, 'odd\tname.txt'), 'tab\n')
      fs.symlinkSync('README.md', path.join(dir, 'link'))
    }
    git('add', '-A')
    // A submodule is a gitlink: a commit of another repository, held by hash.
    git('update-index', '--add', '--cacheinfo', `160000,${'b'.repeat(40)},vendor/lib`)
    git('commit', '-q', '-m', 'tree')
    head = git('rev-parse', 'HEAD').trim()
  })
  suiteTeardown(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  test('the root lists its entries, folders as trees, with sizes for files', () => {
    const root = ls('', true)
    const byName = Object.fromEntries(root.map(e => [baseName(e.path), e]))
    assert.strictEqual(byName['src'].type, 'tree')
    assert.strictEqual(byName['vendor'].type, 'tree')
    assert.strictEqual(byName['README.md'].type, 'blob')
    assert.strictEqual(byName['README.md'].size, 6)
  })

  test('a folder asked as an entry is the folder itself; asked as a folder, its contents', () => {
    const self = ls('src', false)
    assert.deepStrictEqual(self.map(e => [e.path, e.type]), [['src', 'tree']])
    const inside = ls('src', true)
    assert.deepStrictEqual(inside.map(e => [baseName(e.path), e.type]).sort(), [['a.ts', 'blob'], ['deep', 'tree']])
  })

  test('a submodule is a commit, which the provider shows as an empty folder', () => {
    const [sub] = ls('vendor/lib', false)
    assert.strictEqual(sub.type, 'commit')
  })

  test('a name with a tab is one name; a symbolic link says it is one', function () {
    if (process.platform === 'win32') { this.skip(); return }
    const root = ls('', true)
    assert.ok(root.some(e => e.path === 'odd\tname.txt'))
    const link = root.find(e => e.path === 'link')!
    assert.ok(isSymlink(link))
  })

  test('what does not exist at the commit is nothing, not an error', () => {
    assert.deepStrictEqual(ls('nope', false), [])
  })
})

suite('revision tree — wiring', () => {
  test('the scheme activates the extension, and the commands are declared and registered', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'))
    const ext = fs.readFileSync(path.join(EXT_ROOT, 'src', 'extension.ts'), 'utf8')
    // A new window opened on a tree has no repository to activate on.
    assert.ok(pkg.activationEvents.includes('onFileSystem:gitvertex-tree'))
    const declared = new Set(pkg.contributes.commands.map((c: { command: string }) => c.command))
    for (const id of ['browseRepoAtRevision', 'browseRepoAtRevisionInNewWindow', 'browseRepoBeforeRevision', 'browseRepoBeforeRevisionInNewWindow']) {
      assert.ok(declared.has(`gitVertex.${id}`), id)
      assert.ok(ext.includes(`registerCommand('gitVertex.${id}'`), `${id} is never registered`)
    }
    const onRow = new Set(pkg.contributes.menus['webview/context'].map((m: { command: string }) => m.command))
    for (const id of ['browseAt', 'browseAtNewWindow', 'browseBefore', 'browseBeforeNewWindow']) {
      assert.ok(onRow.has(`gitVertex.commitMenu.${id}`), `${id} is not on a graph row's menu`)
      assert.ok(declared.has(`gitVertex.commitMenu.${id}`), id)
    }
    assert.ok(/registerRevisionFileSystem\(context\)/.test(ext))
  })
})
