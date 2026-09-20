// What a branch row offers, read from a REAL product — either of them.
//
//   npm run ext:drive -- --demo --scenario scripts/scenarios/branch-rows.js
//   npm run app:drive -- --demo --scenario scripts/scenarios/branch-rows.js
//
// The same ground as Sidebar.rowActions.test.tsx, and not the same proof: that
// one renders the shared component under jsdom with a fixture for a host. This
// asks a running product, where the rows are filled by a host talking to git
// in a real repository — which is where `behind → pull` failed to appear while
// every unit test agreed that it should.
//
// One file for both, because the rows are one file for both: the side bar is
// shared renderer code, so a scenario about it is a parity check for free. The
// two drivers hand over the same three calls — `eval`, `until`, `click` — the
// panel's bound to the extension's frame, the desktop's to its window.
'use strict'

module.exports = async function branchRows(ctx) {
  const panel = ctx.panel ?? ctx.page
  // The panel shows one view at a time, chosen from the rail; the desktop
  // stacks every section and has no rail at all. Clicking it when it is there
  // is all the difference between the two products this scenario has to know.
  await panel.eval(`(() => {
    const b = [...document.querySelectorAll('.gv-rail-btn')].find(x => x.getAttribute('aria-label') === 'Branches')
    if (b) b.click()
    return !!b
  })()`)
  await panel.until('document.querySelectorAll(".sb-branch-item").length > 0', { what: 'the branch rows' })

  const rows = await panel.eval(`JSON.stringify([...document.querySelectorAll('.sb-branch-item')].map(row => ({
    name: row.querySelector('.sb-branch-name')?.textContent?.trim(),
    remote: row.classList.contains('remote'),
    current: row.classList.contains('current'),
    track: row.querySelector('.sb-track')?.textContent?.trim() || null,
    // The acts are drawn at all times and hidden with opacity, so they are
    // readable without a pointer — which is also what puts them in the tab order.
    acts: [...row.querySelectorAll('.sb-row-action')].map(b => b.getAttribute('title')),
  })))`)

  const parsed = JSON.parse(rows)
  const width = Math.max(...parsed.map(r => (r.name ?? '').length), 4)
  console.log('')
  for (const row of parsed) {
    const where = row.current ? 'current' : row.remote ? 'remote ' : 'local  '
    console.log(`  ${(row.name ?? '?').padEnd(width)}  ${where}  ${(row.track ?? '').padEnd(6)}  ${row.acts.join(' · ')}`)
  }
  console.log('')

  // What the mapping promises, checked where it actually runs.
  const problems = []
  for (const row of parsed) {
    if (row.track?.includes('↓') && !row.acts.includes('Pull')) problems.push(`${row.name} is behind and offers no Pull`)
    if (row.current && row.acts.includes('Switch')) problems.push(`${row.name} is the current branch and offers a Switch to itself`)
    if (!row.acts.includes('Show card')) problems.push(`${row.name} offers no card`)
  }
  if (problems.length) {
    console.error('✗ ' + problems.join('\n✗ '))
    process.exitCode = 1
  } else {
    console.log(`✓ ${parsed.length} rows, each offering what its state calls for`)
  }
}
