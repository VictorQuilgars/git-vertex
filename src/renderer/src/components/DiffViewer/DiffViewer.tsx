import React, { useMemo, useState } from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { CommitNode, FileChange } from '../../types'
import './DiffViewer.css'

interface DiffViewerProps {
  commit: CommitNode | null
  diff: string
  files: FileChange[]
  loading: boolean
}

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLine?: number
  newLine?: number
}

interface DiffHunk {
  header: string
  lines: DiffLine[]
}

interface FileDiff {
  from: string
  to: string
  hunks: DiffHunk[]
}

interface SplitRow {
  left: DiffLine | null
  right: DiffLine | null
}

function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = []
  const fileBlocks = raw.split(/^diff --git /m).filter(Boolean)

  for (const block of fileBlocks) {
    const lines = block.split('\n')
    const fileHeader = lines[0]
    const parts = fileHeader.match(/a\/(.+?) b\/(.+)/)
    const from = parts?.[1] ?? '?'
    const to = parts?.[2] ?? '?'

    const hunks: DiffHunk[] = []
    let currentHunk: DiffHunk | null = null
    let oldLine = 0, newLine = 0

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        oldLine = parseInt(match?.[1] ?? '0')
        newLine = parseInt(match?.[2] ?? '0')
        currentHunk = { header: line, lines: [] }
        hunks.push(currentHunk)
      } else if (currentHunk) {
        if (line.startsWith('+')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1), newLine: newLine++ })
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLine: oldLine++ })
        } else if (!line.startsWith('\\') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++')) {
          currentHunk.lines.push({ type: 'context', content: line.slice(1), oldLine: oldLine++, newLine: newLine++ })
        }
      }
    }

    if (hunks.length > 0) files.push({ from, to, hunks })
  }
  return files
}

function detectLanguage(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html',
    json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', bash: 'bash',
    c: 'c', cpp: 'cpp', h: 'c', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift',
    rb: 'ruby', php: 'php', sql: 'sql',
    xml: 'xml', toml: 'toml', vue: 'xml',
  }
  return ext ? map[ext] : undefined
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightCode(content: string, lang?: string): string {
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
    }
    return escapeHtml(content)
  } catch {
    return escapeHtml(content)
  }
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type === 'context') {
      rows.push({ left: lines[i], right: lines[i] })
      i++
    } else {
      const removes: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].type === 'remove') removes.push(lines[i++])
      while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++])
      const max = Math.max(removes.length, adds.length)
      for (let j = 0; j < max; j++) {
        rows.push({ left: removes[j] ?? null, right: adds[j] ?? null })
      }
    }
  }
  return rows
}

function FileList({ files }: { files: FileChange[] }) {
  if (!files.length) return null
  return (
    <div className="file-list">
      {files.map((f, i) => (
        <div key={i} className="file-item">
          <span className={`file-status status-${f.status.toLowerCase()}`}>{f.status}</span>
          <span className="file-path">{f.path}</span>
          <span className="file-stats">
            {f.additions > 0 && <span className="add-count">+{f.additions}</span>}
            {f.deletions > 0 && <span className="del-count">-{f.deletions}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function UnifiedHunk({ hunk, lang }: { hunk: DiffHunk; lang?: string }) {
  return (
    <div className="hunk">
      <div className="hunk-header">{hunk.header}</div>
      <table className="diff-table">
        <tbody>
          {hunk.lines.map((line, li) => (
            <tr key={li} className={`diff-line diff-${line.type}`}>
              <td className="line-num old">{line.type !== 'add' ? line.oldLine : ''}</td>
              <td className="line-num new">{line.type !== 'remove' ? line.newLine : ''}</td>
              <td className="line-marker">
                {line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}
              </td>
              <td className="line-content">
                <code
                  className="hljs"
                  dangerouslySetInnerHTML={{ __html: highlightCode(line.content, lang) }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SplitHunk({ hunk, lang }: { hunk: DiffHunk; lang?: string }) {
  const rows = useMemo(() => buildSplitRows(hunk.lines), [hunk.lines])
  return (
    <div className="hunk">
      <div className="hunk-header split-hunk-header">{hunk.header}</div>
      <table className="diff-table split-table">
        <tbody>
          {rows.map((row, ri) => {
            const leftType = row.left?.type ?? 'empty'
            const rightType = row.right?.type ?? 'empty'
            return (
              <tr key={ri} className="split-row">
                {/* Left side */}
                <td className={`line-num old split-num ${leftType === 'remove' ? 'diff-remove' : leftType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.left?.type !== 'add' ? row.left?.oldLine ?? '' : ''}
                </td>
                <td className={`line-marker split-marker ${leftType === 'remove' ? 'diff-remove' : leftType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.left ? (row.left.type === 'remove' ? '−' : ' ') : ''}
                </td>
                <td className={`line-content split-content ${leftType === 'remove' ? 'diff-remove' : leftType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.left ? (
                    <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(row.left.content, lang) }} />
                  ) : null}
                </td>
                {/* Right side */}
                <td className={`line-num new split-num ${rightType === 'add' ? 'diff-add' : rightType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.right?.type !== 'remove' ? row.right?.newLine ?? '' : ''}
                </td>
                <td className={`line-marker split-marker ${rightType === 'add' ? 'diff-add' : rightType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.right ? (row.right.type === 'add' ? '+' : ' ') : ''}
                </td>
                <td className={`line-content split-content ${rightType === 'add' ? 'diff-add' : rightType === 'context' ? 'diff-context' : 'diff-empty-cell'}`}>
                  {row.right ? (
                    <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightCode(row.right.content, lang) }} />
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function DiffViewer({ commit, diff, files, loading }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const parsedDiff = useMemo(() => parseDiff(diff), [diff])

  if (!commit) {
    return (
      <div className="diff-empty">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="#484f58">
          <path d="M11.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zm-2.25.75a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25zM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM3.5 3.25a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0z"/>
        </svg>
        <p>Sélectionnez un commit pour voir son contenu</p>
      </div>
    )
  }

  return (
    <div className="diff-viewer">
      {/* Commit header */}
      <div className="commit-header">
        <div className="commit-hash-badge" style={{ background: '#1f6feb22', borderColor: '#1f6feb44' }}>
          <code>{commit.shortHash}</code>
        </div>
        <div className="commit-meta">
          <div className="commit-title">{commit.message}</div>
          <div className="commit-sub">
            <span>{commit.author}</span>
            <span className="dot">·</span>
            <span>{new Date(commit.date).toLocaleString('fr-FR')}</span>
          </div>
        </div>
        {/* View mode toggle */}
        <div className="diff-view-toggle">
          <button
            className={`toggle-btn ${viewMode === 'unified' ? 'active' : ''}`}
            onClick={() => setViewMode('unified')}
            title="Vue unifiée"
          >
            Unified
          </button>
          <button
            className={`toggle-btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
            title="Vue côte à côte"
          >
            Split
          </button>
        </div>
      </div>

      {loading ? (
        <div className="diff-loading">
          <div className="spinner" />
          <span>Chargement du diff…</span>
        </div>
      ) : (
        <>
          <FileList files={files} />

          {parsedDiff.length === 0 && !loading && (
            <div className="diff-empty-inner">Aucun changement détecté</div>
          )}

          <div className="diff-scroll">
            {parsedDiff.map((file, fi) => {
              const lang = detectLanguage(file.to)
              return (
                <div key={fi} className="file-diff">
                  <div className="file-diff-header">
                    <span className="file-icon">📄</span>
                    <span className="file-diff-name">{file.to}</span>
                  </div>
                  {viewMode === 'unified'
                    ? file.hunks.map((hunk, hi) => (
                        <UnifiedHunk key={hi} hunk={hunk} lang={lang} />
                      ))
                    : file.hunks.map((hunk, hi) => (
                        <SplitHunk key={hi} hunk={hunk} lang={lang} />
                      ))
                  }
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
