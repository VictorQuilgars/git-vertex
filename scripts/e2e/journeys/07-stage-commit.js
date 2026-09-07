// The daily journey: a file staged, a message written, a commit made — and
// the draft cleared by the commit that succeeded, not by the one refused.
'use strict'
const fs = require('fs')
const path = require('path')
const TEXTAREA = `textarea[placeholder^="Commit message"]`
const STAGE = `.st-stage[title='Stage "notes.txt"']`
// Whichever commit button the layout shows: the footer's, or the toolbar's
// inline ✓ when the pane is stacked. Its label is the text, or the title when
// the button is too narrow for the text.
const BUTTON = `document.querySelector('.st2-commit-btn:not(.st2-abort)')`
const MESSAGE = 'Stage and commit from the suite'
module.exports = {
  name: 'a file staged and committed, the draft cleared by the commit that succeeded',
  async run({ page, expect, fixture }) {
    const { repo1, git } = fixture
    const hook = path.join(repo1, '.git', 'hooks', 'pre-commit')
    const count = () => git(repo1, 'rev-list', '--count', 'HEAD').trim()
    // A retry starts over: nothing staged, no hook and no message left from the first go.
    git(repo1, 'reset', '-q')
    fs.rmSync(hook, { force: true })
    try { git(repo1, 'config', '--unset', 'core.hooksPath') } catch { /* not set */ }
    const before = count()
    await page.click('.app-tab')
    await page.click('.sb-wip')
    await page.until(`!!document.querySelector('${TEXTAREA}')`, { what: 'the commit form' })
    await page.eval(`(() => { const el = document.querySelector('${TEXTAREA}'); if (!el.value) return; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await page.until(`!!document.querySelector(${JSON.stringify(STAGE)})`, { what: 'notes.txt among the unstaged files' })
    const label = () => page.eval(`(() => { const b = ${BUTTON}; return b ? (b.textContent.trim() + ' ' + b.title).trim() : 'absent' })()`)
    const disabled = () => page.eval(`${BUTTON}?.disabled`)
    expect(await disabled(), 'nothing staged: the commit button is disabled')
    expect.match(await label(), /Stage changes to commit/, 'the button says what comes first')

    await page.click(STAGE)
    await page.until(`!document.querySelector(${JSON.stringify(STAGE)}) && document.querySelectorAll('.st-unstage').length === 1`, { what: 'notes.txt moved to the staged files' })
    expect(await disabled(), 'staged, no message: still disabled')
    expect.match(await label(), /Type a Message to Commit/, 'the button asks for a message')

    await page.focus(TEXTAREA)
    await page.type(MESSAGE)
    await page.until(`document.querySelector('${TEXTAREA}').value === ${JSON.stringify(MESSAGE)}`, { what: 'the typed message' })
    await page.until(`${BUTTON}?.disabled === false`, { what: 'the commit button enabled' })
    expect.match(await label(), /Commit Changes to 1 File/, 'the button counts the staged file')
    const drafts = () => page.eval(`Object.keys(localStorage).filter(k => k.startsWith('gv-commit-draft:')).map(k => localStorage.getItem(k))`)
    expect((await drafts()).some(d => d.includes(MESSAGE)), 'the draft is saved as it is typed')

    // A commit refused by a hook: the message and the draft stay, nothing is committed.
    // The hook path is pinned locally, in case a global core.hooksPath points elsewhere.
    fs.writeFileSync(hook, '#!/bin/sh\necho "refused by the suite" >&2\nexit 1\n', { mode: 0o755 })
    git(repo1, 'config', 'core.hooksPath', '.git/hooks')
    await page.eval(`${BUTTON}.click()`)
    await page.until(`!!document.querySelector('.chip--error')`, { what: 'the error chip of the refused commit', timeoutMs: 8000 })
    expect.equal(count(), before, 'the refused commit committed nothing')
    expect.equal(await page.eval(`document.querySelector('${TEXTAREA}').value`), MESSAGE, 'the message after a refused commit')
    expect((await drafts()).some(d => d.includes(MESSAGE)), 'the draft after a refused commit')
    fs.rmSync(hook, { force: true })
    git(repo1, 'config', '--unset', 'core.hooksPath')

    // The same click, accepted: one more commit, the form and the tree empty.
    await page.until(`${BUTTON}?.disabled === false`, { what: 'the commit button enabled again' })
    await page.eval(`${BUTTON}.click()`)
    await page.until(`/^${Number(before) + 1} commits/.test(document.querySelector('.sb-history')?.textContent ?? '')`, { what: 'the status bar counting the new commit', timeoutMs: 8000 })
    expect.equal(count(), String(Number(before) + 1), 'git has one more commit')
    expect.equal(git(repo1, 'log', '-1', '--format=%s').trim(), MESSAGE, 'the commit carries the message')
    expect.equal(git(repo1, 'status', '--porcelain').trim(), '', 'the working tree is clean')
    // The tree is clean now, so the pane says what comes next instead of
    // holding a form for a commit with nothing in it (#189).
    await page.until(`!document.querySelector('${TEXTAREA}') && !!document.querySelector('.wce')`, { what: 'the next steps replacing the form' })
    expect.equal((await drafts()).length, 0, 'the draft cleared by the commit that succeeded')
    // Only what is true: this fixture has no remote, so there is nothing to
    // publish and nothing to push, and the card says so by not saying it.
    expect.equal(await page.eval(`document.querySelectorAll('.wce-row').length`), 0, 'no push or publish row without a remote')
    expect(await page.eval(`document.querySelectorAll('.wce-start').length > 0`), 'the card offers something to start')
    expect(await page.eval(`!!document.querySelector('.sb-wip')`), 'the Working changes row is still there, tree clean or not')
  },
}
