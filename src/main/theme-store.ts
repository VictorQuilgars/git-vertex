// The theme store — catalogue, install, remove, list.
//
// Free of `electron` and `vscode` for the same reason as theme-validate.ts:
// both products run this. The desktop passes `app.getPath('userData')`, the
// extension passes its `globalStorageUri.fsPath`, and everything else is the
// same code. The extension host has Node, so there is no reason for it to have
// a poorer implementation — and a method that exists on both sides with a
// weaker signature is the failure mode CLAUDE.md calls the worse case.
//
// Layout under <base>/themes/:
//   installed.json   the manifest — id, name, licence, notice, installedAt
//   <id>.json        one payload per theme, exactly as served
//
// The manifest is a convenience, not the source of truth. A theme is installed
// if its file is on disk and validates; the manifest is rebuilt from the files
// when the two disagree, because the files are what the app actually applies.

import { join } from 'path'
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync,
} from 'fs'
import { validateTheme, type ThemePayload } from './theme-validate'

/** Where the bank is served from. Same origin as the marketing site, so its
 *  gallery reads this index without any CORS arrangement. */
export const THEMES_BASE_URL =
  process.env.GV_THEMES_URL ?? 'https://gitvertex.vi-lab.fr/themes/v1'

/** A user who installed everything would spend ~4 MB; the cap is about the
 *  picker staying usable, not about disk. Surfaced in the UI. */
export const MAX_INSTALLED = 200

/** How long a cached catalogue is served before we re-ask. Matches the
 *  `Cache-Control: max-age=3600` the server sends on index.json. */
const CATALOGUE_TTL_MS = 3600_000

export interface CatalogueRow {
  id: string
  name: string
  dark: boolean
  canvas: string
  text: string
  border: string
  accent: string
  lic: string
  src: string
  version: string
  hue: string
  vivid: string
  dl: number
}

export interface ThemeCatalogue {
  version: number
  generatedAt: string
  count: number
  themes: CatalogueRow[]
  /** True when this came from disk because the network did not answer. The
   *  picker says so rather than pretending the list is current. */
  stale?: boolean
  /** Set when there is no list at all. The gallery shows this and the 32
   *  built-in themes stay usable — a settings page must never block on a fetch. */
  error?: string
}

export interface InstalledTheme {
  id: string
  name: string
  dark: boolean
  lic: string
  src: string
  srcUrl: string
  notice: string
  seeds: Record<string, string>
  installedAt: string
}

export interface ThemeStoreOptions {
  /** userData (desktop) or globalStorageUri.fsPath (extension). */
  baseDir: string
  /** Built-in theme ids, so an installed one cannot shadow them. */
  builtIns: readonly string[]
  baseUrl?: string
  /** Injectable so tests do not reach the network. */
  fetchImpl?: typeof fetch
}

export class ThemeStore {
  private readonly dir: string
  private readonly builtIns: readonly string[]
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: ThemeStoreOptions) {
    this.dir = join(opts.baseDir, 'themes')
    this.builtIns = opts.builtIns
    this.baseUrl = (opts.baseUrl ?? THEMES_BASE_URL).replace(/\/+$/, '')
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch
  }

  private ensureDir(): string {
    mkdirSync(this.dir, { recursive: true })
    return this.dir
  }

  private cachePath(): string { return join(this.dir, 'catalogue.json') }
  private themePath(id: string): string { return join(this.dir, `${id}.json`) }
  private manifestPath(): string { return join(this.dir, 'installed.json') }

  // ── Catalogue ──────────────────────────────────────────────────────────────

  /**
   * The list the gallery filters. Cached on disk so the second open is instant
   * and aeroplane mode still shows something.
   *
   * Never throws: a settings page that cannot open because a CDN is down is a
   * worse bug than a stale list.
   */
  async catalogue(opts: { refresh?: boolean } = {}): Promise<ThemeCatalogue> {
    const cached = this.readCache()
    const fresh = cached && Date.now() - Date.parse(cached.fetchedAt) < CATALOGUE_TTL_MS
    if (cached && fresh && !opts.refresh) return cached.catalogue

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/index.json`, {
        headers: cached?.etag ? { 'If-None-Match': cached.etag } : {},
      })
      if (res.status === 304 && cached) {
        this.writeCache(cached.catalogue, cached.etag)
        return cached.catalogue
      }
      if (!res.ok) throw new Error(`server answered ${res.status}`)
      const body = (await res.json()) as ThemeCatalogue
      if (!body || !Array.isArray(body.themes)) throw new Error('not a catalogue')
      this.writeCache(body, res.headers.get('etag'))
      return body
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err)
      if (cached) return { ...cached.catalogue, stale: true }
      return {
        version: 1, generatedAt: '', count: 0, themes: [],
        error: `Could not reach the theme list (${why}).`,
      }
    }
  }

  private readCache(): { catalogue: ThemeCatalogue; etag: string | null; fetchedAt: string } | null {
    try {
      const raw = JSON.parse(readFileSync(this.cachePath(), 'utf-8'))
      if (!raw?.catalogue?.themes) return null
      return raw
    } catch { return null }
  }

  private writeCache(catalogue: ThemeCatalogue, etag: string | null): void {
    try {
      this.ensureDir()
      writeFileSync(
        this.cachePath(),
        JSON.stringify({ catalogue, etag, fetchedAt: new Date().toISOString() }),
        'utf-8',
      )
    } catch { /* a cache that cannot be written is not an error worth raising */ }
  }

  // ── Install ────────────────────────────────────────────────────────────────

  /**
   * Fetches one theme, validates it, and writes it only if it passed.
   *
   * Throws with the reasons on failure — the caller shows them. Rejecting
   * loudly is the point: a theme that fails validation is a defect on the
   * server or an attack, and either way silence would be wrong.
   */
  async install(id: string): Promise<InstalledTheme> {
    // Checked before the id reaches a URL or a path.
    const shape = validateTheme({ id, seeds: {} }, { builtIns: this.builtIns })
    if (shape.errors.some(e => e.includes('theme id') || e.includes('collides'))) {
      throw new Error(shape.errors.filter(e => e.includes('id')).join('; '))
    }

    const installed = this.installed()
    if (installed.length >= MAX_INSTALLED && !installed.some(t => t.id === id)) {
      throw new Error(
        `You have ${installed.length} themes installed, which is the limit. Remove one first.`,
      )
    }

    const res = await this.fetchImpl(`${this.baseUrl}/theme/${id}.json`)
    if (!res.ok) throw new Error(`Could not download that theme (server answered ${res.status}).`)
    const payload = (await res.json()) as ThemePayload

    if (payload?.id !== id) {
      throw new Error(`That theme reports a different id (${JSON.stringify(payload?.id)}).`)
    }
    const check = validateTheme(payload, { builtIns: this.builtIns })
    if (!check.ok) {
      throw new Error(`That theme was rejected: ${check.errors.join('; ')}`)
    }

    this.ensureDir()
    writeFileSync(this.themePath(id), JSON.stringify(payload), 'utf-8')
    const entry = this.toInstalled(payload)
    this.writeManifest([...installed.filter(t => t.id !== id), entry])
    return entry
  }

  private toInstalled(p: ThemePayload): InstalledTheme {
    return {
      id: p.id, name: p.name, dark: p.dark, lic: p.lic, src: p.src,
      srcUrl: p.srcUrl, notice: p.notice, seeds: p.seeds,
      installedAt: new Date().toISOString(),
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /**
   * Every installed theme that still validates.
   *
   * Validation runs HERE too, not only on install: a file in userData can be
   * hand-edited or corrupted after the fact, and this is the path that feeds
   * the stylesheet. A file that fails is deleted and reported, never applied.
   */
  installed(): InstalledTheme[] {
    if (!existsSync(this.dir)) return []
    let names: string[]
    try { names = readdirSync(this.dir) } catch { return [] }

    const out: InstalledTheme[] = []
    for (const f of names) {
      if (!f.endsWith('.json')) continue
      if (f === 'installed.json' || f === 'catalogue.json') continue
      const id = f.slice(0, -5)
      let payload: unknown
      try {
        payload = JSON.parse(readFileSync(join(this.dir, f), 'utf-8'))
      } catch {
        this.discard(id, 'the file is not readable JSON')
        continue
      }
      const check = validateTheme(payload, { builtIns: this.builtIns })
      if (!check.ok) {
        this.discard(id, check.errors.join('; '))
        continue
      }
      out.push(this.toInstalled(payload as ThemePayload))
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }

  /** Rejected themes are removed rather than left to be applied next launch. */
  private readonly discarded: Array<{ id: string; why: string }> = []
  private discard(id: string, why: string): void {
    this.discarded.push({ id, why })
    try { unlinkSync(this.themePath(id)) } catch { /* already gone */ }
  }

  /** What `installed()` threw away on its last run, for the UI to report. */
  takeDiscarded(): Array<{ id: string; why: string }> {
    return this.discarded.splice(0, this.discarded.length)
  }

  remove(id: string): void {
    try { unlinkSync(this.themePath(id)) } catch { /* already gone */ }
    this.writeManifest(this.installed().filter(t => t.id !== id))
  }

  private writeManifest(list: InstalledTheme[]): void {
    try {
      this.ensureDir()
      writeFileSync(this.manifestPath(), JSON.stringify(list, null, 2), 'utf-8')
    } catch { /* the files are the source of truth, not this */ }
  }
}
