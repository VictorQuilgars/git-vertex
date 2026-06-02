import React, { useState, useEffect } from 'react'
import hljs from 'highlight.js'
import './CenterFileDiff.css'

export type CenterDiffTarget =
  | { type: 'commit'; commitHash: string; filePath: string }
  | { type: 'working'; filePath: string; area: 'staged' | 'unstaged' }

interface DiffLine { type: 'add' | 'remove' | 'context'; content: string; oldLine?: number; newLine?: number }
interface DiffHunk { header: string; lines: DiffLine[] }

function parseDiff(raw: string): { to: string; hunks: DiffHunk[] }[] {
  const files: { to: string; hunks: DiffHunk[] }[] = []
  const blocks = raw.split(/^diff --git /m).filter(Boolean)
  for (const block of blocks) {
    const lines = block.split('\n')
    const match = lines[0].match(/a\/(.+?) b\/(.+)/)
    const to = match?.[2] ?? lines[0]
    const hunks: DiffHunk[] = []
    let h: DiffHunk | null = null
    let ol = 0, nl = 0
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('@@')) {
        const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        ol = parseInt(m?.[1] ?? '1'); nl = parseInt(m?.[2] ?? '1')
        h = { header: line, lines: [] }; hunks.push(h)
      } else if (h) {
        if (line.startsWith('+')) h.lines.push({ type: 'add', content: line.slice(1), newLine: nl++ })
        else if (line.startsWith('-')) h.lines.push({ type: 'remove', content: line.slice(1), oldLine: ol++ })
        else if (!line.startsWith('\\') && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++'))
          h.lines.push({ type: 'context', content: line.slice(1), oldLine: ol++, newLine: nl++ })
      }
    }
    if (hunks.length) files.push({ to, hunks })
  }
  return files
}

function detectLang(filename: string): string | undefined {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', css: 'css', scss: 'scss',
    html: 'html', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'bash', c: 'c', cpp: 'cpp', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php',
    sql: 'sql', xml: 'xml', toml: 'toml', vue: 'xml',
  }
  return ext ? map[ext] : undefined
}

function hl(content: string, lang?: string): string {
  try {
    if (lang && hljs.getLanguage(lang))
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  } catch {
    return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

export default function CenterFileDiff({ target, onClose }: {
  target: CenterDiffTarget
  onClose: () => void
}) {
  const [hunks, setHunks] = useState<DiffHunk[]>([])
  const [loading, setLoading] = useState(true)

  const filePath = target.filePath
  const lang = detectLang(filePath)
  const key = target.type === 'commit'
    ? `${target.commitHash}::${target.filePath}`
    : `${target.area}::${target.filePath}`

  useEffect(() => {
    setLoading(true)
    setHunks([])
    const fetch =
      target.type === 'commit'
        ? window.gitAPI.getDiff(target.commitHash).then(r => {
            const all = parseDiff(r.diff ?? '')
            return all.find(f => f.to === target.filePath)?.hunks ?? []
          })
        : window.gitAPI.getWorkingFileDiff(target.filePath, target.area === 'staged').then(r => {
            const all = parseDiff(r.diff ?? '')
            return all.flatMap(f => f.hunks)
          })
    fetch.then(h => { setHunks(h); setLoading(false) })
  }, [key])

  const areaLabel =
    target.type === 'working'
      ? (target.area === 'staged' ? 'Indexé' : 'Non-indexé')
      : target.commitHash.slice(0, 7)

  const badgeCls =
    target.type === 'working'
      ? (target.area === 'staged' ? 'cfd-staged' : 'cfd-unstaged')
      : 'cfd-commit'

  return (
    <div className="cfd-container">
      <div className="cfd-header">
        <button className="cfd-back" onClick={onClose} title="Retour au graphe">
          ← Retour
        </button>
        <span className={`cfd-area-badge ${badgeCls}`}>{areaLabel}</span>
        <span className="cfd-filepath">{filePath}</span>
      </div>
      <div className="cfd-body">
        {loading && <div className="cfd-loading">Chargement…</div>}
        {!loading && hunks.length === 0 && (
          <div className="cfd-loading">Aucune différence</div>
        )}
        {!loading && hunks.map((hunk, hi) => (
          <div key={hi} className="cfd-hunk">
            <div className="cfd-hunk-header">{hunk.header}</div>
            <table className="cfd-diff-table"><tbody>
              {hunk.lines.map((line, li) => (
                <tr key={li} className={`cfd-dl cfd-dl-${line.type}`}>
                  <td className="cfd-ln">{line.type !== 'add' ? line.oldLine : ''}</td>
                  <td className="cfd-ln">{line.type !== 'remove' ? line.newLine : ''}</td>
                  <td className="cfd-lm">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</td>
                  <td className="cfd-lc">
                    <code className="hljs" dangerouslySetInnerHTML={{ __html: hl(line.content, lang) }} />
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>
        ))}
      </div>
    </div>
  )
}
