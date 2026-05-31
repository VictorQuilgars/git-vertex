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
  oursName: string
  theirsName: string
  oursStartLine: number
  theirsStartLine: number
}

export default function ConflictResolver({ file, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [selections, setSelections] = useState<Record<number, { ours: boolean; theirs: boolean }>>({})
  const [manualOutput, setManualOutput] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Refs for scroll synchronization
  const oursRef = React.useRef<HTMLDivElement>(null)
  const theirsRef = React.useRef<HTMLDivElement>(null)
  const outputRef = React.useRef<HTMLTextAreaElement>(null)
  const isSyncing = React.useRef(false)

  useEffect(() => {
    window.gitAPI.getFileContent(file).then(r => {
      if (r.error) {
        showToast(r.error, 'err')
        return
      }
      const raw = r.content || ''
      const lines = raw.split('\n')
      const newChunks: Chunk[] = []
      let currCommon: string[] = []
      let inConflict = false
      let phase = ''
      let conflictOurs: string[] = []
      let conflictTheirs: string[] = []
      let oursName = '', theirsName = ''
      let chunkId = 0
      
      let currentOursLine = 1
      let currentTheirsLine = 1
      let chunkOursStart = 1
      let chunkTheirsStart = 1

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.startsWith('<<<<<<<')) {
          if (currCommon.length > 0) {
            newChunks.push({
              id: chunkId++, type: 'common', lines: currCommon, ours: [], theirs: [], oursName: '', theirsName: '',
              oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
            })
            chunkOursStart += currCommon.length
            chunkTheirsStart += currCommon.length
            currentOursLine = chunkOursStart
            currentTheirsLine = chunkTheirsStart
            currCommon = []
          }
          inConflict = true
          phase = 'ours'
          oursName = line.replace('<<<<<<< ', '').trim()
          conflictOurs = []
          conflictTheirs = []
        } else if (line.startsWith('|||||||')) {
          phase = 'base'
        } else if (line.startsWith('=======')) {
          phase = 'theirs'
        } else if (line.startsWith('>>>>>>>')) {
          theirsName = line.replace('>>>>>>> ', '').trim()
          newChunks.push({
            id: chunkId++, type: 'conflict', lines: [],
            ours: conflictOurs, theirs: conflictTheirs,
            oursName, theirsName,
            oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
          })
          chunkOursStart += conflictOurs.length
          chunkTheirsStart += conflictTheirs.length
          currentOursLine = chunkOursStart
          currentTheirsLine = chunkTheirsStart
          inConflict = false
          phase = ''
        } else {
          if (!inConflict) {
            currCommon.push(line)
          } else if (phase === 'ours') {
            conflictOurs.push(line)
          } else if (phase === 'theirs') {
            conflictTheirs.push(line)
          }
        }
      }
      if (currCommon.length > 0) {
        newChunks.push({
          id: chunkId++, type: 'common', lines: currCommon, ours: [], theirs: [], oursName: '', theirsName: '',
          oursStartLine: chunkOursStart, theirsStartLine: chunkTheirsStart
        })
      }
      
      setChunks(newChunks)
      
      // Default selections: none
      const initialSel: Record<number, { ours: boolean; theirs: boolean }> = {}
      newChunks.forEach(c => {
        if (c.type === 'conflict') initialSel[c.id] = { ours: false, theirs: false }
      })
      setSelections(initialSel)
      setLoading(false)
    })
  }, [file])

  const outputString = useMemo(() => {
    const out: string[] = []
    for (const c of chunks) {
      if (c.type === 'common') {
        out.push(...c.lines)
      } else {
        const sel = selections[c.id]
        if (sel?.ours) out.push(...c.ours)
        if (sel?.theirs) out.push(...c.theirs)
      }
    }
    // Remove the very last empty line if we appended it unnecessarily
    if (out.length > 0 && out[out.length - 1] === '') {
      out.pop()
    }
    return out.join('\n')
  }, [chunks, selections])

  const currentOutput = manualOutput !== null ? manualOutput : outputString

  const toggleSelection = (id: number, side: 'ours' | 'theirs') => {
    setSelections(prev => ({
      ...prev,
      [id]: { ...prev[id], [side]: !prev[id][side] }
    }))
    setManualOutput(null)
  }

  const handleSave = async () => {
    // resolveConflict takes filepath and the content string, overwrites it, and git adds it.
    const r = await window.gitAPI.resolveConflict(file, currentOutput)
    if (r.success) {
      showToast(`✓ ${file} résolu`)
      onFinish()
    } else {
      showToast(`Erreur: ${r.error}`, 'err')
    }
  }

  const handleScroll = (source: 'ours' | 'theirs' | 'output') => {
    if (isSyncing.current) return
    isSyncing.current = true

    let scrollLeft = 0
    if (source === 'ours' && oursRef.current) scrollLeft = oursRef.current.scrollLeft
    else if (source === 'theirs' && theirsRef.current) scrollLeft = theirsRef.current.scrollLeft
    else if (source === 'output' && outputRef.current) scrollLeft = outputRef.current.scrollLeft

    if (source !== 'ours' && oursRef.current) oursRef.current.scrollLeft = scrollLeft
    if (source !== 'theirs' && theirsRef.current) theirsRef.current.scrollLeft = scrollLeft
    if (source !== 'output' && outputRef.current) outputRef.current.scrollLeft = scrollLeft

    // Use requestAnimationFrame to reset the sync flag after the browser has applied the scroll updates
    requestAnimationFrame(() => {
      isSyncing.current = false
    })
  }

  const renderLines = (
    lines: string[], 
    startNum: number, 
    checkboxProps?: { checked: boolean; onChange: () => void }
  ) => {
    return lines.map((l, i) => (
      <div key={i} className="mt-line">
        <span className="mt-line-num">
          {i === 0 && checkboxProps && (
            <input 
              type="checkbox" 
              className="mt-line-checkbox"
              checked={checkboxProps.checked} 
              onChange={checkboxProps.onChange} 
            />
          )}
          {startNum + i}
        </span>
        <span className="mt-line-content">{l}</span>
      </div>
    ))
  }

  if (loading) {
    return <div className="mt-container"><div className="mt-loading">Chargement…</div></div>
  }

  const conflictChunks = chunks.filter(c => c.type === 'conflict')
  const resolvedCount = conflictChunks.filter(c => selections[c.id].ours || selections[c.id].theirs).length
  const totalConflicts = conflictChunks.length

  const oursGlobalName = conflictChunks[0]?.oursName || 'HEAD'
  const theirsGlobalName = conflictChunks[0]?.theirsName || 'Incoming'

  return (
    <div className="mt-container">
      <div className="mt-header">
        <div className="mt-header-left">
          <span className="cr-warning">⚠️</span>
          <span className="mt-filename">{file}</span>
          <span className="mt-count">({totalConflicts} conflict{totalConflicts > 1 ? 's' : ''})</span>
        </div>
        <div className="mt-header-right">
          <button className="mt-btn mt-btn-abort" onClick={onAbort}>✕ Annuler</button>
          <button className="mt-btn mt-btn-save" onClick={handleSave}>Enregistrer & Résoudre</button>
        </div>
      </div>

      <div className="mt-main">
        {/* Top Half: Ours / Theirs */}
        <div className="mt-top">
          {/* Ours Panel */}
          <div className="mt-pane mt-ours-pane">
            <div className="mt-pane-header">
              <div className="mt-badge mt-badge-ours">A</div>
              <span className="mt-pane-title">Nôtre ({oursGlobalName})</span>
            </div>
            <div className="mt-pane-content" ref={oursRef} onScroll={() => handleScroll('ours')}>
              {chunks.map((c, i) => {
                if (c.type === 'common') {
                  return <div key={i} className="mt-block-common">{renderLines(c.lines, c.oursStartLine)}</div>
                }
                const maxLines = Math.max(c.ours.length, c.theirs.length)
                return (
                  <div key={i} className={`mt-block-conflict mt-block-ours ${selections[c.id].ours ? 'selected' : ''}`} style={{ minHeight: `${maxLines * 20}px` }}>
                    <div className="mt-block-text">
                      {renderLines(c.ours, c.oursStartLine, { 
                        checked: selections[c.id].ours, 
                        onChange: () => toggleSelection(c.id, 'ours') 
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Theirs Panel */}
          <div className="mt-pane mt-theirs-pane">
            <div className="mt-pane-header">
              <div className="mt-badge mt-badge-theirs">B</div>
              <span className="mt-pane-title">Leur ({theirsGlobalName})</span>
            </div>
            <div className="mt-pane-content" ref={theirsRef} onScroll={() => handleScroll('theirs')}>
              {chunks.map((c, i) => {
                if (c.type === 'common') {
                  return <div key={i} className="mt-block-common">{renderLines(c.lines, c.theirsStartLine)}</div>
                }
                const maxLines = Math.max(c.ours.length, c.theirs.length)
                return (
                  <div key={i} className={`mt-block-conflict mt-block-theirs ${selections[c.id].theirs ? 'selected' : ''}`} style={{ minHeight: `${maxLines * 20}px` }}>
                    <div className="mt-block-text">
                      {renderLines(c.theirs, c.theirsStartLine, { 
                        checked: selections[c.id].theirs, 
                        onChange: () => toggleSelection(c.id, 'theirs') 
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Bottom Half: Output */}
        <div className="mt-bottom">
          <div className="mt-pane-header">
            <span className="mt-pane-title">Output ({resolvedCount} / {totalConflicts} résolus)</span>
            {manualOutput !== null && <span className="mt-manual-badge">Édition manuelle active</span>}
          </div>
          <div className="mt-output-wrapper">
            <div className="mt-output-line-numbers">
              {currentOutput.split('\n').map((_, i) => (
                <div key={i} className="mt-line-num">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={outputRef}
              onScroll={() => handleScroll('output')}
              className="mt-output-editor"
              value={currentOutput}
              onChange={e => setManualOutput(e.target.value)}
              spellCheck={false}
              wrap="off"
            />
          </div>
        </div>
      </div>
    </div>
  )
}