// Decode a PNG as Chromium writes it (8-bit RGB or RGBA, no interlace) and
// compare two of them. No dependency: zlib is Node's.
'use strict'
const zlib = require('zlib')

function decode(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8, width = 0, height = 0, colorType = 0, depth = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; if (data[12] !== 0) throw new Error('interlaced PNG') }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`)
  const channels = { 2: 3, 6: 4, 0: 1, 4: 2 }[colorType]
  if (!channels) throw new Error(`unsupported colour type ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = v & 0xff
    }
    prev = cur
  }
  return { width, height, channels, data: out }
}

/** The share of pixels that differ by more than `threshold` on some channel. */
function differ(a, b, threshold = 32) {
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1, reason: `size ${a.width}×${a.height} vs ${b.width}×${b.height}` }
  const n = a.width * a.height
  let changed = 0
  const chans = Math.min(a.channels, b.channels, 3)
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < chans; c++) {
      if (Math.abs(a.data[p * a.channels + c] - b.data[p * b.channels + c]) > threshold) { changed++; break }
    }
  }
  return { ratio: changed / n }
}

module.exports = { decode, differ }
