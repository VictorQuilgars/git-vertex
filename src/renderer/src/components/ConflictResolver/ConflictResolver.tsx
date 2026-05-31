import React, { useState, useEffect } from 'react'
import './ConflictResolver.css'

interface ConflictResolverProps {
  files: string[]
  mode: 'merge' | 'rebase' | 'cherry-pick' | 'revert' | null
  onFinish: () => void
  onAbort: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

interface FileVersions {
  base: string
  ours: string
  theirs: string
}

export default function ConflictResolver({ files, mode, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const selectedFile = files[0] ?? ''
  const [versions, setVersions] = useState<FileVersions>({ base: '', ours: '', theirs: '' })
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

  const handleResolved = () => {
    onFinish()
  }

  // Take a whole side via `git checkout --ours/--theirs` (clean, no markers).
  const keepSide = async (side: 'ours' | 'theirs') => {
    const r = await window.gitAPI.resolveConflictSide(selectedFile, side)
    if (r.success) {
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (${side === 'ours' ? 'nôtre' : 'leur'})`)
      handleResolved()
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  // Take the common ancestor content.
  const keepBase = async () => {
    const r = await window.gitAPI.resolveConflict(selectedFile, versions.base)
    if (r.success) {
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (base)`)
      handleResolved()
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
      showToast(`✓ « ${selectedFile.split('/').pop()} » résolu (édition manuelle)`)
      handleResolved()
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  return (
    <div className="cr-overlay">
      <div className="cr-panel" style={{ maxWidth: '90vw', height: '90vh' }}>
        <div className="cr-header">
          <span className="cr-warning">⚠️</span>
          <span className="cr-title">Résolution : {selectedFile}</span>
          <button className="cr-abort" onClick={onAbort}>Fermer</button>
        </div>

        <div className="cr-body">
          {/* Versions panel */}
          <div className="cr-versions">
            {loading ? (
              <div className="cr-loading">Chargement…</div>
            ) : editing ? (
              <div className="cr-manual" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="cr-manual-header" style={{ flexShrink: 0 }}>
                  <span>Édition manuelle — supprimez les marqueurs et gardez le contenu voulu</span>
                  <button className="cr-manual-back" onClick={() => setEditing(false)}>← Retour aux versions</button>
                </div>
                <textarea
                  className="cr-manual-editor"
                  style={{ flex: 1, resize: 'none' }}
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
          </div>
        </div>

        <div className="cr-footer">
          {editing ? (
            <button className="cr-continue merge" onClick={saveManual}>
              Enregistrer & résoudre
            </button>
          ) : (
            <button className="cr-continue rebase" onClick={() => setEditing(true)}>
              ✎ Édition manuelle…
            </button>
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
