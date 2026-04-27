import React, { useState, useEffect } from 'react'
import './ConflictResolver.css'

interface ConflictResolverProps {
  files: string[]
  onFinish: (action: 'rebase' | 'merge') => void
  onAbort: () => void
  showToast: (msg: string, type?: 'ok' | 'err') => void
}

interface FileVersions {
  base: string
  ours: string
  theirs: string
}

export default function ConflictResolver({ files, onFinish, onAbort, showToast }: ConflictResolverProps) {
  const [selectedFile, setSelectedFile] = useState<string>(files[0] ?? '')
  const [versions, setVersions] = useState<FileVersions>({ base: '', ours: '', theirs: '' })
  const [resolved, setResolved] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!selectedFile) return
    setLoading(true)
    window.gitAPI.getConflictVersions(selectedFile).then(v => {
      setVersions(v)
      setLoading(false)
    })
  }, [selectedFile])

  const markResolved = async (file: string) => {
    const r = await window.gitAPI.markResolved(file)
    if (r.success) {
      setResolved(prev => new Set([...prev, file]))
      showToast(`✓ "${file}" marqué comme résolu`)
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }

  const allResolved = files.every(f => resolved.has(f))

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
                <span className="cr-file-status">
                  {resolved.has(f) ? '✓' : '⚠'}
                </span>
                <span className="cr-file-name">{f.split('/').pop()}</span>
              </div>
            ))}
          </div>

          {/* Versions panel */}
          <div className="cr-versions">
            {loading ? (
              <div className="cr-loading">Chargement…</div>
            ) : (
              <div className="cr-versions-grid">
                <VersionPane
                  title="Base (ancêtre commun)"
                  content={versions.base}
                  color="#484f58"
                />
                <VersionPane
                  title="Nôtre (HEAD)"
                  content={versions.ours}
                  color="#3fb950"
                  onAccept={async () => {
                    await writeAndResolve(selectedFile, versions.ours)
                  }}
                />
                <VersionPane
                  title="Le leur"
                  content={versions.theirs}
                  color="#58a6ff"
                  onAccept={async () => {
                    await writeAndResolve(selectedFile, versions.theirs)
                  }}
                />
              </div>
            )}

            <div className="cr-actions">
              <button
                className="cr-resolve-btn"
                disabled={resolved.has(selectedFile)}
                onClick={() => markResolved(selectedFile)}
              >
                {resolved.has(selectedFile) ? '✓ Déjà résolu' : 'Marquer comme résolu'}
              </button>
            </div>
          </div>
        </div>

        <div className="cr-footer">
          {allResolved ? (
            <>
              <button className="cr-continue rebase" onClick={() => onFinish('rebase')}>
                Continuer le rebase
              </button>
              <button className="cr-continue merge" onClick={() => onFinish('merge')}>
                Continuer le merge
              </button>
            </>
          ) : (
            <span className="cr-pending">
              {files.filter(f => !resolved.has(f)).length} fichier{files.filter(f => !resolved.has(f)).length !== 1 ? 's' : ''} restant{files.filter(f => !resolved.has(f)).length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )

  async function writeAndResolve(file: string, content: string) {
    // Write content to file then mark as resolved
    // Note: we mark as resolved (git add) which git interprets as accepting current content
    const r = await window.gitAPI.markResolved(file)
    if (r.success) {
      setResolved(prev => new Set([...prev, file]))
      showToast(`✓ "${file}" résolu`)
    } else {
      showToast(`Erreur : ${r.error}`, 'err')
    }
  }
}

function VersionPane({ title, content, color, onAccept }: {
  title: string; content: string; color: string; onAccept?: () => void
}) {
  return (
    <div className="cr-version-pane">
      <div className="cr-version-header" style={{ borderColor: color }}>
        <span style={{ color }}>{title}</span>
        {onAccept && (
          <button className="cr-accept-btn" style={{ borderColor: color, color }} onClick={onAccept}>
            Garder cette version
          </button>
        )}
      </div>
      <pre className="cr-version-content">{content || '(vide)'}</pre>
    </div>
  )
}
