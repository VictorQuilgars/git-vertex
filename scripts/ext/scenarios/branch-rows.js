// What a branch row offers, read from the REAL panel.
//
//   node scripts/ext/drive.js --demo --scenario scripts/ext/scenarios/branch-rows.js
//
// The same ground as Sidebar.rowActions.test.tsx, and not the same proof: that
// one renders the shared component under jsdom with a fixture for a host. This
// asks a running VS Code, where the rows are filled by the extension host
// talking to git in a real repository — which is where `behind → pull` failed
// to appear while every unit test agreed that it should.
'use strict'

module.exports = async function branchRows({ panel }) {
  // The rail's Branches view. It is a button with a label, so it is named
  // rather than found by position: the rail's contents change with its height.
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
