// Opening a side bar view, in either product.
//
// The panel shows ONE view, chosen from the rail; the desktop stacks every
// section and has no rail at all. And the rail is not a fixed list: it fits
// what it can in the height it has and puts the rest behind "More…", so
// `Branches` is a button in a tall panel and a menu entry in a short one.
//
// A scenario that clicks `[aria-label="Branches"]` therefore works or does
// nothing depending on the window, and "does nothing" reads downstream as an
// empty view: the first run of branch-create reported zero rows before it had
// created anything, and it looked like the panel had lost its branches.
'use strict'

const sleep = ms => new Promise(r => setTimeout(r, ms))

/**
 * Show a view by its name. Returns what it had to do — `direct`, `overflow`,
 * or `none` for the desktop, which needs nothing because everything is there.
 */
async function openView(frame, label) {
  // ⚠️ The rail's buttons TOGGLE: clicking the view that is already showing
  // closes it. Two scenarios in a row, each opening Branches, left the second
  // one looking at an empty panel — reported as "timed out waiting for the
  // branch rows", which reads like the product losing its branches.
  const direct = await frame.eval(`(() => {
    const b = [...document.querySelectorAll('.gv-rail-btn')].find(x => x.getAttribute('aria-label') === ${JSON.stringify(label)})
    if (!b) return 'no-button'
    if (b.classList.contains('gv-rail-btn--active')) return 'already'
    b.click()
    return 'clicked'
  })()`)
  if (direct === 'already') return 'already'
  if (direct === 'clicked') { await sleep(400); return 'direct' }

  // No rail at all: the desktop, where every section is on screen already.
  const hasRail = await frame.eval('!!document.querySelector(".gv-rail-btn")')
  if (!hasRail) return 'none'

  const opened = await frame.eval(`(() => {
    const b = [...document.querySelectorAll('.gv-rail-btn')].find(x => /more/i.test(x.getAttribute('aria-label') || ''))
    if (!b) return false
    b.click()
    return true
  })()`)
  if (!opened) throw new Error(`no way to reach the ${label} view: no button and no overflow`)
  await sleep(300)
  const picked = await frame.eval(`(() => {
    const row = [...document.querySelectorAll('.ctx-menu .ctx-item')].find(x => (x.textContent || '').trim() === ${JSON.stringify(label)})
    if (!row) return false
    row.click()
    return true
  })()`)
  if (!picked) throw new Error(`${label} is neither on the rail nor in its overflow menu`)
  await sleep(400)
  return 'overflow'
}

module.exports = { openView, sleep }
