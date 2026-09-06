// The audit's P1, after a restart: the app closed and opened again on the
// same profile, the repository reopened, the draft still in the form.
'use strict'
const TEXTAREA = `textarea[placeholder^="Commit message"]`
const clearForm = `(() => { const el = document.querySelector('${TEXTAREA}'); if (!el.value) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`
const DRAFT = 'Draft kept across a restart'
module.exports = {
  name: 'a commit draft survives a restart of the app',
  async run({ page, expect, fixture, relaunch }) {
    const { repo1 } = fixture
    await page.click('.app-tab')
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form' })
    await page.eval(clearForm)
    await page.focus(TEXTAREA)
    await page.type(DRAFT)
    await page.until(`document.querySelector('${TEXTAREA}').value === ${JSON.stringify(DRAFT)}`, { what: 'the typed draft' })

    page = await relaunch()
    // The welcome, and the first repository among its recents — by path, since
    // opening the others has reordered them.
    const recent = `Array.from(document.querySelectorAll('.welcome-recent-item')).find(el => el.getAttribute('title') === ${JSON.stringify(repo1)} || el.textContent.includes('alpha'))`
    await page.until(`!!(${recent})`, { what: 'the welcome screen after the restart', timeoutMs: 30000 })
    await page.eval(`(${recent}).click()`)
    await page.until(`document.querySelector('.app-tab.active .app-tab-name')?.textContent === 'alpha' && !!document.querySelector('.sb-wip')`, { what: 'the repository reopened' })
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form after the restart' })
    expect.equal(await page.eval(`document.querySelector('${TEXTAREA}').value`), DRAFT, 'the draft after the restart')
    await page.eval(clearForm)
  },
}
