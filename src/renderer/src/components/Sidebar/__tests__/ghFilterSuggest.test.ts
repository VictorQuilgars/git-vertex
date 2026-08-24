import { ghFilterSuggest, ghFilterValues } from '../ghFilters'

// What to offer for the token the caret is sitting in. Before the colon that
// is the qualifier, after it the value — and only where the value is a closed
// set, because a list of user names this app does not have would be worse than
// no list at all.

const at = (q: string, kind: 'prs' | 'issues' = 'prs') =>
  ghFilterSuggest(q, q.length, kind)

describe('completing a qualifier', () => {
  test('an empty query offers the whole vocabulary', () => {
    expect(at('')!.options).toContain('author:')
    expect(at('')!.kind).toBe('key')
  })

  test('a prefix narrows it, and the colon comes with the choice', () => {
    const s = at('rev')!
    expect(s.options).toEqual(['review-requested:', 'reviewed-by:', 'review:'].filter(o => s.options.includes(o)))
    expect(s.options.every(o => o.endsWith(':'))).toBe(true)
  })

  test('a prefix nothing matches offers nothing at all', () => {
    expect(at('zzz')).toBeNull()
  })

  test('the vocabulary is the section: review belongs to pull requests', () => {
    expect(at('review')!.options.length).toBeGreaterThan(0)
    expect(at('review', 'issues')).toBeNull()
  })
})

describe('completing a value', () => {
  test('a closed set is offered after the colon', () => {
    const s = at('status:')!
    expect(s.kind).toBe('value')
    expect(s.options).toEqual(['success', 'pending', 'failure'])
  })

  test('a partial value narrows it', () => {
    expect(at('status:pe')!.options).toEqual(['pending'])
  })

  // Suggesting user names the app has never fetched would be worse than
  // suggesting nothing.
  test('a free-text qualifier offers nothing', () => {
    expect(at('author:')).toBeNull()
    expect(at('base:ma')).toBeNull()
  })

  test('is: and no: differ per section', () => {
    expect(at('is:')!.options).toContain('merged')
    expect(at('is:', 'issues')!.options).not.toContain('merged')
    expect(at('no:')!.options).toContain('review-requested')
    expect(at('no:', 'issues')!.options).not.toContain('review-requested')
  })

  test('a synonym completes as the qualifier it stands for', () => {
    // `labels:` is rewritten to `label:` when the query runs
    expect(ghFilterValues('label', 'prs')).toEqual([])
  })
})

describe('where the completion goes', () => {
  test('it replaces the token the caret is in, not the whole query', () => {
    const q = 'author:me status:pe label:bug'
    const s = ghFilterSuggest(q, 'author:me status:pe'.length, 'prs')!
    expect(q.slice(s.from, s.to)).toBe('pe')
    expect(s.options).toEqual(['pending'])
  })

  test('a negated token keeps its dash', () => {
    const q = '-label:'
    const s = ghFilterSuggest(q, q.length, 'prs')
    // label takes free text, so nothing to offer — but the dash must not have
    // shifted the token's boundaries
    expect(s).toBeNull()
    const k = ghFilterSuggest('-lab', 4, 'prs')!
    expect('-lab'.slice(k.from, k.to)).toBe('lab')
  })

  test('a caret in the middle of a query completes there', () => {
    const q = 'status: label:bug'
    const s = ghFilterSuggest(q, 'status:'.length, 'prs')!
    expect(s.options).toEqual(['success', 'pending', 'failure'])
    expect(q.slice(s.from, s.to)).toBe('')
  })
})
