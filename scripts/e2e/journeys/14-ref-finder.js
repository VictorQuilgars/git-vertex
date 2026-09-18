// #252, #253: `/` finds a branch, a tag or a worktree from the graph. It is a
// type-ahead — the graph goes to the best match as it is typed and Enter takes
// it — and a tip beyond the loaded page is reached by growing the page, the way
// a search hit is. `?` lists the graph's keys.
'use strict'
const FIND = '.cg-reffind:not(.cg-reffind--closed)'
module.exports = {
  name: 'the finder reaches a branch on the page and a tag beyond it',
  async run({ page, expect, fixture }) {
    const { repo3 } = fixture
    const history = () => `document.querySelector('.sb-history')?.textContent ?? ''`
    const selected = () => page.eval(`document.querySelector('.cg-row.cg-selected')?.textContent ?? ''`)
    await page.click('.app-tab')
    // The previous journey closes a tab on its way out, and that settles a moment later:
    // until the graph is alpha's, a key or a click would land on the repository that is leaving.
    await page.until(`/of alpha|from a terminal|from the suite/.test(document.querySelector('.cg-body')?.textContent ?? '') && document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'alpha'`, { what: 'the graph of the first repository' })
    // A retry may find a field holding the focus, which would swallow the key.
    await page.eval(`document.activeElement?.blur?.()`)

    // On the page: the branch `feature` sits on a row the graph holds.
    await page.press('/')
    await page.until(`!!document.querySelector(${JSON.stringify(FIND)})`, { what: 'the finder open' })
    expect(await page.eval(`document.activeElement === document.querySelector('.cg-reffind-input')`), 'the focus is in the finder\'s field')
    await page.type('feat')
    await page.until(`document.querySelector('.cg-reffind-hit')?.textContent === 'feature'`, { what: 'the match named under the field' })
    await page.until(`!!document.querySelector('.cg-row--find-hit')`, { what: 'the graph standing on the match', timeoutMs: 5000 })
    expect(!(await selected()), 'typing selects nothing')
    await page.press('Enter')
    await page.until(`!document.querySelector(${JSON.stringify(FIND)})`, { what: 'the finder closed by Enter' })
    expect(/commit 3 of alpha/.test(await selected()), 'Enter took the match as the selection')
    await page.press('Escape')

    // Beyond the page: the tag is 900 commits back in a graph that holds 500.
    await page.click('.tb-repo-btn')
    await page.until(`!!document.querySelector('.tb-recent-path[title=${JSON.stringify(repo3)}]')`, { what: 'the deep repository in the recents' })
    await page.click(`.tb-recent-path[title=${JSON.stringify(repo3)}]`)
    await page.until(`document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'gamma' && /^500 commits loaded/.test(${history()})`, { what: 'the first page of the deep repository', timeoutMs: 20000 })
    await page.eval(`document.activeElement?.blur?.()`)
    await page.press('/')
    await page.until(`!!document.querySelector(${JSON.stringify(FIND)})`, { what: 'the finder open on the deep repository' })
    await page.eval(`(() => { const i = document.querySelector('.cg-reffind-input'); i.focus(); i.select() })()`)
    await page.type('v-deep')
    await page.until(`document.querySelector('.cg-reffind-hit--unloaded')?.textContent === 'v-deep'`, { what: 'the tag named, and said to be off the page' })
    await page.press('Enter')
    await page.until(`/^1000 commits loaded/.test(${history()})`, { what: 'the page grown to the tag', timeoutMs: 30000 })
    await page.until(`/commit 300 of gamma/.test(document.querySelector('.cg-row.cg-selected')?.textContent ?? '')`, { what: 'the tag\'s commit selected', timeoutMs: 10000 })
    await page.until(`!document.querySelector(${JSON.stringify(FIND)})`, { what: 'the finder closed once the row arrived' })

    // `?`: the keys on one sheet, `t` beside `h`, `u` and `w`; Escape closes it and nothing else.
    await page.eval(`document.activeElement?.blur?.()`)
    await page.press('?')
    await page.until(`!!document.querySelector('.cg-keys')`, { what: 'the key sheet' })
    const keys = await page.eval(`[...document.querySelectorAll('.cg-keys kbd')].map(k => k.textContent).join(' ')`)
    expect(/w h u t/.test(keys), `the sheet lists the jumps together: ${keys}`)
    await page.press('Escape')
    await page.until(`!document.querySelector('.cg-keys')`, { what: 'the key sheet closed' })
    expect(/commit 300 of gamma/.test(await selected()), 'the selection survived the sheet')

    await page.eval(`document.querySelectorAll('.app-tab')[1].querySelector('.app-tab-close').click()`)
    await page.until(`document.querySelectorAll('.app-tab').length === 1`, { what: 'the deep repository closed' })
  },
}
