// What a tag row offers (#288), and — the point of it — the commit each entry
// acts on. An annotated tag is its own object with its own sha, and that sha
// is the one the tag list carries; every commit entry must be given the
// commit the tag resolves to instead.
import { resolveTagCommit, tagMenuItems, tagRef, type TagCommit, type TagMenuActions } from '../tagMenu'
import type { MenuItemDef, MenuAction } from '../../ContextMenu/ContextMenu'
import { translations } from '../../../i18n/translations'

const en = translations.en as Record<string, any>
const t = (key: string, ...args: any[]) => {
  const v = en[key]
  return typeof v === 'function' ? v(...args) : (v ?? key)
}

const COMMIT = 'c'.repeat(40)
// What `git tag --format=%(objectname)` lists for each: the annotated tag's
// own object, and the lightweight tag's commit.
const ANNOTATED = { name: 'v2.0.0', hash: 'a0a0a0a' }
const LIGHTWEIGHT = { name: 'nightly', hash: COMMIT.slice(0, 7) }

const actions = (): TagMenuActions & { tipActions: Required<NonNullable<TagMenuActions['tipActions']>> } => ({
  onCheckoutCommit: jest.fn(), onPush: jest.fn(), onDelete: jest.fn(), onDeleteRemote: jest.fn(),
  onToggleHide: jest.fn(), onToggleSolo: jest.fn(), onCompareHead: jest.fn(), copy: jest.fn(),
  tipActions: {
    onCreateBranchAt: jest.fn(), onCreateTag: jest.fn(), onCreateWorktreeAt: jest.fn(),
    onReset: jest.fn(), onCompareWorking: jest.fn(), onSelectForCompare: jest.fn(),
    onCompareWithSelected: jest.fn(), onCopyFullHash: jest.fn(), compareBaseHash: 'b'.repeat(40),
  },
})

const actionsOf = (items: MenuItemDef[]) => items.filter((i): i is MenuAction => !('separator' in i))
const find = (items: MenuItemDef[], label: string): MenuAction => {
  for (const item of actionsOf(items)) {
    if (item.label === label) return item
    if (item.submenu) {
      const found = actionsOf(item.submenu).find(s => s.label === label)
      if (found) return found
    }
  }
  throw new Error(`no entry "${label}" in ${JSON.stringify(labels(items))}`)
}
const labels = (items: MenuItemDef[]): unknown[] => actionsOf(items).map(i => i.submenu ? [i.label, labels(i.submenu)] : i.label)

describe('tag → commit', () => {
  test("asks for the tag by its full refname, and the message of the COMMIT it names", async () => {
    const api = {
      resolveCommit: jest.fn().mockResolvedValue({ hash: COMMIT }),
      getLastCommitMessage: jest.fn().mockResolvedValue({ message: 'fix: the subject\n\nA body.', hash: COMMIT }),
    }
    await expect(resolveTagCommit(api, 'v2.0.0')).resolves.toEqual({ hash: COMMIT, subject: 'fix: the subject' })
    // `resolveCommit` peels with ^{commit}; the refname keeps a same-named
    // branch from answering for the tag.
    expect(api.resolveCommit).toHaveBeenCalledWith('refs/tags/v2.0.0')
    expect(tagRef('release/1.2')).toBe('refs/tags/release/1.2')
    // The message is asked by the resolved sha, not by the tag again.
    expect(api.getLastCommitMessage).toHaveBeenCalledWith(COMMIT)
  })

  test('a tag that names no commit resolves to nothing, and asks nothing more', async () => {
    const api = { resolveCommit: jest.fn().mockResolvedValue({ hash: null }), getLastCommitMessage: jest.fn() }
    await expect(resolveTagCommit(api, 'gone')).resolves.toBeNull()
    expect(api.getLastCommitMessage).not.toHaveBeenCalled()
  })

  test('a message that cannot be read leaves the commit, without a subject', async () => {
    const api = {
      resolveCommit: jest.fn().mockResolvedValue({ hash: COMMIT }),
      getLastCommitMessage: jest.fn().mockRejectedValue(new Error('not-implemented')),
    }
    await expect(resolveTagCommit(api, 'v2.0.0')).resolves.toEqual({ hash: COMMIT, subject: undefined })
  })
})

describe.each([
  ['an annotated tag', ANNOTATED],
  ['a lightweight tag', LIGHTWEIGHT],
])('the menu of %s', (_kind, tag) => {
  const commit: TagCommit = { hash: COMMIT, subject: 'fix: the subject' }

  test('offers compare, copy, reset and solo beside what it had', () => {
    const items = tagMenuItems(tag, commit, {}, actions(), t)
    expect(labels(items)).toEqual([
      'Check out the commit (detached HEAD)',
      ['Compare', ['Compare with HEAD', 'Compare Working Tree to Here', 'Select for Compare', 'Compare with Selected']],
      ['Copy', ['Copy name', 'Copy Short Hash', 'Copy Full Hash', 'Copy Commit Message']],
      ['Reset Current Branch to This Tag', [
        'Soft — keeps all changes, staged', 'Mixed — keeps your working copy, resets the index', 'Hard — discards all changes',
      ]],
      'Push tag',
      "Solo — Show Only This Tag's History",
      'Hide from Graph',
      'Delete (local)',
      'Delete (remote)',
    ])
  })

  test('every commit entry is given the resolved commit, never the listed object', () => {
    const a = actions()
    const items = tagMenuItems(tag, commit, {}, a, t)
    find(items, 'Compare with HEAD').action!()
    find(items, 'Compare Working Tree to Here').action!()
    find(items, 'Select for Compare').action!()
    find(items, 'Compare with Selected').action!()
    find(items, 'Hard — discards all changes').action!()
    expect(a.onCompareHead).toHaveBeenCalledWith(COMMIT)
    expect(a.tipActions.onCompareWorking).toHaveBeenCalledWith(COMMIT)
    expect(a.tipActions.onSelectForCompare).toHaveBeenCalledWith(COMMIT)
    expect(a.tipActions.onCompareWithSelected).toHaveBeenCalledWith(COMMIT)
    expect(a.tipActions.onReset).toHaveBeenCalledWith(COMMIT, 'hard')
    // The full hash is resolved again by the host, from the tag's refname —
    // the handler a branch row uses, given a name that peels to the commit.
    find(items, 'Copy Full Hash').action!()
    expect(a.tipActions.onCopyFullHash).toHaveBeenCalledWith(`refs/tags/${tag.name}`)
  })

  test("copies its name, the commit's short sha and the commit's subject", () => {
    const writeText = jest.fn()
    Object.assign(navigator, { clipboard: { writeText } })
    const a = actions()
    const items = tagMenuItems(tag, commit, {}, a, t)
    find(items, 'Copy name').action!()
    expect(a.copy).toHaveBeenCalledWith(tag.name)
    find(items, 'Copy Short Hash').action!()
    find(items, 'Copy Commit Message').action!()
    expect(writeText).toHaveBeenNthCalledWith(1, COMMIT.slice(0, 7))
    expect(writeText).toHaveBeenNthCalledWith(2, 'fix: the subject')
  })

  test('solo toggles, and says so when it is on', () => {
    const a = actions()
    const on = find(tagMenuItems(tag, commit, { soloed: true }, a, t), 'Clear Solo')
    expect(on.checked).toBe(true)
    on.action!()
    expect(a.onToggleSolo).toHaveBeenCalledTimes(1)
  })
})

test('a tag that resolved to no commit offers no commit entry', () => {
  const items = tagMenuItems(ANNOTATED, null, {}, actions(), t)
  const flat = JSON.stringify(labels(items))
  for (const gone of ['Compare', 'Copy Full Hash', 'Copy Commit Message', 'Reset Current Branch to This Tag']) {
    expect(flat).not.toContain(gone)
  }
  expect(flat).toContain('Copy name')
  expect(flat).toContain("Solo — Show Only This Tag's History")
})

test('only the entries the host wired are drawn — and none that create at the tag', () => {
  const a = actions()
  const items = tagMenuItems(LIGHTWEIGHT, { hash: COMMIT }, {}, {
    onPush: a.onPush, onDelete: a.onDelete, onDeleteRemote: a.onDeleteRemote, copy: a.copy,
  }, t)
  expect(labels(items)).toEqual([['Copy', ['Copy name', 'Copy Short Hash']], 'Push tag', 'Delete (local)', 'Delete (remote)'])
  // Creating a branch at the tag is its double-click; the tip's create rows are not passed on.
  const all = tagMenuItems(LIGHTWEIGHT, { hash: COMMIT }, {}, a, t)
  expect(JSON.stringify(labels(all))).not.toMatch(/Create/)
})
