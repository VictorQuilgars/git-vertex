// The audit's P1: a commit message written, one click on the history, gone.
'use strict'
const TEXTAREA = `textarea[placeholder^="Commit message"]`
module.exports = {
  name: 'a commit draft survives a look at the history',
  async run({ page, expect }) {
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form' })
    await page.focus(TEXTAREA)
    await page.type('Draft kept across navigation')
    await page.until(`document.querySelector('${TEXTAREA}').value === 'Draft kept across navigation'`, { what: 'the typed draft' })
    // Select a commit: the form is unmounted for the commit's details.
    await page.click('.cg-row:not(.cg-row-wip)')
    await page.until(`!document.querySelector('${TEXTAREA}')`, { what: 'the details replacing the form' })
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form again' })
    expect.equal(await page.eval(`document.querySelector('${TEXTAREA}').value`), 'Draft kept across navigation', 'the draft after coming back')
    // Leave the form empty for what follows.
    await page.focus(TEXTAREA)
    await page.eval(`(() => { const el = document.querySelector('${TEXTAREA}'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  },
}
