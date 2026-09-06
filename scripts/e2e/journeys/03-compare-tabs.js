// The audit's P1: two comparison tabs showing one comparison.
'use strict'
module.exports = {
  name: 'two comparison tabs are two comparisons',
  async run({ page, expect }) {
    const openCompareOf = async (rowIndex) => {
      await page.click('.app-tab')   // the repository tab
      await page.until(`document.querySelectorAll('.cg-row:not(.cg-row-wip)').length > ${rowIndex}`, { what: 'the graph rows' })
      // On the message, not on a ref chip: a chip opens the branch's menu.
      await page.eval(`(() => { const el = document.querySelectorAll('.cg-row:not(.cg-row-wip)')[${rowIndex}].querySelector('.cg-col-msg'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + r.height / 2 })) })()`)
      await page.clickSubmenuItem('Compare', 'Compare Working Tree to Here')
      await page.until(`document.querySelector('.app-tab.active .app-tab-name')?.textContent?.includes('Working tree')`, { what: 'a comparison tab' })
      await page.until(`!!document.querySelector('.cv-ref-select')`, { what: 'the comparison view' })
      return page.eval(`document.querySelector('.app-tab.active .app-tab-name').textContent.slice(0, 7)`)
    }
    const a = await openCompareOf(0)
    const b = await openCompareOf(1)
    expect(a !== b, `two different comparisons were opened (${a}, ${b})`)
    const tabs = await page.eval(`Array.from(document.querySelectorAll('.app-tab .app-tab-name')).map(e => e.textContent.slice(0, 7))`)
    const indexA = tabs.indexOf(a), indexB = tabs.indexOf(b)
    expect(indexA > 0 && indexB > 0, 'both comparison tabs are in the strip')
    // B is shown; click A directly, as the audit did.
    await page.eval(`document.querySelectorAll('.app-tab')[${indexA}].click()`)
    await page.until(`document.querySelector('.cv-ref-select')?.value?.startsWith(${JSON.stringify(a)})`, { what: `tab ${a} showing its own comparison`, timeoutMs: 8000 })
    await page.eval(`document.querySelectorAll('.app-tab')[${indexB}].click()`)
    await page.until(`document.querySelector('.cv-ref-select')?.value?.startsWith(${JSON.stringify(b)})`, { what: `tab ${b} showing its own comparison`, timeoutMs: 8000 })
    // Close both comparison tabs, highest index first.
    for (const i of [indexA, indexB].sort((x, y) => y - x)) await page.eval(`document.querySelectorAll('.app-tab')[${i}].querySelector('.app-tab-close').click()`)
    await page.until(`document.querySelectorAll('.app-tab').length === 1`, { what: 'the comparison tabs closed' })
  },
}
