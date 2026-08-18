import {
  emptyVisibility, isAnythingHidden, excludeGlobs, isRefHidden,
  type GraphVisibility,
} from '../graphVisibility'

// Hiding was a list of *visible* branches handed to `git log`, which meant it
// could only hide a branch and, because an explicit ref list replaces --all,
// that hiding one branch also dropped every commit only a tag or the stash
// reached. These tests are the shape of what replaced it: state what is hidden,
// and take those tips away from git with --exclude.

const v = (patch: Partial<GraphVisibility> = {}): GraphVisibility => ({ ...emptyVisibility(), ...patch })

describe('excludeGlobs — full refnames, because that is what --all matches', () => {
  test('nothing hidden, nothing excluded', () => {
    expect(excludeGlobs(emptyVisibility())).toEqual([])
    expect(isAnythingHidden(emptyVisibility())).toBe(false)
  })

  test('a local branch, a remote-tracking one, a tag, a whole remote', () => {
    expect(excludeGlobs(v({ branches: new Set(['topic']) }))).toEqual(['refs/heads/topic'])
    expect(excludeGlobs(v({ branches: new Set(['remotes/origin/topic']) }))).toEqual(['refs/remotes/origin/topic'])
    expect(excludeGlobs(v({ tags: new Set(['v1.2.0']) }))).toEqual(['refs/tags/v1.2.0'])
    expect(excludeGlobs(v({ remotes: new Set(['upstream']) }))).toEqual(['refs/remotes/upstream/*'])
  })

  test('each family, hidden wholesale', () => {
    expect(excludeGlobs(v({ families: new Set(['branches']) }))).toEqual(['refs/heads/*'])
    expect(excludeGlobs(v({ families: new Set(['remotes']) }))).toEqual(['refs/remotes/*'])
    expect(excludeGlobs(v({ families: new Set(['tags']) }))).toEqual(['refs/tags/*'])
    // The stash is one ref whose entries are its reflog, so it is all or none.
    expect(excludeGlobs(v({ families: new Set(['stashes']) }))).toEqual(['refs/stash'])
  })

  test('a family swallows the items it already covers', () => {
    const globs = excludeGlobs(v({
      families: new Set(['tags']),
      tags: new Set(['v1', 'v2']),
      branches: new Set(['topic']),
    }))
    expect(globs).toEqual(['refs/tags/*', 'refs/heads/topic'])
  })

  test('hiding all remotes covers a remote branch hidden by name', () => {
    const globs = excludeGlobs(v({
      families: new Set(['remotes']),
      branches: new Set(['remotes/origin/topic', 'local-one']),
      remotes: new Set(['origin']),
    }))
    expect(globs).toEqual(['refs/remotes/*', 'refs/heads/local-one'])
  })
})

describe('isRefHidden — the decorations %D actually hands out', () => {
  test('a tag chip goes when its tag is hidden, or when all tags are', () => {
    expect(isRefHidden('tag: v1.2.0', v({ tags: new Set(['v1.2.0']) }))).toBe(true)
    expect(isRefHidden('tag: v1.2.0', v({ tags: new Set(['v1.3.0']) }))).toBe(false)
    expect(isRefHidden('tag: v1.2.0', v({ families: new Set(['tags']) }))).toBe(true)
  })

  test('a remote branch, by its remote or by its own name', () => {
    expect(isRefHidden('origin/topic', v({ remotes: new Set(['origin']) }))).toBe(true)
    expect(isRefHidden('origin/topic', v({ branches: new Set(['remotes/origin/topic']) }))).toBe(true)
    expect(isRefHidden('remotes/origin/topic', v({ remotes: new Set(['origin']) }))).toBe(true)
    expect(isRefHidden('origin/topic', v({ remotes: new Set(['upstream']) }))).toBe(false)
  })

  // `feature/login` has a slash and is not a remote branch. Only the caller
  // knows which first segments are remotes.
  test('a slash in a local branch name is not a remote', () => {
    const hidden = v({ remotes: new Set(['feature']) })
    expect(isRefHidden('feature/login', hidden, ['origin'])).toBe(false)
    expect(isRefHidden('feature/login', v({ branches: new Set(['feature/login']) }), ['origin'])).toBe(true)
  })

  test('a remote that is not called origin, once the list is passed', () => {
    expect(isRefHidden('upstream/main', v({ remotes: new Set(['upstream']) }), ['origin', 'upstream'])).toBe(true)
    // Without the list we fall back to `origin`, the assumption processRefs
    // has always made — so this one reads as a local branch and stays.
    expect(isRefHidden('upstream/main', v({ remotes: new Set(['upstream']) }))).toBe(false)
  })

  test('the stash, all or none', () => {
    expect(isRefHidden('refs/stash', v({ families: new Set(['stashes']) }))).toBe(true)
    expect(isRefHidden('refs/stash', emptyVisibility())).toBe(false)
  })

  test('where you are standing is never hidden', () => {
    const everything = v({
      families: new Set(['branches', 'remotes', 'tags', 'stashes']),
      branches: new Set(['main']),
    })
    expect(isRefHidden('HEAD -> main', everything)).toBe(false)
    expect(isRefHidden('HEAD', everything)).toBe(false)
    // …but the branch's own chip, when HEAD is elsewhere, goes like any other.
    expect(isRefHidden('main', everything)).toBe(true)
  })

  test('a local branch chip', () => {
    expect(isRefHidden('topic', v({ branches: new Set(['topic']) }))).toBe(true)
    expect(isRefHidden('topic', v({ families: new Set(['branches']) }))).toBe(true)
    expect(isRefHidden('topic', emptyVisibility())).toBe(false)
    expect(isRefHidden('', emptyVisibility())).toBe(false)
  })
})
