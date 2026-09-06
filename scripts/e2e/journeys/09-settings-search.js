// The settings opened from the keyboard, and a search that narrows their
// sections — and moves to one that answers when the open one does not.
'use strict'
const SEARCH = '.stg-nav-search input'
const setSearch = (value) => `(() => { const el = document.querySelector('${SEARCH}'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`
module.exports = {
  name: 'the settings open from the keyboard and their search narrows the sections',
  async run({ page, expect }) {
    await page.click('.app-tab')
    // Ctrl+, is the app's own shortcut; nothing else may hold the keyboard.
    await page.eval(`document.activeElement?.blur?.()`)
    await page.press(',', { ctrl: true })
    await page.until(`!!document.querySelector('${SEARCH}')`, { what: 'the settings tab' })
    const items = () => page.eval(`Array.from(document.querySelectorAll('.stg-nav-item')).map(b => b.textContent.trim())`)
    const active = () => page.eval(`document.querySelector('.stg-nav-item.active')?.textContent.trim() ?? 'none'`)
    const all = await items()
    expect(all.length >= 5, `the sections are listed (${all.length})`)
    await page.focus(SEARCH)
    await page.type('token')
    await page.until(`document.querySelectorAll('.stg-nav-item').length < ${all.length}`, { what: 'the sections narrowed by "token"' })
    const some = await items()
    expect(some.length > 0, 'a section answers "token"')
    expect(some.includes(await active()), `the open section is one that answers (${await active()} among ${some.join(', ')})`)
    // A query nothing answers says so.
    await page.eval(setSearch('zzzz-no-such-setting'))
    await page.until(`!!document.querySelector('.stg-nav-empty')`, { what: 'the empty answer' })
    expect.equal(await page.eval(`document.querySelectorAll('.stg-nav-item').length`), 0, 'no section listed')
    // Cleared, everything is back.
    await page.eval(setSearch(''))
    await page.until(`document.querySelectorAll('.stg-nav-item').length === ${all.length}`, { what: 'the sections back' })
    // Leave from the keyboard: Delete on the focused tab closes it.
    await page.focus('.app-tab.active')
    await page.press('Delete')
    await page.until(`!document.querySelector('${SEARCH}') && document.querySelectorAll('.app-tab').length === 1`, { what: 'the settings tab closed' })
  },
}
