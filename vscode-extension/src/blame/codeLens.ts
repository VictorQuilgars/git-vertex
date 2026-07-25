import * as vscode from 'vscode'
import { InlineBlameController } from './inlineBlame'
import { RangeSummary, lensTitle, summarize } from './summary'

// Git CodeLens: "who last touched this, and how many people wrote it" above
// the file and above each container (class, function, method…). Reuses the
// controller's per-version blame cache, so a lens costs no extra git call.

const CONTAINER_KINDS = new Set<vscode.SymbolKind>([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Enum,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Module,
  vscode.SymbolKind.Namespace,
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
])

export class BlameCodeLensProvider implements vscode.CodeLensProvider {
  private readonly emitter = new vscode.EventEmitter<void>()
  readonly onDidChangeCodeLenses = this.emitter.event
  private readonly disposables: vscode.Disposable[] = []
  /** Set by the toggle command; null means "follow the setting". */
  private override: boolean | null = null

  constructor(private readonly blame: InlineBlameController) {
    this.disposables.push(
      blame.onDidChangeBlame(() => this.emitter.fire()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration('gitVertex.codeLens')) return
        if (e.affectsConfiguration('gitVertex.codeLens.enabled')) this.override = null
        this.emitter.fire()
      }),
    )
  }

  isEnabled(): boolean {
    return this.override ?? vscode.workspace.getConfiguration('gitVertex').get<boolean>('codeLens.enabled', true)
  }

  toggle(): void {
    this.override = !this.isEnabled()
    this.emitter.fire()
    vscode.window.setStatusBarMessage(
      `Git Vertex: Git CodeLens ${this.override ? 'on' : 'off'}`, 2000)
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    if (!this.isEnabled() || document.uri.scheme !== 'file') return []

    const lines = await this.blame.getBlame(document)
    if (token.isCancellationRequested || lines.length === 0) return []

    const scopes = vscode.workspace.getConfiguration('gitVertex')
      .get<string[]>('codeLens.scopes', ['document', 'containers'])
    const now = Date.now()
    const lenses: vscode.CodeLens[] = []
    const claimed = new Set<number>()

    const push = (line: number, summary: RangeSummary | null): void => {
      if (!summary || claimed.has(line)) return
      claimed.add(line)
      lenses.push(new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
        title: lensTitle(summary, now),
        command: 'gitVertex.fileHistory',
        arguments: [document.uri],
        tooltip: 'Open file history & blame in Git Vertex',
      }))
    }

    if (scopes.includes('document')) {
      push(0, summarize(lines, 0, document.lineCount - 1))
    }

    if (scopes.includes('containers')) {
      const symbols = await this.symbolsOf(document)
      if (token.isCancellationRequested) return lenses
      const visit = (nodes: vscode.DocumentSymbol[]): void => {
        for (const symbol of nodes) {
          if (CONTAINER_KINDS.has(symbol.kind)) {
            push(symbol.range.start.line, summarize(lines, symbol.range.start.line, symbol.range.end.line))
          }
          if (symbol.children?.length) visit(symbol.children)
        }
      }
      visit(symbols)
    }

    return lenses
  }

  private async symbolsOf(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
    try {
      const result = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>(
        'vscode.executeDocumentSymbolProvider', document.uri)
      // Older providers answer with SymbolInformation[], which has no
      // `children` and carries its range under `location` — not usable here.
      if (!Array.isArray(result)) return []
      return result.filter((s): s is vscode.DocumentSymbol => s instanceof Object && 'range' in s)
    } catch {
      return []
    }
  }

  dispose(): void {
    this.emitter.dispose()
    this.disposables.forEach(d => d.dispose())
    this.disposables.length = 0
  }
}
