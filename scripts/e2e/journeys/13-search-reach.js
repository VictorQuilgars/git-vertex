// #188: a hit of the extended search beyond the loaded page. The graph holds
// 500 commits; the hit is 800 back; the page grows to a thousand, the status
// bar says so, and the hit is selected.
'use strict'
const EXT = '.tb-ext-search:not(.tb-ai-search)'
const SEARCH = '.tb-search input'
module.exports = {
  name: 'a search hit beyond the loaded page is loaded and selected',
  async run({ page, expect, fixture }) {
    const { repo3 } = fixture
    const history = () => `document.querySelector('.sb-history')?.textContent ?? ''`
    await page.click('.app-tab')
    await page.click('.tb-repo-btn')
    await page.until(`!!document.querySelector('.tb-recent-path[title=${JSON.stringify(repo3)}]')`, { what: 'the deep repository in the recents' })
    await page.click(`.tb-recent-path[title=${JSON.stringify(repo3)}]`)
    await page.until(`document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'gamma' && /^500 commits loaded/.test(${history()})`, { what: 'the first page of the deep repository', timeoutMs: 20000 })
    // A retry starts with the extended search off and the field empty.
    if (await page.eval(`document.querySelector(${JSON.stringify(EXT)})?.classList.contains('active')`)) await page.click(EXT)
    if (await page.eval(`document.querySelector('${SEARCH}')?.value`)) await page.click('.tb-clear')

    // "line 400" was added by commit 400 and removed by commit 401: two hits,
    // 800 and 801 rows back, both beyond the page.
    await page.click(EXT)
    await page.until(`document.querySelector(${JSON.stringify(EXT)})?.classList.contains('active')`, { what: 'the extended search on' })
    await page.focus(SEARCH)
    await page.type('line 400')
    await page.until(`/^1000 commits loaded/.test(${history()})`, { what: 'the page grown to the hit', timeoutMs: 30000 })
    await page.until(`/commit 40[01] of gamma/.test(document.querySelector('.cg-row.cg-selected')?.textContent ?? '')`, { what: 'the nearest hit selected', timeoutMs: 10000 })
    expect.equal(await page.eval(`document.querySelector('.tb-search-count')?.textContent`), '2', 'the count in the field says both hits')
    expect(await page.eval(`!document.querySelector('.chip--error')`), 'nothing to say: every hit was within reach')

    // Off again, the field cleared, the tab closed.
    await page.click('.tb-clear')
    await page.click(EXT)
    await page.until(`!document.querySelector(${JSON.stringify(EXT)})?.classList.contains('active')`, { what: 'the extended search off' })
    await page.eval(`document.querySelectorAll('.app-tab')[1].querySelector('.app-tab-close').click()`)
    await page.until(`document.querySelectorAll('.app-tab').length === 1`, { what: 'the deep repository closed' })
  },
}
