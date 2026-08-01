import { parseAutolinks, serializeAutolinks, findAutolinks } from '../utils/autolinks'

const JIRA = { prefix: 'JIRA-', url: 'https://jira.example.com/browse/JIRA-<num>' }
const GH = { prefix: '#', url: 'https://github.com/o/r/issues/<num>' }

describe('parseAutolinks — user-entered configuration', () => {
  test('reads what it can', () => {
    expect(parseAutolinks(JSON.stringify([JIRA, GH]))).toEqual([JIRA, GH])
  })

  // One malformed row should cost that row, not the feature.
  test('drops rows it cannot use, keeps the rest', () => {
    const raw = JSON.stringify([
      JIRA,
      { prefix: '', url: 'https://x/<num>' },        // no prefix
      { prefix: 'A-', url: '' },                     // no url
      { prefix: 'B-', url: 'https://x/always' },     // no <num>: every ref, one page
      'nonsense',
      GH,
    ])
    expect(parseAutolinks(raw)).toEqual([JIRA, GH])
  })

  test('survives anything that is not a list of rows', () => {
    expect(parseAutolinks('')).toEqual([])
    expect(parseAutolinks(null)).toEqual([])
    expect(parseAutolinks('{')).toEqual([])
    expect(parseAutolinks('{"prefix":"A-"}')).toEqual([])
  })

  test('round-trips, dropping what it would refuse to read back', () => {
    const kept = parseAutolinks(serializeAutolinks([JIRA, { prefix: 'B-', url: 'no-placeholder' }]))
    expect(kept).toEqual([JIRA])
  })
})

describe('findAutolinks', () => {
  test('finds a reference and builds its URL', () => {
    expect(findAutolinks('fix JIRA-421 at last', [JIRA])).toEqual([
      { index: 4, text: 'JIRA-421', number: 421, url: 'https://jira.example.com/browse/JIRA-421' },
    ])
  })

  test('several, left to right, without overlapping', () => {
    const found = findAutolinks('JIRA-1 and #2', [JIRA, GH])
    expect(found.map(m => m.text)).toEqual(['JIRA-1', '#2'])
  })

  // With both GH- and G- configured, GH-4 is a GH reference — not a G reference
  // to "H-4", which is what a first-match-wins loop would produce.
  test('the longest prefix wins', () => {
    const links = [{ prefix: 'G-', url: 'g/<num>' }, { prefix: 'GH-', url: 'gh/<num>' }]
    expect(findAutolinks('GH-4', links)).toEqual([
      { index: 0, text: 'GH-4', number: 4, url: 'gh/4' },
    ])
  })

  test('a reference must not start mid-word, nor after a slash', () => {
    expect(findAutolinks('abcJIRA-1', [JIRA])).toEqual([])
    expect(findAutolinks('path/to#1', [GH])).toEqual([])
    // …but ordinary punctuation before it is fine.
    expect(findAutolinks('(#1)', [GH]).map(m => m.text)).toEqual(['#1'])
  })

  test('a reference must not be glued to word characters after its digits', () => {
    expect(findAutolinks('#1a', [GH])).toEqual([])
    expect(findAutolinks('JIRA-12x', [JIRA])).toEqual([])
  })

  test('a prefix with regex characters is matched literally', () => {
    const weird = { prefix: 'C++-', url: 'x/<num>' }
    expect(findAutolinks('see C++-7', [weird]).map(m => m.text)).toEqual(['C++-7'])
    // And the pattern must not match what the characters would mean as a regex.
    expect(findAutolinks('see CCC-7', [weird])).toEqual([])
  })

  test('nothing configured, nothing found', () => {
    expect(findAutolinks('JIRA-1 #2', [])).toEqual([])
    expect(findAutolinks('', [JIRA])).toEqual([])
  })
})
