import * as vscode from 'vscode'

export class GitVertexStatusBar {
  private item: vscode.StatusBarItem

  constructor(private readonly openCommand: string) {
    this.item = vscode.window.createStatusBarItem(
      'gitVertex.statusBar',
      vscode.StatusBarAlignment.Left,
      // Just after VS Code's built-in git status bar (priority 10)
      9
    )
    this.item.command = openCommand
    this.item.tooltip = 'Open in Git Vertex'
  }

  update(branch: string | undefined, ahead: number, behind: number): void {
    const cfg = vscode.workspace.getConfiguration('gitVertex')
    if (!cfg.get<boolean>('showStatusBar', true)) {
      this.item.hide()
      return
    }

    if (!branch) {
      this.item.hide()
      return
    }

    let text = `$(git-branch) ${branch}`
    if (ahead > 0)  text += `  ↑${ahead}`
    if (behind > 0) text += `  ↓${behind}`

    this.item.text = text
    this.item.show()
  }

  hide(): void {
    this.item.hide()
  }

  dispose(): void {
    this.item.dispose()
  }
}
