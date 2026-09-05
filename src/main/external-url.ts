// What the app agrees to hand to the operating system as "open this".
//
// Every link the renderer opens is built from data the app did not write: a
// remote's URL, an issue body, a release note, a README. `shell.openExternal`
// takes any scheme, and a scheme is a program — `file:` opens the file, a
// custom one launches whatever registered it. The renderer is a sandboxed
// window that only ever meant "open this in the browser", so that is the whole
// list: the two web schemes and mail.
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
