import * as assert from 'assert'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { findAppPath, launchApp } from '../../appLocator'

suite('appLocator', () => {
  test('findAppPath returns string or null — never throws', () => {
    const result = findAppPath()
    assert.ok(result === null || typeof result === 'string',
      `Expected string | null, got ${typeof result}`)
  })

  test('launchApp does not throw for a real executable', function () {
    // Use a harmless real binary that exists on every platform
    const bin = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh'
    if (!fs.existsSync(bin)) { this.skip(); return }

    // Pass a temp dir as the "repo path" — the binary will just exit
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-test-'))
    assert.doesNotThrow(() => launchApp(bin, tmpDir))
    fs.rmdirSync(tmpDir)
  })
})
