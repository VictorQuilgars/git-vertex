// Every command the extension DECLARES, found in the palette.
//
//   npm run ext:drive -- --demo --scenario scripts/scenarios/commands.js
//
// `package.json` declares commands; `extension.ts` registers them. Nothing
// holds the two together: a command declared and never registered is a palette
// entry that throws when picked, and one registered under a different id is a
// title nobody can reach. Neither shows up in a build, a typecheck or a unit
// test — the declaration is data and the registration is a string.
//
// The palette is asked for each title, which is how a person would look for
// it — and only for the commands that should ALWAYS be there. A
// `menus.commandPalette` entry with a `when` is conditional on something this
// scenario does not set up: `when: false` hides the command for good (it is
// reached from a context menu or a keybinding), and
// `when: resourceScheme == gitvertex` shows it only while a file is open at a
// revision. Asking for either is a failure about the harness, not the product
// — which is exactly what the first run of this file reported.
'use strict'
const fs = require('fs')
const path = require('path')
const { sleep } = require('./lib/views')

module.exports = async function commands(ctx) {
  const { workbench } = ctx
  if (!workbench) {
    console.log('· the desktop has no command palette — nothing for this scenario to ask')
    return
  }

  const manifest = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'vscode-extension', 'package.json'), 'utf8'))
  // Any `when` at all makes it conditional — see the note above.
  const conditional = new Set((manifest.contributes?.menus?.commandPalette ?? [])
    .filter(entry => entry.when !== undefined)
    .map(entry => entry.command))
  const declared = (manifest.contributes?.commands ?? [])
    .filter(c => !conditional.has(c.command))

  const missing = []
  for (const { command, title } of declared) {
    // One palette opening per title: the list is rebuilt for each query, and
    // reusing an open palette leaves the previous query's rows on screen.
    await workbench.press('Escape')
    await sleep(120)
    const found = await askPalette(workbench, title)
    if (!found) missing.push(`${title}  (${command})`)
  }
  await workbench.press('Escape')

  console.log('')
  console.log(`  ${declared.length} commands that should always be in the palette, ${conditional.size} conditional on a context`)
  console.log('')
  if (missing.length) {
    console.error('✗ declared, and not in the palette:\n✗   ' + missing.join('\n✗   '))
    process.exitCode = 1
  } else {
    console.log(`✓ every one of the ${declared.length} is there`)
  }
}

/** Open the palette on a title and say whether a row matches it. */
async function askPalette(workbench, title) {
  const mac = process.platform === 'darwin'
  const base = {
    key: 'P', code: 'KeyP', windowsVirtualKeyCode: 80, nativeVirtualKeyCode: 80,
    modifiers: (mac ? 4 : 2) | 8,
  }
  await workbench.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base })
  await workbench.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
  await sleep(250)
  await workbench.type(title)
  await sleep(450)
  // The palette matches loosely and wraps the matched parts in their own
  // elements, so a row's text reads back with spaces in odd places: both
  // sides are squashed before they are compared.
  return workbench.eval(`(() => {
    const want = ${JSON.stringify(title)}.replace(/\\s+/g, '').toLowerCase()
    return [...document.querySelectorAll('.quick-input-list .monaco-list-row')]
      .some(r => (r.textContent || '').replace(/\\s+/g, '').toLowerCase().includes(want))
  })()`).catch(() => false)
}
