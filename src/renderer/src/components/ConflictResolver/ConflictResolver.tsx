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

export default function ConflictResolver({ file, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [selections, setSelections] = useState<Record<number, { order: ('ours' | 'theirs')[] }>>({})
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
      if (fileRes.error) {
        showToast(fileRes.error, 'err')
        return
      }
      const raw = fileRes.content || ''
      const lines = raw.split('\n')
      const newChunks: Chunk[] = []
      let currCommon: string[] = []
      let inConflict = false
      let phase = ''
      let conflictOurs: string[] = []
      let conflictTheirs: string[] = []
      let conflictBase: string[] = []
      let oursName = '', theirsName = ''
      let chunkId = 0
      let chunkOursStart = 1
      let chunkTheirsStart = 1

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.startsWith('<<<<<<<')) {
          if (currCommon.length > 0) {
            newChunks.push({
              id: chunkId++, type: 'common', lines: currCommon,
              ours: [], theirs: [], base: [], oursName: '', theirsName: '',
              oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
            })
            chunkOursStart += currCommon.length
            chunkTheirsStart += currCommon.length
            currCommon = []
          }
          inConflict = true
          phase = 'ours'
          oursName = line.replace('<<<<<<< ', '').trim()
          conflictOurs = []
          conflictTheirs = []
          conflictBase = []
        } else if (line.startsWith('|||||||')) {
          phase = 'base' // diff3 format — capture base content
        } else if (line.startsWith('=======')) {
          phase = 'theirs'
        } else if (line.startsWith('>>>>>>>')) {
          theirsName = line.replace('>>>>>>> ', '').trim()
          newChunks.push({
            id: chunkId++, type: 'conflict', lines: [],
            ours: conflictOurs, theirs: conflictTheirs, base: conflictBase,
            oursName, theirsName,
            oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
          })
          chunkOursStart += conflictOurs.length
          chunkTheirsStart += conflictTheirs.length
          inConflict = false
          phase = ''
        } else {
          if (!inConflict) {
            currCommon.push(line)
          } else if (phase === 'ours') {
            conflictOurs.push(line)
          } else if (phase === 'theirs') {
            conflictTheirs.push(line)
          } else if (phase === 'base') {
            conflictBase.push(line)
          }
        }
      }
      if (currCommon.length > 0) {
        newChunks.push({
          id: chunkId++, type: 'common', lines: currCommon,
          ours: [], theirs: [], base: [], oursName: '', theirsName: '',
          oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
        })
      }

      // If no diff3 base content was parsed (standard 2-way format), extract
      // per-chunk base from git stage 1 by anchoring on common lines.
      // Common lines are identical across all three versions, so we can use them
      // to locate conflict boundaries in the clean stage-1 file.
      const hasDiff3Base = newChunks.some(c => c.type === 'conflict' && c.base.length > 0)
      if (!hasDiff3Base && versionsRes.base) {
        const baseLines = versionsRes.base.split('\n')
        let bPos = 0 // current position in stage-1

        for (let ci = 0; ci < newChunks.length; ci++) {
          const c = newChunks[ci]
          if (c.type === 'common') {
            bPos += c.lines.length
          } else {
            // Find where the next common chunk starts in stage-1 by matching its lines
            let nextCommonStart = baseLines.length
            for (let j = ci + 1; j < newChunks.length; j++) {
              if (newChunks[j].type !== 'common') continue
              const needle = newChunks[j].lines
              if (needle.length === 0) { nextCommonStart = bPos; break }
              outer: for (let k = bPos; k <= baseLines.length - needle.length; k++) {
                for (let m = 0; m < needle.length; m++) {
                  if (baseLines[k + m] !== needle[m]) continue outer
                }
                nextCommonStart = k
                break
              }
              break
            }
            c.base = baseLines.slice(bPos, nextCommonStart)
            bPos = nextCommonStart
          }
        }
      }

      setChunks(newChunks)
      const initialSel: Record<number, { order: ('ours' | 'theirs')[] }> = {}
      newChunks.forEach(c => {
        if (c.type === 'conflict') initialSel[c.id] = { order: [] }
      })
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
        const sel = selections[c.id]
        if (sel?.order.length > 0) {
          sel.order.forEach(side => {
            const lines = side === 'ours' ? c.ours : c.theirs
            lines.forEach(l => out.push({ text: l, source: side }))
          })
        } else {
          c.base.forEach(l => out.push({ text: l, source: 'base' }))
        }
      }
    }
    if (out.length > 0 && out[out.length - 1].text === '') out.pop()
    return out
  }, [chunks, selections])

  const outputString = useMemo(
    () => outputLines.map(l => l.text).join('\n'),
    [outputLines]
  )

  const currentOutput = manualOutput !== null ? manualOutput : outputString

  const toggleSelection = (id: number, side: 'ours' | 'theirs') => {
    setSelections(prev => {
      const current = prev[id]?.order ?? []
      const isSelected = current.includes(side)
      const newOrder = isSelected
        ? current.filter(s => s !== side)
        : [...current, side]
      return { ...prev, [id]: { order: newOrder } }
    })
    setManualOutput(null)
  }

  const selectAll = (side: 'ours' | 'theirs') => {
    const conflictChunks = chunks.filter(c => c.type === 'conflict')
    const allSelected = conflictChunks.every(c => selections[c.id]?.order.includes(side))
    setSelections(prev => {
      const next = { ...prev }
      conflictChunks.forEach(c => {
        const current = prev[c.id]?.order ?? []
        next[c.id] = {
          order: allSelected
            ? current.filter(s => s !== side)
            : current.includes(side) ? current : [side]
        }
      })
      return next
    })
    setManualOutput(null)
  }

  const handleSave = async () => {
    if (manualOutput === null) {
      const conflictChunks = chunks.filter(c => c.type === 'conflict')
      // A chunk is unresolved only if it has no selection AND no base fallback
      const hasUnresolved = conflictChunks.some(
        c => selections[c.id].order.length === 0 && c.base.length === 0
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
    if (r.success) {
      showToast(`✓ ${file} résolu`)
      onFinish()
    } else {
      showToast(`Erreur: ${r.error}`, 'err')
    }
  }

  const handleScroll = (source: 'ours' | 'theirs') => {
    if (isSyncing.current) return
    isSyncing.current = true
    const src = source === 'ours' ? oursRef.current : theirsRef.current
    const dst = source === 'ours' ? theirsRef.current : oursRef.current
    if (src && dst) {
      dst.scrollTop = src.scrollTop
      dst.scrollLeft = src.scrollLeft
    }
    requestAnimationFrame(() => { isSyncing.current = false })
  }

  const renderLines = (lines: string[], startNum: number) =>
    lines.map((l, i) => (
      <div key={i} className="mt-line">
        <span className="mt-line-num">{startNum + i}</span>
        <span className="mt-line-content">{l}</span>
      </div>
    ))

  if (loading) {
    return <div className="mt-container"><div className="mt-loading">Chargement…</div></div>
  }

  const conflictChunks = chunks.filter(c => c.type === 'conflict')
  const resolvedCount = conflictChunks.filter(
    c => selections[c.id].order.length > 0 || c.base.length > 0
  ).length
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
            const isSelected = selections[c.id].order.includes(isOurs ? 'ours' : 'theirs')
            const noneSelected = selections[c.id].order.length === 0
            const conflictLines = isOurs ? c.ours : c.theirs
            const startLine = isOurs ? c.oursStartLine : c.theirsStartLine
            return (
              <div
                key={i}
                className={`mt-block-conflict ${isOurs ? 'mt-block-ours' : 'mt-block-theirs'} ${isSelected ? 'selected' : ''}`}
                style={{ minHeight: `${maxLines * 20 + 26}px` }}
                onClick={() => toggleSelection(c.id, side)}
              >
                <div className="mt-block-header">
                  <span className="mt-conflict-num">#{conflictIndexMap[c.id]}</span>
                  {isSelected
                    ? <span className="mt-selected-badge">✓ Sélectionné</span>
                    : noneSelected && c.base.length > 0
                      ? <span className="mt-base-hint">Base active</span>
                      : <span className="mt-click-hint">Cliquer pour sélectionner</span>
                  }
                </div>
                <div className="mt-block-text">
                  {renderLines(conflictLines, startLine)}
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
          <button className="mt-btn mt-btn-all-a" onClick={() => selectAll('ours')} title="Sélectionner toutes les modifications A">Tout A</button>
          <button className="mt-btn mt-btn-all-b" onClick={() => selectAll('theirs')} title="Sélectionner toutes les modifications B">Tout B</button>
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
