import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import { EXT_ROOT } from './roots'
import {
  parseRefChoices, parseHistoryChoices, revisionSections, shortRevision, refChoiceArgs, historyChoiceArgs,
} from '../../revisionChoices'

// The revision picker of #79, without the editor: what git is asked, what its
// answer becomes, and the order a command shows it in.

const US = '\x1f'

suite('revision choices', () => {
  test('branches, remote branches and tags are told apart, by their full name', () => {
    const raw = [
      ['refs/heads/main', 'main', 'abc1234', 'Ship it'].join(US),
      ['refs/remotes/origin/HEAD', 'origin', 'abc1234', 'Ship it'].join(US),
      ['refs/remotes/origin/feat', 'origin/feat', 'def5678', 'Work'].join(US),
      ['refs/tags/v1.2.0', 'v1.2.0', '0123456', ''].join(US),
      '',
    ].join('\n')
    const choices = parseRefChoices(raw)
    assert.deepStrictEqual(choices.map(c => [c.kind, c.ref, c.label]), [
      ['branch', 'refs/heads/main', 'main'],
      ['remote', 'refs/remotes/origin/feat', 'origin/feat'],
      ['tag', 'refs/tags/v1.2.0', 'v1.2.0'],
    ])
    // A tag with no message has no detail line rather than an empty one.
    assert.strictEqual(choices[2].detail, undefined)
  })

  test('a commit is offered by its full hash, read by its short one', () => {
    const full = 'a'.repeat(40)
    const raw = [[full, 'aaaaaaa', 'Fix the parser', 'Ada', '2 days ago'].join(US), 'garbage line', ''].join('\n')
    const [c, ...rest] = parseHistoryChoices(raw)
    assert.strictEqual(rest.length, 0)
    assert.deepStrictEqual(c, { kind: 'commit', ref: full, label: 'aaaaaaa', description: 'Fix the parser', detail: 'Ada, 2 days ago' })
  })

  test('the file\'s own history leads, or the branches do, and an empty section is not drawn', () => {
    const refs = parseRefChoices(['refs/heads/main', 'main', 'abc1234', 's'].join(US))
    const history = parseHistoryChoices(['b'.repeat(40), 'bbbbbbb', 's', 'a', 'now'].join(US))
    assert.deepStrictEqual(revisionSections(refs, history, 'history', 'x.ts').map(s => s.title),
      ['Commits that touched x.ts', 'Branches'])
    assert.deepStrictEqual(revisionSections(refs, history, 'refs', 'x.ts').map(s => s.title),
      ['Branches', 'Commits that touched x.ts'])
  })

  test('a tab names a revision the way a person would', () => {
    assert.strictEqual(shortRevision('c'.repeat(40)), 'ccccccc')
    assert.strictEqual(shortRevision('refs/heads/feature/x'), 'feature/x')
    assert.strictEqual(shortRevision('refs/remotes/origin/main'), 'origin/main')
    assert.strictEqual(shortRevision('refs/tags/v1.0'), 'v1.0')
    assert.strictEqual(shortRevision('HEAD~2'), 'HEAD~2')
  })

  test('the path goes after --, so a file named like an option is still a file', () => {
    const args = historyChoiceArgs('-rf.txt')
    assert.deepStrictEqual(args.slice(-2), ['--', '-rf.txt'])
    assert.ok(refChoiceArgs().includes('refs/tags'))
  })

  test('the three commands are declared, offered on an editor tab, and registered', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(EXT_ROOT, 'package.json'), 'utf8'))
    const ext = fs.readFileSync(path.join(EXT_ROOT, 'src', 'extension.ts'), 'utf8')
    const declared = new Set(pkg.contributes.commands.map((c: { command: string }) => c.command))
    const onTab = new Set(pkg.contributes.menus['editor/title/context'].map((m: { command: string }) => m.command))
    for (const id of ['gitVertex.diffWithRevision', 'gitVertex.diffWithRevisionFrom', 'gitVertex.openFileRevisionFrom']) {
      assert.ok(declared.has(id), `${id} is not in contributes.commands`)
      assert.ok(onTab.has(id), `${id} is not on the editor tab's menu`)
      assert.ok(ext.includes(`registerCommand('${id}'`), `${id} is declared but never registered`)
    }
  })
})
