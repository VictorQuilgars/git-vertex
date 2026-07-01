#!/usr/bin/env node
// Launcher: runs the TypeScript TUI via tsx (no build step needed).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = join(here, '..', 'src', 'cli.tsx')
const tsxBin = join(here, '..', 'node_modules', '.bin', 'tsx')

const child = spawn(tsxBin, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
child.on('exit', code => process.exit(code ?? 0))
child.on('error', err => { console.error('Impossible de lancer tsx:', err.message); process.exit(1) })
