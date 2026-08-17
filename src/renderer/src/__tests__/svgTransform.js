// Jest counterpart to Vite's pre-load hook and esbuild's `text` loader: an
// imported .svg is its source, so components/Icon can read the icons folder.
module.exports = {
  process: (src) => ({ code: `module.exports = ${JSON.stringify(src)};` }),
  getCacheKey: (src) => require('crypto').createHash('md5').update(src).digest('hex'),
}
