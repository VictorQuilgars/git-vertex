// The keyboard: the tab strip's arrows, End and Delete; a commit's menu walked
// with the arrows, holding the graph's selection still under it, into the
// rebase editor — which sums up its plan and follows a change to it.
'use strict'
// "commit 2 of alpha": not a branch tip, so its menu is flat; three commits above it.
const ROW = 3
const ROWS = `document.querySelectorAll('.cg-row:not(.cg-row-wip)')`
const menuLabel = `(() => { const el = document.activeElement; if (!el?.classList.contains('ctx-item')) return 'not on a row'; return (el.querySelector('.ctx-label')?.textContent ?? el.textContent).trim() })()`
module.exports = {
  name: 'the keyboard reaches the tabs, the menu and the rebase editor',
  async run({ page, expect, fixture }) {
    const { repo1, git } = fixture
    await page.click('.app-tab')
    // Two tabs, the repository and the settings: Left switches, End goes to the last, Delete closes.
    await page.eval(`document.activeElement?.blur?.()`)
    await page.press(',', { ctrl: true })
    await page.until(`document.querySelectorAll('.app-tab').length === 2 && document.querySelectorAll('.app-tab')[1].classList.contains('active')`, { what: 'the settings tab, active' })
    await page.focus('.app-tab.active')
    await page.press('ArrowLeft')
    await page.until(`document.querySelectorAll('.app-tab')[0].classList.contains('active') && document.activeElement === document.querySelectorAll('.app-tab')[0]`, { what: 'the repository tab active and focused after Left' })
    await page.press('End')
    // The focus follows a frame after the switch; Delete before it would close
    // the tab that still has it — the repository's.
    await page.until(`document.querySelectorAll('.app-tab')[1].classList.contains('active') && document.activeElement === document.querySelectorAll('.app-tab')[1]`, { what: 'the last tab active and focused after End' })
    await page.press('Delete')
    await page.until(`document.querySelectorAll('.app-tab').length === 1 && document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'alpha'`, { what: 'the settings tab closed by Delete, the repository shown' })

    // A commit's menu: once open it holds the keyboard. Down walks its rows; Enter acts.
    await page.until(`${ROWS}.length > ${ROW}`, { what: 'the graph rows' })
    const head = git(repo1, 'rev-parse', 'HEAD').trim()
    const selected = () => page.eval(`document.querySelector('.cg-row.cg-selected')?.textContent ?? ''`)
    const selectedBefore = await selected()
    await page.eval(`(() => { const el = ${ROWS}[${ROW}].querySelector('.cg-col-msg'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + r.height / 2 })) })()`)
    await page.until(`!!document.querySelector('.ctx-item')`, { what: 'the menu' })
    let steps = 0
    while (!/^Interactive Rebase from Here/.test(await page.eval(menuLabel))) {
      expect(steps++ < 25, `the row is reached within 25 arrows (stuck at "${await page.eval(menuLabel)}")`)
      await page.press('ArrowDown')
    }
    expect(steps > 0, 'the row was reached with the arrows')
    expect.equal(await selected(), selectedBefore, 'the selection under the menu, untouched by the arrows')
    await page.press('Enter')
    await page.until(`!!document.querySelector('.ir-summary')`, { what: 'the rebase editor with its summary', timeoutMs: 8000 })

    // The plan: one row per commit above the base, summed up; a squash changes the sum.
    const short = await page.eval(`document.querySelector('.ir-base code')?.textContent`)
    const n = Number(git(repo1, 'rev-list', '--count', `${short}..HEAD`).trim())
    expect(n >= 2, `the range holds at least two commits (${n} above ${short})`)
    expect.equal(await page.eval(`document.querySelectorAll('.ir-row').length`), n, 'one row per commit of the range')
    expect.match(await page.eval(`document.querySelector('.ir-summary').textContent`), new RegExp(`^Rewrites ${n} commits into ${n}: 0 folded into another, 0 dropped, 0 reworded`), 'the summary before any change')
    await page.eval(`(() => { const s = document.querySelectorAll('.ir-action-select')[1]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'squash'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await page.until(`/into ${n - 1}: 1 folded into another/.test(document.querySelector('.ir-summary')?.textContent ?? '')`, { what: 'the summary counting the fold' })
    // Cancel: nothing was launched.
    await page.click('.ir-cancel')
    await page.until(`!document.querySelector('.ir-summary')`, { what: 'the editor closed' })
    expect.equal(git(repo1, 'rev-parse', 'HEAD').trim(), head, 'HEAD untouched')
  },
}
