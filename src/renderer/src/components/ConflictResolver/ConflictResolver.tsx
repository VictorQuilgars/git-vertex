import React, { useState, useEffect, useMemo } from 'react'
import './ConflictResolver.css'

interface ConflictResolverProps {
  file: string
  onFinish: () => void
  onAbort: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

interface Chunk {
  id: number
  type: 'common' | 'conflict'
  lines: string[]
  ours: string[]
  theirs: string[]
  base: string[]
  oursName: string
  theirsName: string
  oursStartLine: number
  theirsStartLine: number
}

// Each selected line is a reference to a specific line within a side
type LineRef = { side: 'ours' | 'theirs'; index: number }
// selections[chunkId] = ordered list of selected line refs
type Selections = Record<number, LineRef[]>

export default function ConflictResolver({ file, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [selections, setSelections] = useState<Selections>({})
  const [manualOutput, setManualOutput] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const oursRef = React.useRef<HTMLDivElement>(null)
  const theirsRef = React.useRef<HTMLDivElement>(null)
  const isSyncing = React.useRef(false)

  useEffect(() => {
    setLoading(true)
    setManualOutput(null)
    Promise.all([
      window.gitAPI.getFileContent(file),
      window.gitAPI.getConflictVersions(file),
    ]).then(([fileRes, versionsRes]) => {
      if (fileRes.error) { showToast(fileRes.error, 'err'); return }
      const raw = fileRes.content || ''
      const lines = raw.split('\n')
      const newChunks: Chunk[] = []
      let currCommon: string[] = []
      let inConflict = false, phase = ''
      let conflictOurs: string[] = [], conflictTheirs: string[] = [], conflictBase: string[] = []
      let oursName = '', theirsName = ''
      let chunkId = 0, chunkOursStart = 1, chunkTheirsStart = 1

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.startsWith('<<<<<<<')) {
          if (currCommon.length > 0) {
            newChunks.push({ id: chunkId++, type: 'common', lines: currCommon, ours: [], theirs: [], base: [], oursName: '', theirsName: '', oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart })
            chunkOursStart += currCommon.length
            chunkTheirsStart += currCommon.length
            currCommon = []
          }
          inConflict = true; phase = 'ours'
          oursName = line.replace('<<<<<<< ', '').trim()
          conflictOurs = []; conflictTheirs = []; conflictBase = []
        } else if (line.startsWith('|||||||')) { phase = 'base'
        } else if (line.startsWith('=======')) { phase = 'theirs'
        } else if (line.startsWith('>>>>>>>')) {
          theirsName = line.replace('>>>>>>> ', '').trim()
          newChunks.push({ id: chunkId++, type: 'conflict', lines: [], ours: conflictOurs, theirs: conflictTheirs, base: conflictBase, oursName, theirsName, oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart })
          chunkOursStart += conflictOurs.length
          chunkTheirsStart += conflictTheirs.length
          inConflict = false; phase = ''
        } else {
          if (!inConflict) currCommon.push(line)
          else if (phase === 'ours') conflictOurs.push(line)
          else if (phase === 'theirs') conflictTheirs.push(line)
          else if (phase === 'base') conflictBase.push(line)
        }
      }
      if (currCommon.length > 0) {
        newChunks.push({ id: chunkId++, type: 'common', lines: currCommon, ours: [], theirs: [], base: [], oursName: '', theirsName: '', oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart })
      }

      const hasDiff3Base = newChunks.some(c => c.type === 'conflict' && c.base.length > 0)
      if (!hasDiff3Base && versionsRes.base) {
        const baseLines = versionsRes.base.split('\n')
        let bPos = 0
        for (let ci = 0; ci < newChunks.length; ci++) {
          const c = newChunks[ci]
          if (c.type === 'common') { bPos += c.lines.length } else {
            let nextCommonStart = baseLines.length
            for (let j = ci + 1; j < newChunks.length; j++) {
              if (newChunks[j].type !== 'common') continue
              const needle = newChunks[j].lines
              if (needle.length === 0) { nextCommonStart = bPos; break }
              outer: for (let k = bPos; k <= baseLines.length - needle.length; k++) {
                for (let m = 0; m < needle.length; m++) { if (baseLines[k + m] !== needle[m]) continue outer }
                nextCommonStart = k; break
              }
              break
            }
            c.base = baseLines.slice(bPos, nextCommonStart)
            bPos = nextCommonStart
          }
        }
      }

      setChunks(newChunks)
      const initialSel: Selections = {}
      newChunks.forEach(c => { if (c.type === 'conflict') initialSel[c.id] = [] })
      setSelections(initialSel)
      setLoading(false)
    })
  }, [file])

  const conflictIndexMap = useMemo(() => {
    const map: Record<number, number> = {}
    let idx = 0
    chunks.forEach(c => { if (c.type === 'conflict') map[c.id] = ++idx })
    return map
  }, [chunks])

  type LineSource = 'common' | 'ours' | 'theirs' | 'base'

  const outputLines = useMemo(() => {
    const out: { text: string; source: LineSource }[] = []
    for (const c of chunks) {
      if (c.type === 'common') {
        c.lines.forEach(l => out.push({ text: l, source: 'common' }))
      } else {
        const sel = selections[c.id] ?? []
        if (sel.length > 0) {
          sel.forEach(({ side, index }) => {
            const text = (side === 'ours' ? c.ours : c.theirs)[index] ?? ''
            out.push({ text, source: side })
          })
        } else {
          c.base.forEach(l => out.push({ text: l, source: 'base' }))
        }
      }
    }
    if (out.length > 0 && out[out.length - 1].text === '') out.pop()
    return out
  }, [chunks, selections])

  const outputString = useMemo(() => outputLines.map(l => l.text).join('\n'), [outputLines])
  const currentOutput = manualOutput !== null ? manualOutput : outputString

  // Toggle a single line in/out of the output
  const toggleLine = (chunkId: number, side: 'ours' | 'theirs', index: number) => {
    setSelections(prev => {
      const current = prev[chunkId] ?? []
      const exists = current.some(r => r.side === side && r.index === index)
      return {
        ...prev,
        [chunkId]: exists
          ? current.filter(r => !(r.side === side && r.index === index))
          : [...current, { side, index }]
      }
    })
    setManualOutput(null)
  }

  // Toggle ALL lines of a side for a chunk (block header click)
  const toggleBlock = (chunkId: number, side: 'ours' | 'theirs') => {
    const chunk = chunks.find(c => c.id === chunkId)
    if (!chunk) return
    const lines = side === 'ours' ? chunk.ours : chunk.theirs
    setSelections(prev => {
      const current = prev[chunkId] ?? []
      const allIn = lines.every((_, i) => current.some(r => r.side === side && r.index === i))
      if (allIn) {
        return { ...prev, [chunkId]: current.filter(r => r.side !== side) }
      } else {
        const kept = current.filter(r => r.side !== side)
        const toAdd = lines.map((_, i) => ({ side, index: i }))
          .filter(nr => !current.some(r => r.side === side && r.index === nr.index))
        return { ...prev, [chunkId]: [...kept, ...toAdd] }
      }
    })
    setManualOutput(null)
  }

  // Tout A / Tout B — toggle all lines of a side across all chunks
  const selectAll = (side: 'ours' | 'theirs') => {
    const conflictChunks = chunks.filter(c => c.type === 'conflict')
    const allIn = conflictChunks.every(c => {
      const lines = side === 'ours' ? c.ours : c.theirs
      const sel = selections[c.id] ?? []
      return lines.every((_, i) => sel.some(r => r.side === side && r.index === i))
    })
    setSelections(prev => {
      const next = { ...prev }
      conflictChunks.forEach(c => {
        const current = prev[c.id] ?? []
        const lines = side === 'ours' ? c.ours : c.theirs
        if (allIn) {
          next[c.id] = current.filter(r => r.side !== side)
        } else {
          const kept = current.filter(r => r.side !== side)
          const toAdd = lines.map((_, i) => ({ side, index: i }))
            .filter(nr => !current.some(r => r.side === side && r.index === nr.index))
          next[c.id] = [...kept, ...toAdd]
        }
      })
      return next
    })
    setManualOutput(null)
  }

  const handleSave = async () => {
    if (manualOutput === null) {
      const conflictChunks = chunks.filter(c => c.type === 'conflict')
      const hasUnresolved = conflictChunks.some(
        c => (selections[c.id] ?? []).length === 0 && c.base.length === 0
      )
      if (hasUnresolved) {
        showToast('Veuillez faire un choix pour tous les conflits avant d\'enregistrer', 'err')
        return
      }
    } else {
      if (/^[<=>]{7}/m.test(manualOutput)) {
        showToast('L\'output contient encore des marqueurs de conflit (<<<<<<<, =======, >>>>>>>)', 'err')
        return
      }
    }
    const r = await window.gitAPI.resolveConflict(file, currentOutput)
    if (r.success) { showToast(`✓ ${file} résolu`); onFinish() }
    else showToast(`Erreur: ${r.error}`, 'err')
  }

  const handleScroll = (source: 'ours' | 'theirs') => {
    if (isSyncing.current) return
    isSyncing.current = true
    const src = source === 'ours' ? oursRef.current : theirsRef.current
    const dst = source === 'ours' ? theirsRef.current : oursRef.current
    if (src && dst) { dst.scrollTop = src.scrollTop; dst.scrollLeft = src.scrollLeft }
    requestAnimationFrame(() => { isSyncing.current = false })
  }

  const renderLines = (lines: string[], startNum: number) =>
    lines.map((l, i) => (
      <div key={i} className="mt-line">
        <span className="mt-line-num">{startNum + i}</span>
        <span className="mt-line-content">{l}</span>
      </div>
    ))

  const renderConflictLines = (lines: string[], startNum: number, chunkId: number, side: 'ours' | 'theirs') =>
    lines.map((l, i) => {
      const isIn = (selections[chunkId] ?? []).some(r => r.side === side && r.index === i)
      return (
        <div key={i} className={`mt-line mt-line-interactive${isIn ? ' mt-line-in-output' : ''}`}>
          <span className="mt-line-num">
            {startNum + i}
            <button
              className={`mt-line-action ${isIn ? 'mt-line-action-remove' : 'mt-line-action-add'}`}
              title={isIn ? 'Retirer de l\'output' : 'Ajouter à l\'output'}
              onClick={e => { e.stopPropagation(); toggleLine(chunkId, side, i) }}
            >
              {isIn ? '−' : '+'}
            </button>
          </span>
          <span className="mt-line-content">{l}</span>
        </div>
      )
    })

  if (loading) return <div className="mt-container"><div className="mt-loading">Chargement…</div></div>

  const conflictChunks = chunks.filter(c => c.type === 'conflict')
  const resolvedCount = conflictChunks.filter(c => (selections[c.id] ?? []).length > 0 || c.base.length > 0).length
  const totalConflicts = conflictChunks.length
  const oursGlobalName = conflictChunks[0]?.oursName || 'HEAD'
  const theirsGlobalName = conflictChunks[0]?.theirsName || 'Incoming'

  const renderPanel = (side: 'ours' | 'theirs') => {
    const ref = side === 'ours' ? oursRef : theirsRef
    const isOurs = side === 'ours'
    return (
      <div className={`mt-pane ${isOurs ? 'mt-ours-pane' : 'mt-theirs-pane'}`}>
        <div className="mt-pane-header">
          <div className={`mt-badge ${isOurs ? 'mt-badge-ours' : 'mt-badge-theirs'}`}>{isOurs ? 'A' : 'B'}</div>
          <span className="mt-pane-title">{isOurs ? `Nôtre (${oursGlobalName})` : `Leur (${theirsGlobalName})`}</span>
        </div>
        <div className="mt-pane-content" ref={ref} onScroll={() => handleScroll(side)}>
          {chunks.map((c, i) => {
            if (c.type === 'common') {
              return (
                <div key={i} className="mt-block-common">
                  {renderLines(c.lines, isOurs ? c.oursStartLine : c.theirsStartLine)}
                </div>
              )
            }
            const maxLines = Math.max(c.ours.length, c.theirs.length, c.base.length)
            const sel = selections[c.id] ?? []
            const thisSide = isOurs ? 'ours' : 'theirs'
            const conflictLines = isOurs ? c.ours : c.theirs
            const allIn = conflictLines.length > 0 && conflictLines.every((_, i) => sel.some(r => r.side === thisSide && r.index === i))
            const noneSelected = sel.length === 0
            const startLine = isOurs ? c.oursStartLine : c.theirsStartLine
            return (
              <div
                key={i}
                className={`mt-block-conflict ${isOurs ? 'mt-block-ours' : 'mt-block-theirs'} ${allIn ? 'selected' : ''}`}
                style={{ minHeight: `${maxLines * 20 + 26}px` }}
              >
                <div
                  className="mt-block-header"
                  onClick={() => toggleBlock(c.id, side)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="mt-conflict-num">#{conflictIndexMap[c.id]}</span>
                  {sel.some(r => r.side === thisSide)
                    ? <span className="mt-selected-badge">✓ {sel.filter(r => r.side === thisSide).length} / {conflictLines.length} ligne(s)</span>
                    : noneSelected && c.base.length > 0
                      ? <span className="mt-base-hint">Base active</span>
                      : <span className="mt-click-hint">Cliquer le header pour tout sélectionner</span>
                  }
                </div>
                <div className="mt-block-text">
                  {renderConflictLines(conflictLines, startLine, c.id, side)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-container">
      <div className="mt-header">
        <div className="mt-header-left">
          <span className="cr-warning">⚠️</span>
          <span className="mt-filename">{file}</span>
          <span className="mt-count">({totalConflicts} conflict{totalConflicts > 1 ? 's' : ''})</span>
        </div>
        <div className="mt-header-right">
          <button className="mt-btn mt-btn-all-a" onClick={() => selectAll('ours')} title="Sélectionner toutes les lignes A">Tout A</button>
          <button className="mt-btn mt-btn-all-b" onClick={() => selectAll('theirs')} title="Sélectionner toutes les lignes B">Tout B</button>
          <button className="mt-btn mt-btn-abort" onClick={onAbort}>✕ Fermer</button>
          <button className="mt-btn mt-btn-save" onClick={handleSave}>Enregistrer & Résoudre</button>
        </div>
      </div>

      <div className="mt-main">
        <div className="mt-top">
          {renderPanel('ours')}
          {renderPanel('theirs')}
        </div>

        <div className="mt-bottom">
          <div className="mt-pane-header">
            <span className="mt-pane-title">Output ({resolvedCount} / {totalConflicts} résolus)</span>
            {manualOutput !== null
              ? <span className="mt-manual-badge">Édition manuelle active</span>
              : <button className="mt-btn mt-btn-edit" onClick={() => setManualOutput(outputString)}>Éditer</button>
            }
            {manualOutput !== null && (
              <button className="mt-btn mt-btn-edit" onClick={() => setManualOutput(null)}>Annuler l'édition</button>
            )}
          </div>
          <div className="mt-output-wrapper">
            <div className="mt-output-line-numbers">
              {(manualOutput !== null ? manualOutput.split('\n') : outputLines).map((_, i) => (
                <div key={i} className="mt-line-num">{i + 1}</div>
              ))}
            </div>
            {manualOutput !== null ? (
              <textarea
                className="mt-output-editor"
                value={manualOutput}
                onChange={e => setManualOutput(e.target.value)}
                spellCheck={false}
                wrap="off"
                autoFocus
              />
            ) : (
              <div className="mt-output-lines">
                {outputLines.map((l, i) => (
                  <div key={i} className={`mt-line mt-output-line mt-output-line--${l.source}`}>
                    <span className="mt-line-content">{l.text || ' '}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
