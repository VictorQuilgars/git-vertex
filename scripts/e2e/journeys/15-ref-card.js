// #258: a click on a branch chip opens its card over the details panel; the
// same chip again, Escape, or a selection that leaves the tip closes it. The
// double-click is still the switch, and no card opens behind it.
'use strict'
const chip = (name) => `[...document.querySelectorAll('.ref-chip')].find(c => c.textContent.includes(${JSON.stringify(name)}))`
module.exports = {
  name: 'a branch chip opens its card over the details, and only a click does',
  async run({ page, expect }) {
    await page.click('.app-tab')
    // The tab the previous journey closed settles a moment later: wait for alpha's own graph.
    await page.until(`document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'alpha' && /of alpha/.test(document.querySelector('.cg-body')?.textContent ?? '') && !!${chip('main')}`, { what: 'the branch chips of the first repository' })
    await page.press('Escape')

    await page.eval(`${chip('main')}.click()`)
    await page.until(`!!document.querySelector('.refcard')`, { what: 'the card', timeoutMs: 5000 })
    expect.equal(await page.eval(`document.querySelector('.refcard-name')?.textContent`), 'main', 'the card is the chip\'s')
    // Earlier journeys have committed here: the tip is whatever carries the chip now.
    const onTip = `!!document.querySelector('.cg-row.cg-selected .ref-chip')?.textContent.includes('main')`
    expect(await page.eval(onTip), 'the chip\'s row is selected under it')
    // Over the details and nothing else: the graph beside it is not covered.
    const box = await page.eval(`(() => { const c = document.querySelector('.refcard').getBoundingClientRect(), r = document.querySelector('.app-right').getBoundingClientRect(), g = document.querySelector('.cg-body').getBoundingClientRect(); return { inside: c.left >= r.left - 1 && c.right <= r.right + 1, clear: c.left >= g.right - 1 } })()`)
    expect(box.inside && box.clear, `the card covers the details only: ${JSON.stringify(box)}`)
    expect(await page.eval(`${chip('main')}.classList.contains('ref-chip--open')`), 'the chip reads as pressed')

    // Escape closes the card first, and leaves the selection it sits on.
    await page.press('Escape')
    await page.until(`!document.querySelector('.refcard')`, { what: 'the card closed by Escape' })
    expect(await page.eval(onTip), 'one Escape closed one thing')

    // Open again, then select another commit: the panel is about something else now.
    await page.eval(`${chip('main')}.click()`)
    await page.until(`!!document.querySelector('.refcard')`, { what: 'the card again', timeoutMs: 5000 })
    await page.eval(`[...document.querySelectorAll('.cg-row:not(.cg-row-wip)')].pop().querySelector('.cg-col-msg').click()`)
    await page.until(`!document.querySelector('.refcard')`, { what: 'the card closed by another selection' })
    await page.press('Escape')
  },
}
