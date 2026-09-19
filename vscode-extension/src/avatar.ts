/** Shared by the graph and editor blame; resolving a URL itself needs no network. */
export function resolveAvatar(email: string): string {
  const key = (email || '').trim().toLowerCase()
  const noreply = key.match(/^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/)
  if (noreply?.[1]) return `https://avatars.githubusercontent.com/u/${noreply[1]}?v=4`
  const localPart = key.split('@')[0] || key
  return `https://github.com/identicons/${encodeURIComponent(localPart)}.png`
}
