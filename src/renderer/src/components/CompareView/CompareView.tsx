// CompareView — compare two refs (branches/tags/commits) in a standalone
// editor tab (GitLens "Search & Compare"-style). Ref selectors on top, the
// ahead/behind commit lists on the left, the full diff on the right.

import React, { useState, useEffect, useCallback } from 'react'
import DiffViewer from '../DiffViewer/DiffViewer'
import type { FileChange } from '../../types'
import './CompareView.css'

interface CompareCommit {
  hash: string
  shortHash: string
  message: string
}

// Untyped view of window.gitAPI (extension shim exposes extra methods).
const api: any = new Proxy({}, { get: (_t, p) => (window as any).gitAPI?.[p as string] })

export default function CompareView({ initialA, initialB }: { initialA?: string; initialB?: string }) {
  const [refs, setRefs] = useState<string[]>([])
  const [refA, setRefA] = useState(initialA ?? '')
  const [refB, setRefB] = useState(initialB ?? '')
  const [ahead, setAhead] = useState<CompareCommit[]>([])
  const [behind, setBehind] = useState<CompareCommit[]>([])
  const [diff, setDiff] = useState('')
  const [files, setFiles] = useState<FileChange[]>([])
  const [loading, setLoading] = useState(false)

  // Selector options: local + remote branches, then tags.
  useEffect(() => {
    Promise.all([api.getBranches(), api.getTags().catch(() => ({ tags: [] }))])
      .then(([b, t]: [{ branches?: { name: string; current: boolean }[] }, { tags?: { name: string }[] }]) => {
        const branchNames = (b?.branches ?? []).map(x => x.name.replace(/^remotes\//, ''))
        const tagNames = (t?.tags ?? []).map(x => x.name)
        setRefs([...new Set([...branchNames, ...tagNames])])
        const current = (b?.branches ?? []).find(x => x.current)?.name
        setRefA(prev => prev || current || '')
      })
      .catch(() => { /* repo not ready */ })
  }, [])

  useEffect(() => {
    if (!refA || !refB) { setAhead([]); setBehind([]); setDiff(''); setFiles([]); return }
    let stale = false
    setLoading(true)
    Promise.all([
      api.compareBranches(refA, refB),
      api.diffBetweenCommits(refA, refB),
      api.filesBetweenCommits(refA, refB),
    ]).then(([cmp, d, f]: any[]) => {
      if (stale) return
      setAhead(cmp?.ahead ?? [])
      setBehind(cmp?.behind ?? [])
      setDiff(d?.diff ?? '')
      setFiles(f?.files ?? [])
    }).catch(() => { /* invalid ref */ }).finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [refA, refB])

  const swap = useCallback(() => { setRefA(refB); setRefB(refA) }, [refA, refB])

  const renderRefSelect = (value: string, onChange: (v: string) => void) => (
    <select className="cv-ref-select" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">— choisir une référence —</option>
      {refs.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  )

  const renderCommitList = (title: string, list: CompareCommit[], accent: string) => (
    <div className="cv-commits-section">
      <div className="cv-commits-title" style={{ color: accent }}>
        {title} <span className="cv-commits-count">({list.length})</span>
      </div>
      {list.length === 0 && <div className="cv-commits-empty">Aucun commit</div>}
      {list.map(c => (
        <div key={c.hash} className="cv-commit">
          <code className="cv-commit-hash">{c.shortHash}</code>
          <span className="cv-commit-msg">{c.message}</span>
        </div>
      ))}
    </div>
  )

  const ready = refA && refB

  return (
    <div className="cv-page">
      <div className="cv-header">
        <span className="cv-title">⇄ Comparer</span>
        {renderRefSelect(refA, setRefA)}
        <button className="cv-swap" onClick={swap} title="Inverser les références">⇄</button>
        {renderRefSelect(refB, setRefB)}
        {ready && (
          <span className="cv-summary">
            <span className="cv-sum-ahead">+{ahead.length}</span> / <span className="cv-sum-behind">−{behind.length}</span> commits
          </span>
        )}
      </div>

      {!ready ? (
        <div className="cv-empty">Choisissez deux références à comparer</div>
      ) : (
        <div className="cv-body">
          <div className="cv-left">
            {renderCommitList(`Dans ${refB} seulement`, ahead, '#3fb950')}
            {renderCommitList(`Dans ${refA} seulement`, behind, '#f85149')}
          </div>
          <div className="cv-right">
            <DiffViewer
              commit={null}
              headerLabel={`${refA}..${refB}`}
              diff={diff}
              files={files}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
