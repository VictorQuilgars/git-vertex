import React, { useState, useEffect, useMemo } from 'react'
import './ConflictResolver.css'

interface ConflictResolverProps {
  file: string
  // A proposed resolution to preload into the manual editor on open (e.g.
  // from an AI agent via the MCP server's open_in_git_vertex) — review-only,
  // nothing is written until the user clicks "Enregistrer & Résoudre".
  initialProposal?: string
  onFinish: () => void
  onAbort: () => void
  showToast: (msg: string, type?: 'ok' | 'err', action?: { label: string; onClick: () => void }) => void
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

// Tries to express a proposed resolution (e.g. from an AI agent) as a
// combination of WHOLE ours/theirs/base lines per chunk, so the native
// per-line click UI (checkmarks, "N/M lignes", highlighting) can drive it
// from the start — the user then fine-tunes by clicking exactly as they
// would unaided, instead of being stuck with a disconnected text blob.
// Returns null if the proposal doesn't decompose exactly this way (e.g. the
// agent rewrote/merged wording that matches neither side verbatim) — the
// caller then falls back to showing it as free text.
//
// Real backtracking, not a greedy scan: for an ambiguous chunk (e.g. "keep
// both" where ours happens to also be a valid standalone prefix), picking
// the first locally-matching candidate can dead-end later chunks even
// though a full decomposition exists — so on failure we rewind and try the
// next candidate. Chunk/candidate counts are small (a handful of conflicts,
// 5 candidates each), so this is cheap.
function matchesAt(propLines: string[], pos: number, candidate: string[]): boolean {
  if (pos + candidate.length > propLines.length) return false
  for (let i = 0; i < candidate.length; i++) {
    if (propLines[pos + i] !== candidate[i]) return false
  }
  return true
}

function reconcileFrom(chunks: Chunk[], propLines: string[], chunkIdx: number, pos: number, acc: Selections): Selections | null {
  if (chunkIdx === chunks.length) return pos === propLines.length ? acc : null
  const c = chunks[chunkIdx]
  if (c.type === 'common') {
    if (!matchesAt(propLines, pos, c.lines)) return null
    return reconcileFrom(chunks, propLines, chunkIdx + 1, pos + c.lines.length, acc)
  }
  const oursSel: LineRef[] = c.ours.map((_, i) => ({ side: 'ours', index: i }))
  const theirsSel: LineRef[] = c.theirs.map((_, i) => ({ side: 'theirs', index: i }))
  const candidates: { lines: string[]; sel: LineRef[] }[] = [
    { lines: c.ours, sel: oursSel },
    { lines: c.theirs, sel: theirsSel },
    { lines: [...c.ours, ...c.theirs], sel: [...oursSel, ...theirsSel] },
    { lines: [...c.theirs, ...c.ours], sel: [...theirsSel, ...oursSel] },
    { lines: c.base, sel: [] }, // neither side — matches the UI's own "no selection" default
  ]
  for (const cand of candidates) {
    if (!matchesAt(propLines, pos, cand.lines)) continue
    const result = reconcileFrom(chunks, propLines, chunkIdx + 1, pos + cand.lines.length, { ...acc, [c.id]: cand.sel })
    if (result) return result
  }
  return null
}

function reconcileProposalToSelections(chunks: Chunk[], proposalText: string): Selections | null {
  let propLines = proposalText.split('\n')
  // outputString/outputLines drop one trailing empty line — mirror that so
  // a final newline doesn't spuriously break the match.
  if (propLines.length > 0 && propLines[propLines.length - 1] === '') propLines = propLines.slice(0, -1)

  // The parsed file's own very last chunk often ends with a single ''
  // line — the split('\n') artifact of the conflicted file's own trailing
  // newline, not real content. outputLines silently drops that same
  // artifact when building its own output, so a faithful proposal never
  // reproduces it either — match against a copy with it trimmed too, or
  // an otherwise-perfect proposal (e.g. "keep both" on the last conflict)
  // would fail to reconcile for a reason invisible in the file itself.
  let matchChunks = chunks
  const last = chunks[chunks.length - 1]
  if (last?.type === 'common' && last.lines.length > 0 && last.lines[last.lines.length - 1] === '') {
    matchChunks = chunks.slice(0, -1).concat([{ ...last, lines: last.lines.slice(0, -1) }])
  }

  return reconcileFrom(matchChunks, propLines, 0, 0, {})
}

export default function ConflictResolver({ file, initialProposal, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [selections, setSelections] = useState<Selections>({})
  const [manualOutput, setManualOutput] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // AI-assisted resolution: optional guidance + busy flag. The proposal lands
  // in the manual-edit output so the user reviews it before saving; the
  // model's explanation of its choices is shown under the AI bar.
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)
  // Rich side labels ("main · a1b2c3 — subject") resolved from the repo state.
  const [sides, setSides] = useState<{ ours: string; theirs: string } | null>(null)

  useEffect(() => {
    ;(window.gitAPI as any).getConflictSides?.()
      .then((s: { ours: string; theirs: string }) => { if (s?.ours || s?.theirs) setSides(s) })
      .catch(() => {})
  }, [file])

  const runAiResolve = async () => {
    setAiBusy(true)
    try {
      const r = await (window.gitAPI as any).aiResolveConflict(file, aiInstruction)
      if (r.error) {
        showToast(r.error === 'NO_API_KEY' ? 'Aucune clé API IA configurée — voir Réglages → IA' : r.error, 'err')
        return
      }
      setManualOutput(r.resolution)
      setAiExplanation(r.explanation || null)
      showToast('Proposition IA chargée dans l\'output — vérifiez puis enregistrez')
    } catch (e: any) {
      showToast(e?.message ?? 'Erreur IA', 'err')
    } finally {
      setAiBusy(false)
    }
  }

  const oursRef = React.useRef<HTMLDivElement>(null)
  const theirsRef = React.useRef<HTMLDivElement>(null)
  const isSyncing = React.useRef(false)

  // Raw on-disk content behind the chunks currently displayed, so a watcher
  // event can tell an actual external rewrite from unrelated worktree noise.
  const loadedRawRef = React.useRef<string | null>(null)
  // Set as soon as the user picks a line or types in the free-text editor —
  // an external reload must never silently discard their work.
  const userEditedRef = React.useRef(false)

  const load = React.useCallback((applyProposal: boolean) => {
    setLoading(true)
    setManualOutput(null)
    Promise.all([
      window.gitAPI.getFileContent(file),
      window.gitAPI.getConflictVersions(file),
    ]).then(([fileRes, versionsRes]) => {
      if (fileRes.error) { showToast(fileRes.error, 'err'); return }
      const raw = fileRes.content || ''
      loadedRawRef.current = raw
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
      let initialSel: Selections = {}
      newChunks.forEach(c => { if (c.type === 'conflict') initialSel[c.id] = [] })

      if (applyProposal && initialProposal != null) {
        const reconciled = reconcileProposalToSelections(newChunks, initialProposal)
        if (reconciled) {
          // Proposal maps cleanly onto whole ours/theirs/base lines — seed
          // the checkboxes so clicking a line adjusts it, exactly like a
          // manual resolution, instead of wiping a disconnected text blob.
          initialSel = { ...initialSel, ...reconciled }
          showToast('Proposition de l\'agent chargée — ajustez en cliquant sur les lignes si besoin, puis Enregistrer & Résoudre')
        } else {
          // Doesn't decompose into whole lines from either side (the agent
          // rewrote/merged wording) — free-text edit is the only option.
          setManualOutput(initialProposal)
          showToast('Proposition de l\'agent chargée en édition libre (le texte ne correspond pas exactement à un des deux côtés ligne par ligne)')
        }
      }
      setSelections(initialSel)
      setLoading(false)
    })
    // initialProposal is intentionally a one-shot preload tied to opening
    // this file (from a deep link), not a value to re-apply on every change.
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    userEditedRef.current = false
    load(true)
  }, [load])

  // The file can be rewritten under us while the resolver is open — typically
  // an agent calling the MCP server's resolve_conflict on the very file being
  // displayed. Without this the view keeps showing the stale pre-write chunks.
  // (A file that stops being conflicted entirely is handled upstream in
  // App.tsx, which closes or moves the resolver on.)
  useEffect(() => {
    const handler = async () => {
      const r = await window.gitAPI.getFileContent(file)
      if (r.error) return
      const raw = r.content || ''
      if (raw === loadedRawRef.current) return
      if (userEditedRef.current) {
        // Reloading here would throw away line picks the user already made,
        // so leave the view alone and let them decide.
        loadedRawRef.current = raw
        showToast(
          `${file} a été modifié en dehors de l'app — vos sélections sont conservées`,
          'err',
          { label: 'Recharger', onClick: () => { userEditedRef.current = false; load(false) } },
        )
        return
      }
      load(false)
      showToast(`${file} a été modifié en dehors de l'app — vue rechargée`)
    }
    window.gitAPI.onWorkingChanged(handler)
    window.gitAPI.onRepoChanged(handler)
    return () => {
      window.gitAPI.offWorkingChanged(handler)
      window.gitAPI.offRepoChanged(handler)
    }
  }, [file, load, showToast])

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
    userEditedRef.current = true
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
    userEditedRef.current = true
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
    userEditedRef.current = true
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
          <span className="mt-pane-title" title={isOurs ? (sides?.ours || oursGlobalName) : (sides?.theirs || theirsGlobalName)}>
            {isOurs
              ? (sides?.ours || `Nôtre (${oursGlobalName})`)
              : (sides?.theirs || `Leur (${theirsGlobalName})`)}
          </span>
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
          <button className="mt-btn" onClick={async () => {
            const r = await (window.gitAPI as any).openInEditor(file)
            if (!r.success) showToast(`Erreur : ${r.error ?? 'éditeur introuvable'}`, 'err')
          }} title="Ouvrir dans l'éditeur externe configuré">↗ Éditeur externe</button>
          <button className="mt-btn mt-btn-abort" onClick={onAbort}>✕ Fermer</button>
          <button className="mt-btn mt-btn-save" onClick={handleSave}>Enregistrer & Résoudre</button>
        </div>
      </div>

      {/* AI resolution bar — proposal goes to the manual output for review */}
      <div className="mt-ai-bar">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="mt-ai-icon"><path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-6.5 6.5a1.516 1.516 0 0 1-2.56-1.31L5.811 10.5H3.688c-1.57 0-2.347-1.909-1.22-3.004l6.5-6.5.536-.565z"/></svg>
        <input
          className="mt-ai-input"
          type="text"
          placeholder="Qu'est-ce qui cloche ? ex : « garde le nouvel import, retire l'ancien » (optionnel)"
          value={aiInstruction}
          onChange={e => setAiInstruction(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !aiBusy) runAiResolve() }}
          disabled={aiBusy}
        />
        <button className="mt-btn mt-btn-ai" onClick={runAiResolve} disabled={aiBusy}>
          {aiBusy ? 'IA en cours…' : manualOutput !== null ? '↻ Réessayer avec l\'IA' : '✨ Résoudre avec l\'IA'}
        </button>
      </div>

      {/* AI explanation of its resolution choices */}
      {aiExplanation && (
        <div className="mt-ai-explain">
          <span className="mt-ai-explain-text">💬 {aiExplanation}</span>
          <button className="mt-ai-explain-close" onClick={() => setAiExplanation(null)}>✕</button>
        </div>
      )}

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
                onChange={e => { userEditedRef.current = true; setManualOutput(e.target.value) }}
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
