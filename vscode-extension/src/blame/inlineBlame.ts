import * as vscode from 'vscode'
import * as path from 'path'
import { BlameLine, blameFile, getUserEmail } from './blame'
import { DEFAULT_LINE_FORMAT, formatAnnotation, formatRelative } from './format'
import { HEATMAP_BUCKETS, bucketColor, heatmapBucket, heatmapIcon, resolveHeatmapEnds } from './heatmap'
import { getGitDir, getRepoRootForFile } from '../gitInfo'
import { authorInitials, commitLines, fileAnnotations } from './fileAnnotations'
import { BlameAvatars } from './avatars'

// End-of-line blame annotations: the current line always (when
// enabled), the whole file on demand. Blame is computed per document *version*
// and cached, so moving the cursor never re-runs git — only editing does.

interface CacheEntry {
  version: number
  lines: Promise<BlameLine[]>
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('gitVertex')
}

export class InlineBlameController implements vscode.Disposable {
  private readonly lineDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 2em',
      color: new vscode.ThemeColor('gitVertex.blameForeground'),
      fontStyle: 'italic',
    },
    // The annotation is virtual text past the end of the line: typing there
    // must not drag it into the document's own ranges.
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
  })

  // A separate type from the line one: toggling file blame off must not clear
  // the current-line annotation, and vice versa.
  private readonly fileDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      margin: '0 0 0 2em',
      color: new vscode.ThemeColor('gitVertex.blameForeground'),
      fontStyle: 'italic',
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
  })

  private readonly commitDecoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
  })
  private avatarRefresh: NodeJS.Timeout | null = null
  private disposed = false
  private readonly avatars = new BlameAvatars(() => {
    if (this.disposed || this.avatarRefresh) return
    this.avatarRefresh = setTimeout(() => { this.avatarRefresh = null; this.renderAll() }, 50)
  })

  private heatDecorations: vscode.TextEditorDecorationType[] | null = null
  /** Colour values already reported as unusable, so each is said once. */
  private readonly rejectedColors = new Set<string>()

  private readonly cache = new Map<string, CacheEntry>()
  private readonly emails = new Map<string, Promise<string>>()
  private readonly repoRoots = new Map<string, string | null>()
  /** Documents currently showing whole-file annotations, by uri string. */
  private readonly fileMode = new Set<string>()
  /** Set by the toggle command; null means "follow the setting". */
  private lineOverride: boolean | null = null

  private readonly renders = new WeakMap<vscode.TextEditor, number>()
  private readonly disposables: vscode.Disposable[] = []
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | undefined>()
  /** Fires when cached blame is dropped — the CodeLens provider listens. */
  readonly onDidChangeBlame = this.changeEmitter.event

  private editDebounce: NodeJS.Timeout | null = null
  private repoWatcher: vscode.FileSystemWatcher | null = null

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.renderAll()),
      vscode.window.onDidChangeVisibleTextEditors(() => this.renderAll()),
      vscode.window.onDidChangeTextEditorSelection(e => { void this.render(e.textEditor) }),
      vscode.workspace.onDidChangeTextDocument(e => this.onEdit(e.document)),
      vscode.workspace.onDidSaveTextDocument(doc => { this.invalidate(doc.uri); this.renderAll() }),
      vscode.workspace.onDidCloseTextDocument(doc => {
        this.cache.delete(doc.uri.toString())
        this.fileMode.delete(doc.uri.toString())
      }),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration('gitVertex.blame')) return
        // An explicit setting change wins over a session toggle.
        if (e.affectsConfiguration('gitVertex.blame.line.enabled')) this.lineOverride = null
        this.cache.clear()
        this.disposeHeatDecorations()
        this.changeEmitter.fire(undefined)
        this.renderAll()
      }),
    )
    this.renderAll()
  }

  /**
   * Watch the repository so a commit, checkout or rebase refreshes what the
   * annotations say — blame output depends on history, not just on the buffer.
   */
  watch(repoRoot: string): void {
    this.repoWatcher?.dispose()
    this.repoWatcher = null
    const gitDir = getGitDir(repoRoot)
    if (!gitDir) return

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(gitDir, '{HEAD,index}'),
    )
    const invalidateAll = (): void => {
      this.cache.clear()
      this.changeEmitter.fire(undefined)
      this.renderAll()
    }
    watcher.onDidCreate(invalidateAll)
    watcher.onDidChange(invalidateAll)
    watcher.onDidDelete(invalidateAll)
    this.repoWatcher = watcher
    this.disposables.push(watcher)
  }

  // ── Blame data (shared with the CodeLens provider) ────────────
  async getBlame(document: vscode.TextDocument): Promise<BlameLine[]> {
    if (document.uri.scheme !== 'file' || document.isUntitled) return []

    const maxLines = config().get<number>('blame.maxFileLines', 20000)
    if (maxLines > 0 && document.lineCount > maxLines) return []

    const key = document.uri.toString()
    const cached = this.cache.get(key)
    if (cached && cached.version === document.version) return cached.lines

    const lines = this.runBlame(document)
    this.cache.set(key, { version: document.version, lines })
    return lines
  }

  private async runBlame(document: vscode.TextDocument): Promise<BlameLine[]> {
    const filePath = document.uri.fsPath
    const repoRoot = this.repoRootFor(filePath)
    if (!repoRoot) return []

    const rel = path.relative(repoRoot, filePath).split(path.sep).join('/')
    return blameFile(repoRoot, rel, {
      // Unsaved edits are fed to git so line numbers still line up with the
      // buffer, and the edited lines report themselves as uncommitted.
      contents: document.isDirty ? document.getText() : undefined,
      ignoreWhitespace: config().get<boolean>('blame.ignoreWhitespace', true),
    })
  }

  repoRootFor(filePath: string): string | null {
    const dir = path.dirname(filePath)
    if (!this.repoRoots.has(dir)) this.repoRoots.set(dir, getRepoRootForFile(filePath))
    return this.repoRoots.get(dir) ?? null
  }

  private userEmail(repoRoot: string): Promise<string> {
    let pending = this.emails.get(repoRoot)
    if (!pending) {
      pending = getUserEmail(repoRoot)
      this.emails.set(repoRoot, pending)
    }
    return pending
  }

  private invalidate(uri: vscode.Uri): void {
    this.cache.delete(uri.toString())
    this.changeEmitter.fire(uri)
  }

  private onEdit(document: vscode.TextDocument): void {
    this.invalidate(document.uri)
    // Re-blaming on every keystroke would spawn a git process per character.
    if (this.editDebounce) clearTimeout(this.editDebounce)
    this.editDebounce = setTimeout(() => this.renderAll(), 400)
  }

  // ── Commands ──────────────────────────────────────────────────
  isLineBlameEnabled(): boolean {
    return this.lineOverride ?? config().get<boolean>('blame.line.enabled', true)
  }

  toggleLineBlame(): void {
    this.lineOverride = !this.isLineBlameEnabled()
    this.renderAll()
    vscode.window.setStatusBarMessage(
      `Git Vertex: line blame ${this.lineOverride ? 'on' : 'off'}`, 2000)
  }

  /**
   * Turn whole-file annotations OFF, whatever they were. A toggle is the wrong
   * shape when you just want them gone and cannot remember whether they are on,
   * so this is a separate command rather than an argument to the toggle.
   */
  clearFileBlame(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor): void {
    if (!editor) return
    const key = editor.document.uri.toString()
    if (!this.fileMode.delete(key)) return   // already off: say nothing, do nothing
    void this.render(editor)
    vscode.window.setStatusBarMessage('Git Vertex: file blame cleared', 2000)
  }

  /**
   * Jump to the start of the next (or previous) block of lines that share a
   * commit.
   *
   * "Change" means a different commit from the one the cursor sits in, so a
   * 200-line file written in four sittings has four stops rather than 200. It
   * works whether or not annotations are drawn: the blame is the same either
   * way, and requiring them on first would be a second thing to remember.
   */
  async goToChange(
    direction: 'next' | 'previous',
    editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor,
  ): Promise<void> {
    if (!editor) { vscode.window.showWarningMessage('Open a file to step through its changes.'); return }
    const lines = await this.getBlame(editor.document)
    if (lines.length === 0) {
      vscode.window.setStatusBarMessage('Git Vertex: nothing to step through here', 2000)
      return
    }
    // getBlame is 1-based and may be sparse on an edited buffer; index by line.
    const byLine = new Map(lines.map(l => [l.line, l]))
    const cursor = editor.selection.active.line + 1
    const hashAt = (n: number): string | undefined => byLine.get(n)?.hash
    const current = hashAt(cursor)

    const step = direction === 'next' ? 1 : -1
    const last = editor.document.lineCount
    let seen = current
    for (let n = cursor + step; n >= 1 && n <= last; n += step) {
      const h = hashAt(n)
      if (h === undefined || h === seen) continue
      // Going backwards, landing mid-block is wrong: walk up to its first line
      // so the two directions are symmetric.
      let target = n
      if (direction === 'previous') {
        while (target - 1 >= 1 && hashAt(target - 1) === h) target--
      }
      const pos = new vscode.Position(target - 1, 0)
      editor.selection = new vscode.Selection(pos, pos)
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenterIfOutsideViewport)
      return
    }
    vscode.window.setStatusBarMessage(
      `Git Vertex: no ${direction === 'next' ? 'later' : 'earlier'} change in this file`, 2000)
  }

  toggleFileBlame(editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor): void {
    if (!editor) {
      vscode.window.showWarningMessage('Open a file to annotate it with blame.')
      return
    }
    const key = editor.document.uri.toString()
    if (this.fileMode.has(key)) this.fileMode.delete(key)
    else this.fileMode.add(key)
    void this.render(editor)
  }

  // ── Rendering ─────────────────────────────────────────────────
  renderAll(): void {
    for (const editor of vscode.window.visibleTextEditors) void this.render(editor)
  }

  async render(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!editor || this.disposed) return
    editor.setDecorations(this.commitDecoration, [])

    // Every render for one editor gets a ticket; a slow one that resolves after
    // a newer render has started must not repaint stale annotations.
    const key = editor.document.uri.toString()
    const version = editor.document.version
    const token = (this.renders.get(editor) ?? 0) + 1
    this.renders.set(editor, token)

    const fileMode = this.fileMode.has(key)
    const lines = (fileMode || this.isLineBlameEnabled()) ? await this.getBlame(editor.document) : []
    if (this.disposed || this.renders.get(editor) !== token || editor.document.version !== version) return

    const repoRoot = this.repoRootFor(editor.document.uri.fsPath)
    const email = repoRoot ? await this.userEmail(repoRoot) : ''
    if (this.disposed || this.renders.get(editor) !== token || editor.document.version !== version) return

    const template = config().get<string>('blame.line.format', DEFAULT_LINE_FORMAT) || DEFAULT_LINE_FORMAT
    const messageLength = config().get<number>('blame.messageLength', 60)
    const now = Date.now()
    const showAvatars = fileMode && config().get<boolean>('blame.file.avatars', true)
    const annotate = (line: BlameLine): string =>
      formatAnnotation(template, line, { now, currentUserEmail: email, messageLength })

    const decorationFor = (line: BlameLine, lineIndex: number, continuation = false): vscode.DecorationOptions => {
      const end = editor.document.lineAt(lineIndex).range.end
      const withAvatar = showAvatars && !continuation && !line.uncommitted
      const image = withAvatar ? this.avatars.get(line.authorMail) : null
      const before: vscode.ThemableDecorationAttachmentRenderOptions | undefined = withAvatar
        ? image
          ? { contentIconPath: vscode.Uri.parse(image), width: '14px', height: '14px', margin: '0 0 0 2em' }
          : { contentText: authorInitials(line.author), color: new vscode.ThemeColor('gitVertex.blameForeground'), margin: '0 0 0 2em' }
        : undefined
      return {
        range: new vscode.Range(end, end),
        renderOptions: {
          before,
          after: { contentText: continuation ? '│' : annotate(line), margin: withAvatar ? '0 0 0 0.5em' : '0 0 0 2em' },
        },
        hoverMessage: this.hover(line, editor.document),
      }
    }

    // Whole-file annotations already cover the current line — drawing both
    // would stack two attachments on it.
    const lineDecorations: vscode.DecorationOptions[] = []
    if (!fileMode && this.isLineBlameEnabled() && editor.selection.isEmpty) {
      const index = editor.selection.active.line
      const line = this.lineAt(lines, index)
      if (line && index < editor.document.lineCount) lineDecorations.push(decorationFor(line, index))
    }
    editor.setDecorations(this.lineDecoration, lineDecorations)

    if (!fileMode) {
      editor.setDecorations(this.fileDecoration, [])
      this.clearHeatmap(editor)
      return
    }

    const fileDecorations: vscode.DecorationOptions[] = []
    for (const { line, continuation } of fileAnnotations(lines, config().get<boolean>('blame.file.groupRuns', true))) {
      const index = line.line - 1
      if (index >= 0 && index < editor.document.lineCount) fileDecorations.push(decorationFor(line, index, continuation))
    }
    editor.setDecorations(this.fileDecoration, fileDecorations)
    const active = vscode.window.activeTextEditor
    const cursor = active?.document === editor.document && active.viewColumn === editor.viewColumn && editor.selection.isEmpty
      && config().get<boolean>('blame.file.highlightCommit', true) ? editor.selection.active.line + 1 : undefined
    editor.setDecorations(this.commitDecoration, commitLines(lines, cursor)
      .filter(line => line > 0 && line <= editor.document.lineCount)
      .map(line => editor.document.lineAt(line - 1).range))
    this.renderHeatmap(editor, lines, now)
  }

  /** Blame arrays are ordered, but a stale/partial read must not misattribute. */
  private lineAt(lines: BlameLine[], index: number): BlameLine | undefined {
    const candidate = lines[index]
    if (candidate && candidate.line === index + 1) return candidate
    return lines.find(l => l.line === index + 1)
  }

  private hover(line: BlameLine, document: vscode.TextDocument): vscode.MarkdownString {
    const md = new vscode.MarkdownString()
    md.supportThemeIcons = true
    if (line.uncommitted) {
      md.appendMarkdown('$(git-commit) **Uncommitted changes**')
      return md
    }

    md.isTrusted = true
    const date = new Date(line.authorTime * 1000)
    const author = line.authorMail ? `${line.author} <${line.authorMail}>` : line.author
    md.appendMarkdown(`**${line.summary}**\n\n`)
    md.appendMarkdown(`${author} — ${date.toLocaleString('en-US')} _(${formatRelative(line.authorTime)})_\n\n`)

    const fileArgs = encodeURIComponent(JSON.stringify([document.uri.toString()]))
    const hashArgs = encodeURIComponent(JSON.stringify([line.hash]))
    md.appendMarkdown(
      `\`${line.shortHash}\` · `
      + `[$(git-commit) Show in Graph](command:gitVertex.revealCommit?${hashArgs}) · `
      + `[$(history) File History](command:gitVertex.fileHistory?${fileArgs}) · `
      + `[$(copy) Copy SHA](command:gitVertex.blame.copyHash?${hashArgs})`)
    return md
  }

  // ── Heatmap ───────────────────────────────────────────────────
  private heatmap(): vscode.TextEditorDecorationType[] {
    if (!this.heatDecorations) {
      // Read when the decorations are built: a change to either setting drops
      // them (see the configuration listener), so the next render rebuilds
      // them with the new ends.
      const { ends, rejected } = resolveHeatmapEnds({
        hotColor: config().get<unknown>('blame.heatmap.hotColor'),
        coldColor: config().get<unknown>('blame.heatmap.coldColor'),
      })
      for (const { setting, value } of rejected) {
        const key = `${setting}=${value}`
        if (this.rejectedColors.has(key)) continue
        this.rejectedColors.add(key)
        const used = setting === 'hotColor' ? ends.hot : ends.cold
        void vscode.window.showWarningMessage(
          `Git Vertex: "${value}" is not a #RRGGBB colour — gitVertex.blame.heatmap.${setting} falls back to ${used}.`)
      }
      this.heatDecorations = Array.from({ length: HEATMAP_BUCKETS }, (_unused, bucket) => {
        const color = bucketColor(bucket, HEATMAP_BUCKETS, ends)
        return vscode.window.createTextEditorDecorationType({
          gutterIconPath: vscode.Uri.parse(heatmapIcon(color)),
          gutterIconSize: 'contain',
          overviewRulerColor: color,
          overviewRulerLane: vscode.OverviewRulerLane.Left,
        })
      })
    }
    return this.heatDecorations
  }

  private renderHeatmap(editor: vscode.TextEditor, lines: BlameLine[], now: number): void {
    if (!config().get<boolean>('blame.heatmap.enabled', true)) {
      this.clearHeatmap(editor)
      return
    }
    const threshold = config().get<number>('blame.heatmap.ageThresholdDays', 90)
    const buckets: vscode.Range[][] = Array.from({ length: HEATMAP_BUCKETS }, () => [])

    for (let index = 0; index < editor.document.lineCount; index++) {
      const line = this.lineAt(lines, index)
      // Uncommitted lines have no age to speak of, so they get no bar rather
      // than the hottest one, which would read as "committed seconds ago".
      if (!line || line.uncommitted) continue
      const start = editor.document.lineAt(index).range.start
      buckets[heatmapBucket(line.authorTime, now, threshold)].push(new vscode.Range(start, start))
    }

    const decorations = this.heatmap()
    for (let bucket = 0; bucket < decorations.length; bucket++) {
      editor.setDecorations(decorations[bucket], buckets[bucket])
    }
  }

  private clearHeatmap(editor: vscode.TextEditor): void {
    if (!this.heatDecorations) return
    for (const decoration of this.heatDecorations) editor.setDecorations(decoration, [])
  }

  private disposeHeatDecorations(): void {
    // Disposing a decoration type removes it from every editor, so no explicit
    // clearing is needed here.
    this.heatDecorations?.forEach(d => d.dispose())
    this.heatDecorations = null
  }

  dispose(): void {
    this.disposed = true
    this.avatars.dispose()
    if (this.avatarRefresh) clearTimeout(this.avatarRefresh)
    this.commitDecoration.dispose()
    if (this.editDebounce) clearTimeout(this.editDebounce)
    this.disposeHeatDecorations()
    this.lineDecoration.dispose()
    this.fileDecoration.dispose()
    this.changeEmitter.dispose()
    this.disposables.forEach(d => d.dispose())
    this.disposables.length = 0
  }
}
