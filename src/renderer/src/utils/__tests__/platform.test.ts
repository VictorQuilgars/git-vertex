import { isWindows } from '../platform'

// The desktop knows; the panel has to look at the browser it is.
const as = (platform?: string) => {
  if (platform === undefined) delete (globalThis as any).appInfo
  else (globalThis as any).appInfo = { platform }
}
afterEach(() => as(undefined))

const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Electron/44 Safari/537.36'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36'

test('the desktop says so outright', () => {
  as('win32'); expect(isWindows({ userAgent: MAC_UA })).toBe(true)
})

test('a desktop that is not Windows is not Windows, whatever the user agent says', () => {
  as('darwin'); expect(isWindows({ userAgent: WINDOWS_UA })).toBe(false)
  as('linux'); expect(isWindows({ userAgent: WINDOWS_UA })).toBe(false)
})

// 'vscode' is not an operating system — it is the shim saying it is embedded.
test('inside the panel the browser is asked instead', () => {
  as('vscode')
  expect(isWindows({ userAgent: WINDOWS_UA })).toBe(true)
  expect(isWindows({ userAgent: MAC_UA })).toBe(false)
})

test('no appInfo at all falls back the same way', () => {
  as(undefined)
  expect(isWindows({ userAgent: WINDOWS_UA })).toBe(true)
  expect(isWindows({ userAgent: MAC_UA })).toBe(false)
})

test('nothing to go on is not Windows', () => {
  as(undefined)
  expect(isWindows({})).toBe(false)
  expect(isWindows({ userAgent: '' })).toBe(false)
})
