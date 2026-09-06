// Two repositories open: each answers for itself, a hidden one stays current.
'use strict'
module.exports = {
  name: 'a session per repository',
  async run({ page, expect, fixture }) {
    const { repo1, repo2, git } = fixture
    await page.click('.app-tab')
    await page.click('.tb-repo-btn')
    await page.until(`!!document.querySelector('.tb-recent-path[title=${JSON.stringify(repo2)}]')`, { what: 'the second repository in the recents' })
    await page.click(`.tb-recent-path[title=${JSON.stringify(repo2)}]`)
    await page.until(`document.querySelectorAll('.app-tab').length === 2 && /^1 commit/.test(document.querySelector('.sb-history')?.textContent ?? '')`, { what: 'the second repository shown' })
    const names = (r) => r.branches.map(b => b.name)
    const hidden = await page.eval(`window.gitAPI.session(${JSON.stringify(repo1)}).getBranches().then(r => r.branches.map(b => b.name))`)
    const shown = await page.eval(`window.gitAPI.getBranches().then(r => r.branches.map(b => b.name))`)
    expect(hidden.includes('feature') && !hidden.includes('topic'), `a call bound to the hidden repository is answered by it (${hidden})`)
    expect(shown.includes('topic') && !shown.includes('feature'), `a plain call is answered by the shown repository (${shown})`)
    // A commit lands in the hidden repository; its tab shows it on return, from its refreshed snapshot.
    git(repo1, 'commit', '-q', '--allow-empty', '-m', 'made while hidden')
    await page.until(`true`, { timeoutMs: 100 }).catch(() => {})
    await new Promise(r => setTimeout(r, 2500))
    await page.click('.app-tab')
    const t0 = Date.now()
    await page.until(`/^4 commits/.test(document.querySelector('.sb-history')?.textContent ?? '')`, { what: 'the hidden commit shown on return', timeoutMs: 8000 })
    const ms = Date.now() - t0
    expect(ms < 1500, `the return showed the present at once (${ms}ms)`)
    // Close the second tab: its session goes; a call bound to it is answered by nothing, not by the other.
    await page.eval(`document.querySelectorAll('.app-tab')[1].querySelector('.app-tab-close').click()`)
    await page.until(`document.querySelectorAll('.app-tab').length === 1`, { what: 'the second tab closed' })
    await new Promise(r => setTimeout(r, 300))
    const closed = await page.eval(`window.gitAPI.session(${JSON.stringify(repo2)}).getBranches().then(r => r.branches ? r.branches.map(b => b.name) : r)`)
    expect(!Array.isArray(closed) || !closed.includes('main'), `a closed repository answers nothing (${JSON.stringify(closed)})`)
    expect.equal(names(await page.eval(`window.gitAPI.getBranches()`)).includes('feature'), true, 'the shown repository still answers')
  },
}
