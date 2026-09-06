// The graph holds a page of history, not the repository: the status bar says
// how many commits are loaded, and Load more fetches the next page.
'use strict'
module.exports = {
  name: 'a deep history is paged, and Load more fetches the next page',
  async run({ page, expect, fixture }) {
    const { repo3, git } = fixture
    const total = Number(git(repo3, 'rev-list', '--count', 'HEAD').trim())
    expect(total > 500, `the fixture is deeper than a page (${total})`)
    const history = () => `document.querySelector('.sb-history')?.textContent ?? ''`
    await page.click('.app-tab')
    await page.click('.tb-repo-btn')
    await page.until(`!!document.querySelector('.tb-recent-path[title=${JSON.stringify(repo3)}]')`, { what: 'the deep repository in the recents' })
    await page.click(`.tb-recent-path[title=${JSON.stringify(repo3)}]`)
    await page.until(`document.querySelectorAll('.app-tab').length === 2 && /^500 commits loaded/.test(${history()})`, { what: 'the first page of 500', timeoutMs: 20000 })
    expect.match(await page.eval(`document.querySelector('.sb-history-more')?.textContent ?? 'absent'`), /^Load 500 more/, 'the status bar offers the next page')
    // The button is disabled while the repository is still loading; a click then is nothing.
    await page.until(`document.querySelector('.sb-history-more')?.disabled === false`, { what: 'the Load more button enabled' })
    await page.click('.sb-history-more')
    await page.until(`/^${total} commits loaded/.test(${history()})`, { what: 'the whole history loaded', timeoutMs: 20000 })
    expect(await page.eval(`!document.querySelector('.sb-history-more')`), 'nothing left to load, no button')
    // Close its tab: the first repository alone for what follows.
    await page.eval(`document.querySelectorAll('.app-tab')[1].querySelector('.app-tab-close').click()`)
    await page.until(`document.querySelectorAll('.app-tab').length === 1`, { what: 'the deep repository closed' })
  },
}
