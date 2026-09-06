// The audit's P1: Enter on Cancel deleted the branch anyway.
'use strict'
module.exports = {
  name: 'Enter on Cancel does not delete a branch',
  async run({ page, expect }) {
    await page.click('.app-tab')
    await page.until(`Array.from(document.querySelectorAll('.sb-branch-item')).some(el => el.textContent.includes('feature'))`, { what: 'the feature branch in the sidebar' })
    await page.eval(`(() => { const el = Array.from(document.querySelectorAll('.sb-branch-item')).find(el => el.textContent.includes('feature')); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + r.height / 2 })) })()`)
    await page.clickMenuItem(/^Delete feature$/)
    await page.until(`!!document.querySelector('[role="dialog"] .dlg-danger')`, { what: 'the destructive confirmation' })
    expect(await page.eval(`document.activeElement?.classList.contains('dlg-cancel')`), 'a destructive confirmation opens on Cancel')
    await page.press('Enter')
    await page.until(`!document.querySelector('[role="dialog"]')`, { what: 'the dialog closed' })
    await page.until(`Array.from(document.querySelectorAll('.sb-branch-item')).some(el => el.textContent.includes('feature'))`, { what: 'the branch still there', timeoutMs: 3000 })
    expect(await page.eval(`window.gitAPI.getBranches().then(r => r.branches.some(b => b.name === 'feature'))`), 'git still has the branch')
  },
}
