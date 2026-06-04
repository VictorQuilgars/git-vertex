// build-webview.js — esbuild script to bundle src/webview/main.ts → media/main.js
const esbuild = require('esbuild')
const path = require('path')
const fs = require('fs')

const mediaDir = path.join(__dirname, 'media')
if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true })

esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'webview', 'main.ts')],
  bundle: true,
  outfile: path.join(__dirname, 'media', 'main.js'),
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  sourcemap: true,
  minify: false,
  define: {
    'process.env.NODE_ENV': '"production"'
  }
}).then(() => {
  console.log('Webview bundled → media/main.js')
}).catch(err => {
  console.error('Webview bundle failed:', err)
  process.exit(1)
})
