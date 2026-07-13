import * as path from 'path'
import * as fs from 'fs'
import Mocha from 'mocha'

export function run(): Promise<void> {
  // 'tdd' registers suite()/test()/setup()/teardown() as globals — used by all test files.
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 10_000 })

  const testsRoot = __dirname

  function collect(dir: string): string[] {
    const results: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) results.push(...collect(full))
      else if (entry.isFile() && entry.name.endsWith('.test.js')) results.push(full)
    }
    return results
  }

  collect(testsRoot).forEach(f => mocha.addFile(f))

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) reject(new Error(`${failures} test(s) failed`))
        else resolve()
      })
    } catch (err) {
      reject(err)
    }
  })
}
