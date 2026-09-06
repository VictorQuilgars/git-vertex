// The audit's P1: at the minimum window the graph had 53px and the search ran off the edge.
'use strict'
module.exports = {
  name: 'the essential actions are reachable at 900×600 and 1300×800',
  async run({ page, expect, snapshot }) {
    const within = (selector, width) => page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'absent'; const r = el.getBoundingClientRect(); return r.width > 0 && r.right <= ${width} + 1 && r.left >= -1 ? 'ok' : 'off: ' + Math.round(r.left) + '..' + Math.round(r.right) })()`)
    await page.click('.app-tab')
    await page.setViewport(900, 600)
    // A selection left by an earlier journey would put the details across the
    // centre; the measures below are about the three-pane layout.
    if (await page.eval(`!!document.querySelector('.app-detail-back')`)) await page.click('.app-detail-back')
    await page.until(`!document.querySelector('.app-body--detail')`, { what: 'the three panes' })
    await page.until(`!!document.querySelector('.tb-more')`, { what: 'the compact toolbar menu' })
    expect.equal(await within('.tb-search input', 900), 'ok', 'the search field at 900px')
    expect.equal(await within('.tb-cell-split', 900), 'ok', 'the Pull button at 900px')
    expect.equal(await within('.sb-wip', 900), 'ok', 'the Working changes row at 900px')
    await snapshot('graph-900x600')
    // The details take the centre, with a way back.
    await page.click('.cg-row:not(.cg-row-wip)')
    await page.until(`!!document.querySelector('.app-body--detail .app-detail-back')`, { what: 'the details across the centre' })
    await snapshot('details-900x600')
    await page.click('.app-detail-back')
    await page.until(`!document.querySelector('.app-body--detail')`, { what: 'the graph back' })
    await page.setViewport(1300, 800)
    await page.until(`!document.querySelector('.tb-more')`, { what: 'the full toolbar' })
    expect.equal(await within('.app-sidebar', 1300), 'ok', 'the sidebar at 1300px')
    expect.equal(await within('.tb-search input', 1300), 'ok', 'the search field at 1300px')
    await snapshot('graph-1300x800')
    await page.clearViewport()
  },
}
