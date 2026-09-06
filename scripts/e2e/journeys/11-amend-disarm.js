// Amend armed for HEAD, then HEAD moved from a terminal: the box unticks
// itself rather than rewriting the new commit with the old message. The
// ordinary draft is kept apart from the amend one, and comes back.
'use strict'
const TEXTAREA = `textarea[placeholder^="Commit message"]`
const AMEND = '.st2-amend input'
const clearForm = `(() => { const el = document.querySelector('${TEXTAREA}'); if (!el.value) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`
module.exports = {
  name: 'an amend armed for a commit that is no longer HEAD disarms itself',
  async run({ page, expect, fixture }) {
    const { repo1, git } = fixture
    const value = () => page.eval(`document.querySelector('${TEXTAREA}').value`)
    const ticked = () => page.eval(`document.querySelector('${AMEND}').checked`)
    await page.click('.app-tab')
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form' })
    // A retry starts from an unticked box and an empty form.
    if (await ticked()) { await page.click(AMEND); await page.until(`!document.querySelector('${AMEND}').checked`, { what: 'the box unticked' }) }
    await page.eval(clearForm)
    const head = git(repo1, 'log', '-1', '--format=%s').trim()

    await page.focus(TEXTAREA)
    await page.type('An ordinary draft')
    await page.until(`document.querySelector('${TEXTAREA}').value === 'An ordinary draft'`, { what: 'the ordinary draft' })
    await page.click(AMEND)
    await page.until(`document.querySelector('${TEXTAREA}').value === ${JSON.stringify(head)}`, { what: "HEAD's message in the form once amend is ticked" })
    expect(await ticked(), 'the box is ticked')

    // HEAD moves, from outside the app.
    git(repo1, 'commit', '-q', '--allow-empty', '-m', 'made from a terminal')
    await page.until(`!document.querySelector('${AMEND}').checked`, { what: 'the box unticked by the moved HEAD', timeoutMs: 10000 })
    expect.equal(await value(), 'An ordinary draft', 'the ordinary draft back, kept apart from the amend one')

    // Ticked again, it is armed for the new HEAD; unticked, the ordinary draft once more.
    await page.click(AMEND)
    await page.until(`document.querySelector('${TEXTAREA}').value === 'made from a terminal'`, { what: "the new HEAD's message" })
    await page.click(AMEND)
    await page.until(`document.querySelector('${TEXTAREA}').value === 'An ordinary draft'`, { what: 'the ordinary draft after unticking' })
    await page.eval(clearForm)
  },
}
