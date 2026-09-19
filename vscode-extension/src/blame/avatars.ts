import { resolveAvatar } from '../avatar'

/** Fetch once into a data URI so a failed image can fall back to initials. */
export async function loadAvatar(url: string): Promise<string | null> {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 3000)
  try {
    const response = await fetch(url, { signal: abort.signal })
    const mime = response.headers.get('content-type')?.split(';')[0]
    if (!response.ok || !mime || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) return null
    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 256 * 1024) { abort.abort(); return null }
      chunks.push(value)
    }
    if (!size) return null
    return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`
  } catch { return null }
  finally { clearTimeout(timeout); abort.abort() }
}

/** Bound both memory and network work; cursor movement never repeats a fetch. */
export class BlameAvatars {
  private readonly images = new Map<string, string | null>()
  private readonly requested = new Set<string>()
  private readonly queue: string[] = []
  private running = 0
  private disposed = false

  constructor(private readonly changed: () => void, private readonly load = loadAvatar) {}

  get(email: string): string | null {
    const key = email.trim().toLowerCase()
    if (!key || this.disposed) return null
    const url = resolveAvatar(key)
    if (!this.requested.has(url) && this.requested.size < 256) {
      this.requested.add(url)
      this.queue.push(url)
      this.pump()
    }
    return this.images.get(url) ?? null
  }

  private pump(): void {
    while (!this.disposed && this.running < 4 && this.queue.length) {
      const url = this.queue.shift()!
      this.running++
      void this.load(url).catch(() => null).then(image => {
        if (!this.disposed) { this.images.set(url, image); if (image) this.changed() }
      }).finally(() => { this.running--; this.pump() })
    }
  }

  dispose(): void { this.disposed = true; this.queue.length = 0; this.images.clear(); this.requested.clear() }
}
