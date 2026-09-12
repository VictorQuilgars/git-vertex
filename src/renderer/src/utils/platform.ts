// Which OS this window is actually running on — in both products.
//
// The desktop preload exposes `window.appInfo.platform` as `process.platform`,
// and that is authoritative. The VS Code panel cannot use the same field: its
// shim sets `platform` to the literal `'vscode'`, and SettingsContext reads
// that to know it is embedded, so the value is spoken for. What is left there
// is the one thing a webview always has — it is a browser, and a browser knows
// what it is running on.
//
// Wrong only means a piece of advice is shown to someone who cannot use it, or
// withheld from someone who could. Nothing here decides behaviour.
export function isWindows(nav: { userAgent?: string } = typeof navigator !== 'undefined' ? navigator : {}): boolean {
  const declared = (globalThis as { appInfo?: { platform?: string } }).appInfo?.platform
  if (declared === 'win32') return true
  // 'darwin' and 'linux' are the desktop being explicit; only the panel's
  // 'vscode' (or nothing at all) leaves the question open.
  if (declared && declared !== 'vscode') return false
  return /Windows/i.test(nav?.userAgent ?? '')
}
