// The window never holds a secret's value. The main process sends a mask
// where one is set — see src/main/settings-secrets.ts — and a mask sent back
// means "keep it". This is how the window tells a mask from a value.
export function isSecretMask(value: string | undefined | null): boolean {
  return typeof value === 'string' && /^•{4,}$/.test(value)
}
