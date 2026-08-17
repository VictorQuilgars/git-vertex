// `.svg` imports resolve to the file's source text, not a URL.
//
// All three build systems that compile the renderer are configured for it:
// electron.vite.config.ts (a pre-load hook that beats Vite's asset plugin),
// vscode-extension/build-webview.js (esbuild's `text` loader), and jest
// (__tests__/svgTransform.js). This declaration is what tells TypeScript.
//
// It exists so components/Icon can keep its drawings as real, editable SVG
// files rather than as path literals pasted into a .tsx.
declare module '*.svg' {
  const source: string
  export default source
}
