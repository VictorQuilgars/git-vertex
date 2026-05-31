import React, { useState, useEffect } from 'react'
import './ConflictResolver.css'

interface ConflictResolverProps {
  files: string[]
  mode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onFinish: (action: 'rebase' | 'merge') => void
  onAbort: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

interface FileVersions {
  base: string
  ours: string
  theirs: string
}

export default function ConflictResolver({ files, mode, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [selectedFile, setSelectedFile] = useState<string>(files[0] ?? '')
  const [versions, setVersions] = useState<FileVersions>({ base: '', ours: '', theirs: '' })
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  // Manual editor buffer — lets the user hand-merge the two sides
  const [editor, setEditor] = useState<string>('')
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true)
    setEditing(false)
    window.gitAPI.getConflictVersions(selectedFile).then(v => {
      setVersions(v)
      // Seed the manual editor with a unified view of both sides so the user
      // can delete what they don't want rather than starting from scratch.
      setEditor(
        `<<<<<<< OURS (HEAD)\n${v.ours}${v.ours.endsWith('\n') ? '' : '\n'}` +
        `=======\n${v.theirs}${v.theirs.endsWith('\n') ? '' : '\n'}` +
        `>>>>>>> THEIRS\n`
      )
      setLoading(false)
    })
  }, [selectedFile])

  const markStateResolved = (file: string) => {
    setResolved(prev => new Set([...prev, file]))
    // Auto-advance to the next unresolved file
    const next = files.find(f => f !== file && !resolved.has(f))
    if (next) setSelectedFile(next)
  }

  // Take a whole side via `git checkout --ours/--theirs` (clean, no markers).
  const keepSide = async (side: 'ours' | 'theirs') => {
    const r = await window.gitAPI.resolveConflictSide(selectedFile, side)
    if (r.success) {
      markStateResolved(selectedFile)
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (${side === 'ours' ? 'nôtre' : 'leur'})`)
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  // Take the common ancestor content.
  const keepBase = async () => {
    const r = await window.gitAPI.resolveConflict(selectedFile, versions.base)
    if (r.success) {
      markStateResolved(selectedFile)
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (base)`)
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  // Save the manually edited content (must no longer contain conflict markers).
  const saveManual = async () => {
    if (/^(<{7}|={7}|>{7})/m.test(editor)) {
      showToast('Des marqueurs de conflit (<<<<<<<, =======, >>>>>>>) sont encore présents', 'err')
      return
    }
    const r = await window.gitAPI.resolveConflict(selectedFile, editor)
    if (r.success) {
      markStateResolved(selectedFile)
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (édition manuelle)`)
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const allResolved = files.every(f => resolved.has(f))
  const remaining = files.filter(f => !resolved.has(f)).length

  return (
    <div className="cr-overlay">
      <div className="cr-panel">
        <div className="cr-header">
          <span className="cr-warning">⚠️</span>
          <span className="cr-title">{files.length} fichier{files.length !== 1 ? 's' : ''} en conflit</span>
          <button className="cr-abort" onClick={onAbort}>Abandonner</button>
        </div>

        <div className="cr-body">
          {/* File list */}
          <div className="cr-file-list">
            {files.map(f => (
              <div
                key={f}
                className={`cr-file-item ${selectedFile === f ? 'active' : ''} ${resolved.has(f) ? 'resolved' : ''}`}
                onClick={() => setSelectedFile(f)}
              >
                <span className="cr-file-status">{resolved.has(f) ? '✓' : '⚠'}</span>
                <span className="cr-file-name">{f.split('/').pop()}</span>
              </div>
            ))}
          </div>

          {/* Versions panel */}
          <div className="cr-versions">
            {loading ? (
              <div className="cr-loading">Chargement…</div>
            ) : editing ? (
              <div className="cr-manual">
                <div className="cr-manual-header">
                  <span>Édition manuelle — supprimez les marqueurs et gardez le contenu voulu</span>
                  <button className="cr-manual-back" onClick={() => setEditing(false)}>← Retour aux versions</button>
                </div>
                <textarea
                  className="cr-manual-editor"
                  value={editor}
                  onChange={e => setEditor(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ) : (
              <div className="cr-versions-grid">
                <VersionPane
                  title="Base (ancêtre commun)"
                  content={versions.base}
                  color="#484f58"
                  acceptLabel="Garder la base"
                  onAccept={keepBase}
                />
                <VersionPane
                  title="Nôtre (HEAD)"
                  content={versions.ours}
                  color="#3fb950"
                  acceptLabel="Garder le nôtre"
                  onAccept={() => keepSide('ours')}
                />
                <VersionPane
                  title="Le leur"
                  content={versions.theirs}
                  color="#58a6ff"
                  acceptLabel="Garder le leur"
                  onAccept={() => keepSide('theirs')}
                />
              </div>
            )}

            <div className="cr-actions">
              {editing ? (
                <button className="cr-resolve-btn" onClick={saveManual}>
                  Enregistrer &amp; résoudre
                </button>
              ) : (
                <button
                  className="cr-resolve-btn cr-manual-btn"
                  disabled={resolved.has(selectedFile)}
                  onClick={() => setEditing(true)}
                >
                  ✎ Édition manuelle…
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="cr-footer">
          {allResolved ? (
            <>
              {(mode === 'rebase' || mode === 'cherry-pick' || mode === 'revert' || !mode) && (
                <button className="cr-continue rebase" onClick={() => onFinish('rebase')}>
                  Continuer le {mode || 'rebase'}
                </button>
              )}
              {(mode === 'merge' || !mode) && (
                <button className="cr-continue merge" onClick={() => onFinish('merge')}>
                  Continuer le merge
                </button>
              )}
            </>
          ) : (
            <span className="cr-pending">
              {remaining} fichier{remaining !== 1 ? 's' : ''} restant{remaining !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function VersionPane({ title, content, color, acceptLabel, onAccept }: {
  title: string; content: string; color: string; acceptLabel: string; onAccept: () => void
}) {
  return (
    <div className="cr-version-pane">
      <div className="cr-version-header" style={{ borderColor: color }}>
        <span style={{ color }}>{title}</span>
        <button className="cr-accept-btn" style={{ borderColor: color, color }} onClick={onAccept}>
          {acceptLabel}
        </button>
      </div>
      <pre className="cr-version-content">{content || '(vide)'}</pre>
    </div>
  )
}
