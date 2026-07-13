// build-webview.js — bundles both the extension host and the webview UI
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const mediaDir = path.join(__dirname, 'media')
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })

async function build() {
  // ── Extension host (Node.js) ─────────────────────────────────
  // Bundle all deps (incl. simple-git) into a single out/extension.js so
  // the .vsix works without shipping node_modules.
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
    bundle: true,
    outfile: path.join(__dirname, 'out', 'extension.js'),
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    sourcemap: true,
    minify: false,
    // vscode is provided by the VS Code runtime — never bundle it
    external: ['vscode'],
  })
  console.log('Extension host bundled → out/extension.js')

  // ── Webview (browser) — reuses the real desktop React components ──
  // Entry is app.tsx; esbuild transpiles JSX (React in scope) and extracts all
  // imported CSS (App.css, component CSS, hljs theme) into media/main.css.
  await esbuild.build({
    entryPoints: [path.join(__dirname, 'src', 'webview', 'app.tsx')],
    bundle: true,
    outfile: path.join(__dirname, 'media', 'main.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    jsx: 'transform',
    sourcemap: true,
    minify: false,
    loader: { '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  console.log('Webview bundled → media/main.js (+ main.css)')
}

build().catch(err => { console.error(err); process.exit(1) })
