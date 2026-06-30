import React, { useState, useEffect, useCallback } from 'react'
import hljs from 'highlight.js'
import './CenterFileDiff.css'

export type CenterDiffTarget =
  | { type: 'commit'; commitHash: string; filePath: string }
  | { type: 'working'; filePath: string; area: 'staged' | 'unstaged' }

interface DiffLine { type: 'add' | 'remove' | 'context'; content: string; oldLine?: number; newLine?: number; noNewline?: boolean }
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
        // "\ No newline at end of file" applies to the line just emitted — keep it
        // so the rebuilt patch reproduces the missing trailing newline exactly.
        else if (line.startsWith('\\')) { if (h.lines.length) h.lines[h.lines.length - 1].noNewline = true }
        // A real blank context line is " " (length 1); a length-0 line is the
        // trailing split('\n') artifact — skip it so it isn't counted as a
        // phantom context line (which made the rebuilt patch fail to apply).
        else if (line.length > 0 && !line.startsWith('index ') && !line.startsWith('---') && !line.startsWith('+++'))
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

function buildPatch(filePath: string, hunk: DiffHunk, selectedLineKeys?: Set<string>): string {
  const lines = selectedLineKeys
    ? hunk.lines.flatMap(l => {
        const key = `${l.type}:${l.oldLine ?? ''}:${l.newLine ?? ''}`
        if (l.type === 'context') return [l]
        if (selectedLineKeys.has(key)) return [l]
        // Unselected add: skip (don't stage it)
        if (l.type === 'add') return []
        // Unselected remove: convert to context (don't remove it)
        return [{ ...l, type: 'context' as const }]
      })
    : hunk.lines

  const oldCount = lines.filter(l => l.type !== 'add').length
  const newCount = lines.filter(l => l.type !== 'remove').length
  const m = hunk.header.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/)
  const oldStart = parseInt(m?.[1] ?? '1')
  const newStart = parseInt(m?.[2] ?? '1')
  const rest = m?.[3] ?? ''

  const hunkHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${rest}`
  const lineStrings: string[] = []
  for (const l of lines) {
    const prefix = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '
    lineStrings.push(prefix + l.content)
    if (l.noNewline) lineStrings.push('\\ No newline at end of file')
  }

  return `--- a/${filePath}\n+++ b/${filePath}\n${hunkHeader}\n${lineStrings.join('\n')}\n`
}

export default function CenterFileDiff({ target, onClose, onStaged, onChangeArea }: {
  target: CenterDiffTarget
  onClose?: () => void
  onStaged?: () => void
  // When provided (e.g. the standalone staging editor tab), shows a
  // Non-indexé/Indexé toggle in the header for working files.
  onChangeArea?: (area: 'staged' | 'unstaged') => void
}) {
  const [hunks, setHunks] = useState<DiffHunk[]>([])
  const [loading, setLoading] = useState(true)
  const [showFullFile, setShowFullFile] = useState(false)
  const [fullContent, setFullContent] = useState<string>('')
  const [fullLoading, setFullLoading] = useState(false)
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set())
  const [applyError, setApplyError] = useState<string | null>(null)
  // Working files: show only the changes (3 lines of context) or the whole file
  // with the changes highlighted. Same renderer — just a wider `git diff -U`.
  const [wholeFile, setWholeFile] = useState(false)

  const filePath = target.filePath
  const lang = detectLang(filePath)
  const isWorking = target.type === 'working'
  const isStaged = isWorking && target.area === 'staged'
  const key = target.type === 'commit'
    ? `${target.commitHash}::${target.filePath}`
    : `${target.area}::${target.filePath}`

  useEffect(() => {
    setLoading(true)
    setHunks([])
    setSelectedLines(new Set())
    setApplyError(null)
    const fetch =
      target.type === 'commit'
        ? window.gitAPI.getDiff(target.commitHash).then(r => {
            const all = parseDiff(r.diff ?? '')
            return all.find(f => f.to === target.filePath)?.hunks ?? []
          })
        : window.gitAPI.getWorkingFileDiff(target.filePath, target.area === 'staged', wholeFile ? 100000 : 3).then(r => {
            const all = parseDiff(r.diff ?? '')
            return all.flatMap(f => f.hunks)
          })
    fetch.then(h => { setHunks(h); setLoading(false) })
  }, [key, wholeFile])

  useEffect(() => {
    if (showFullFile && target.type === 'commit' && !fullContent) {
      setFullLoading(true)
      window.gitAPI.getFileAtCommit(target.commitHash, target.filePath).then(r => {
        setFullContent(r.content ?? '')
        setFullLoading(false)
      })
    }
  }, [showFullFile])

  const lineKey = (l: DiffLine) => `${l.type}:${l.oldLine ?? ''}:${l.newLine ?? ''}`

  const toggleLine = useCallback((l: DiffLine) => {
    if (l.type === 'context') return
    const k = lineKey(l)
    setSelectedLines(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }, [])

  const toggleHunk = useCallback((hunk: DiffHunk) => {
    const changeableKeys = hunk.lines
      .filter(l => l.type !== 'context')
      .map(lineKey)
    const allSelected = changeableKeys.every(k => selectedLines.has(k))
    setSelectedLines(prev => {
      const next = new Set(prev)
      if (allSelected) {
        changeableKeys.forEach(k => next.delete(k))
      } else {
        changeableKeys.forEach(k => next.add(k))
      }
      return next
    })
  }, [selectedLines])

  const applyHunk = useCallback(async (hunk: DiffHunk) => {
    setApplyError(null)
    const patch = buildPatch(filePath, hunk)
    const result = await window.gitAPI.applyPatch(patch, isStaged)
    if (result.success) {
      onStaged?.()
      // Reload diff
      const r = await window.gitAPI.getWorkingFileDiff(filePath, isStaged, wholeFile ? 100000 : 3)
      const all = parseDiff(r.diff ?? '')
      setHunks(all.flatMap(f => f.hunks))
      setSelectedLines(new Set())
    } else {
      setApplyError(result.error ?? 'Erreur inconnue')
    }
  }, [filePath, isStaged, onStaged, wholeFile])

  const applySelectedLines = useCallback(async () => {
    if (selectedLines.size === 0) return
    setApplyError(null)

    // Group selected lines by hunk and build per-hunk patches
    const patches = hunks
      .map(hunk => {
        const hunkKeys = hunk.lines.filter(l => l.type !== 'context').map(lineKey)
        const selected = new Set(hunkKeys.filter(k => selectedLines.has(k)))
        if (selected.size === 0) return null
        return buildPatch(filePath, hunk, selected)
      })
      .filter(Boolean) as string[]

    for (const patch of patches) {
      const result = await window.gitAPI.applyPatch(patch, isStaged)
      if (!result.success) {
        setApplyError(result.error ?? 'Erreur inconnue')
        return
      }
    }
    onStaged?.()
    const r = await window.gitAPI.getWorkingFileDiff(filePath, isStaged, wholeFile ? 100000 : 3)
    const all = parseDiff(r.diff ?? '')
    setHunks(all.flatMap(f => f.hunks))
    setSelectedLines(new Set())
  }, [selectedLines, hunks, filePath, isStaged, onStaged, wholeFile])

  const areaLabel =
    target.type === 'working'
      ? (target.area === 'staged' ? 'Indexé' : 'Non-indexé')
      : target.commitHash.slice(0, 7)

  const badgeCls =
    target.type === 'working'
      ? (target.area === 'staged' ? 'cfd-staged' : 'cfd-unstaged')
      : 'cfd-commit'

  const actionLabel = isStaged ? 'Désindexer' : 'Indexer'

  return (
    <div className={`cfd-container ${isStaged ? 'cfd-staged-mode' : ''}`}>
      <div className="cfd-header">
        {onClose && (
          <button className="cfd-back" onClick={onClose} title="Retour au graphe">
            ← Retour
          </button>
        )}
        {onChangeArea && isWorking ? (
          <div className="cfd-area-toggle">
            <button className={!isStaged ? 'active' : ''} onClick={() => onChangeArea('unstaged')}>Non-indexé</button>
            <button className={isStaged ? 'active' : ''} onClick={() => onChangeArea('staged')}>Indexé</button>
          </div>
        ) : (
          <span className={`cfd-area-badge ${badgeCls}`}>{areaLabel}</span>
        )}
        <span className="cfd-filepath">{filePath}</span>
        {isWorking && selectedLines.size > 0 && (
          <button className="cfd-apply-btn" onClick={applySelectedLines}>
            {isStaged ? '◂ ' : ''}{actionLabel} {selectedLines.size} ligne{selectedLines.size > 1 ? 's' : ''}{isStaged ? '' : ' ▸'}
          </button>
        )}
        {isWorking && (
          <button
            className={`cfd-toggle ${wholeFile ? 'active' : ''}`}
            onClick={() => setWholeFile(v => !v)}
            title={wholeFile ? 'Afficher seulement les modifications' : 'Afficher tout le fichier'}
          >
            {wholeFile ? '◆ Fichier entier' : '◇ Modifications'}
          </button>
        )}
        {target.type === 'commit' && (
          <button
            className={`cfd-toggle ${showFullFile ? 'active' : ''}`}
            onClick={() => setShowFullFile(v => !v)}
            title={showFullFile ? 'Afficher seulement les modifications' : 'Afficher le fichier complet'}
          >
            {showFullFile ? '◆ Fichier' : '◇ Diff'}
          </button>
        )}
      </div>
      {applyError && (
        <div className="cfd-error">{applyError}</div>
      )}
      <div className="cfd-body">
        {showFullFile ? (
          <>
            {fullLoading && <div className="cfd-loading">Chargement…</div>}
            {!fullLoading && fullContent && (
              <table className="cfd-full-table"><tbody>
                {fullContent.split('\n').map((line, i) => (
                  <tr key={i} className="cfd-full-line">
                    <td className="cfd-full-ln">{i + 1}</td>
                    <td className="cfd-full-lc">
                      <code className="hljs" dangerouslySetInnerHTML={{ __html: hl(line, lang) }} />
                    </td>
                  </tr>
                ))}
              </tbody></table>
            )}
            {!fullLoading && !fullContent && <div className="cfd-loading">Erreur : impossible de charger le fichier</div>}
          </>
        ) : (
          <>
            {loading && <div className="cfd-loading">Chargement…</div>}
            {!loading && hunks.length === 0 && (
              <div className="cfd-loading">Aucune différence</div>
            )}
            {!loading && hunks.map((hunk, hi) => {
              const changeableKeys = hunk.lines.filter(l => l.type !== 'context').map(lineKey)
              const allHunkSelected = changeableKeys.length > 0 && changeableKeys.every(k => selectedLines.has(k))
              return (
                <div key={hi} className="cfd-hunk">
                  <div className="cfd-hunk-header">
                    <span>{hunk.header}</span>
                    {isWorking && (
                      <div className="cfd-hunk-actions">
                        <button
                          className={`cfd-hunk-select ${allHunkSelected ? 'active' : ''}`}
                          onClick={() => toggleHunk(hunk)}
                          title={allHunkSelected ? 'Désélectionner ce bloc' : 'Sélectionner ce bloc'}
                        >
                          {allHunkSelected ? '☑' : '☐'} Bloc
                        </button>
                        <button
                          className="cfd-hunk-apply"
                          onClick={() => applyHunk(hunk)}
                          title={`${actionLabel} ce bloc`}
                        >
                          {isStaged ? '◂ ' : ''}{actionLabel} le bloc{isStaged ? '' : ' ▸'}
                        </button>
                      </div>
                    )}
                  </div>
                  <table className="cfd-diff-table"><tbody>
                    {hunk.lines.map((line, li) => {
                      const k = lineKey(line)
                      const isSelected = selectedLines.has(k)
                      const isChangeable = line.type !== 'context'
                      return (
                        <tr
                          key={li}
                          className={`cfd-dl cfd-dl-${line.type} ${isSelected ? 'cfd-dl--selected' : ''} ${isWorking && isChangeable ? 'cfd-dl--selectable' : ''}`}
                          onClick={isWorking && isChangeable ? () => toggleLine(line) : undefined}
                        >
                          <td className="cfd-ln">{line.type !== 'add' ? line.oldLine : ''}</td>
                          <td className="cfd-ln">{line.type !== 'remove' ? line.newLine : ''}</td>
                          <td className="cfd-lm">{line.type === 'add' ? '+' : line.type === 'remove' ? '−' : ' '}</td>
                          <td className="cfd-lc">
                            <code className="hljs" dangerouslySetInnerHTML={{ __html: hl(line.content, lang) }} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody></table>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
