import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * `.svg` imports resolve to the file's SOURCE, not a URL.
 *
 * components/Icon keeps its 25 drawings as real, editable SVG files in a folder
 * rather than as path literals in a .tsx — editing an icon means editing its
 * file and nothing else. That only works if an import hands back the text.
 *
 * `enforce: 'pre'` is load-bearing: Vite's own asset plugin claims .svg and
 * would return a URL, so this has to load it first. The extension's esbuild
 * build and jest are configured to match — see build-webview.js and
 * __tests__/svgTransform.js.
 */
const svgAsText = {
  name: 'svg-as-text',
  enforce: 'pre' as const,
  async load(id: string) {
    const file = id.split('?')[0]
    if (!file.endsWith('.svg')) return null
    return `export default ${JSON.stringify(await readFile(file, 'utf8'))}`
  },
}

/**
 * The production page does not allow `eval`.
 *
 * index.html carries `'unsafe-eval'` because Vite's dev server needs it for
 * HMR; nothing in the built renderer does — and a page that allows eval is a
 * page where one injected string runs as code. It is stripped from the built
 * page only, so the dev server keeps working and the app that ships does not
 * carry a permission it never uses.
 */
const strictCspInProduction = {
  name: 'strict-csp-in-production',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(" 'unsafe-eval'", '')
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [svgAsText, strictCspInProduction, react()]
  }
})
