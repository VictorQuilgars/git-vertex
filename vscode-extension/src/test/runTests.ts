import * as path from 'path'
import { runTests } from '@vscode/test-electron'

async function main(): Promise<void> {
  // out/vscode-extension/src/test/ → vscode-extension/. Four levels, not two:
  // the test tree is emitted from the repo root so it can reach the shared git
  // core (see tsconfig.test.json).
  const extensionDevelopmentPath = path.resolve(__dirname, '../../../../')
  const extensionTestsPath = path.resolve(__dirname, './suite/index')

  try {
    await runTests({ extensionDevelopmentPath, extensionTestsPath })
  } catch (err) {
    console.error('Test run failed:', err)
    process.exit(1)
  }
}

main()
