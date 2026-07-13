// FileHistory — a file's history in a standalone editor tab (GitLens-style
// "Visual File History"): commit timeline on the left, per-commit diff or
// blame on the right. Opened by the VS Code extension via boot mode 'history'.

import React, { useState, useEffect, useCallback } from 'react'
import DiffViewer from '../DiffViewer/DiffViewer'
import type { CommitNode } from '../../types'
import './FileHistory.css'

interface HistoryEntry {
  hash: string
  shortHash: string
  message: string
  author: string
  date: string
}

interface BlameLine {
  hash: string
  shortHash: string
  author: string
  date: string
  lineNum: number
  content: string
}

// Untyped view of window.gitAPI — the extension shim exposes methods the
// desktop preload's typed surface doesn't declare.
const api: any = new Proxy({}, { get: (_t, p) => (window as any).gitAPI?.[p as string] })

function toCommitNode(e: HistoryEntry): CommitNode {
  return {
    hash: e.hash, shortHash: e.shortHash, message: e.message,
    author: e.author, authorEmail: '', date: e.date, parents: [], refs: [],
  }
}

export default function FileHistory({ file }: { file: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [selected, setSelected] = useState<HistoryEntry | null>(null)
  const [mode, setMode] = useState<'diff' | 'blame'>('diff')
  const [diff, setDiff] = useState('')
  const [blame, setBlame] = useState<BlameLine[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingPane, setLoadingPane] = useState(false)

  useEffect(() => {
    api.getFileHistory(file).then((r: { commits: HistoryEntry[] }) => {
      const commits = r?.commits ?? []
      setEntries(commits)
      setSelected(commits[0] ?? null)
      setLoadingList(false)
    }).catch(() => setLoadingList(false))
  }, [file])

  useEffect(() => {
    if (!selected) return
    let stale = false
    setLoadingPane(true)
    const load = mode === 'diff'
      ? api.getFileDiffAtCommit(selected.hash, file).then((r: { diff: string }) => { if (!stale) setDiff(r?.diff ?? '') })
      : api.getBlame(selected.hash, file).then((r: { lines: BlameLine[] }) => { if (!stale) setBlame(r?.lines ?? []) })
    load.catch(() => { /* deleted at this revision */ }).finally(() => { if (!stale) setLoadingPane(false) })
    return () => { stale = true }
  }, [selected, mode, file])

  const selectByHash = useCallback((hash: string) => {
    const found = entries.find(e => e.hash === hash || hash.startsWith(e.hash) || e.hash.startsWith(hash))
    if (found) setSelected(found)
  }, [entries])

  const relDate = (iso: string): string => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="fh-page">
      <div className="fh-header">
        <span className="fh-title">🕘 Historique</span>
        <code className="fh-file">{file}</code>
        <span className="fh-count">{entries.length} commit{entries.length > 1 ? 's' : ''}</span>
        <span className="fh-spring" />
        <div className="fh-toggle">
          <button className={mode === 'diff' ? 'active' : ''} onClick={() => setMode('diff')}>Diff</button>
          <button className={mode === 'blame' ? 'active' : ''} onClick={() => setMode('blame')}>Blame</button>
        </div>
        {api.openDiff && selected && (
          <button
            className="fh-native"
            title="Ouvrir le diff natif VS Code"
            onClick={() => api.openDiff({ type: 'commit', commitHash: selected.hash, filePath: file })}
          >
            ↗ Diff natif
          </button>
        )}
      </div>

      <div className="fh-body">
        <div className="fh-list">
          {loadingList && <div className="fh-empty">Chargement…</div>}
          {!loadingList && entries.length === 0 && <div className="fh-empty">Aucun historique pour ce fichier</div>}
          {entries.map(e => (
            <button
              key={e.hash}
              className={`fh-item ${selected?.hash === e.hash ? 'selected' : ''}`}
              onClick={() => setSelected(e)}
            >
              <div className="fh-item-top">
                <code className="fh-item-hash">{e.shortHash}</code>
                <span className="fh-item-date">{relDate(e.date)}</span>
              </div>
              <div className="fh-item-msg">{e.message}</div>
              <div className="fh-item-author">{e.author}</div>
            </button>
          ))}
        </div>

        <div className="fh-pane">
          {mode === 'diff' ? (
            <DiffViewer
              commit={selected ? toCommitNode(selected) : null}
              diff={diff}
              files={[]}
              loading={loadingPane}
            />
          ) : (
            <div className="fh-blame">
              {loadingPane && <div className="fh-empty">Chargement…</div>}
              {!loadingPane && blame.length === 0 && (
                <div className="fh-empty">Blame indisponible à cette révision</div>
              )}
              {!loadingPane && blame.map((l, i) => (
                <div key={i} className="fh-blame-line">
                  <button
                    className="fh-blame-hash"
                    title={`Voir ${l.shortHash}`}
                    onClick={() => selectByHash(l.hash)}
                  >
                    {l.shortHash}
                  </button>
                  <span className="fh-blame-author">{l.author}</span>
                  <span className="fh-blame-date">{l.date}</span>
                  <span className="fh-blame-num">{l.lineNum}</span>
                  <span className="fh-blame-content">{l.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
