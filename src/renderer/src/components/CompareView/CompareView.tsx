// CompareView — compare two refs (branches/tags/commits) in a standalone
// editor tab, in the "search & compare" shape. Ref selectors on top, the
// ahead/behind commit lists on the left, the full diff on the right.

import React, { useState, useEffect, useCallback } from 'react'
import DiffViewer from '../DiffViewer/DiffViewer'
import type { FileChange } from '../../types'
import { useLang } from '../../i18n/LanguageContext'
import { repoFromRemotes, remoteUrl, type RemoteRepo } from '../../utils/remoteUrl'
import { useCompareHistory, type SavedComparison } from '../../hooks/useCompareHistory'
import type { CompareAxis } from '../../types'
import './CompareView.css'

interface CompareCommit {
  hash: string
  shortHash: string
  message: string
}

// Untyped view of window.gitAPI (extension shim exposes extra methods).
const api: any = new Proxy({}, { get: (_t, p) => (window as any).gitAPI?.[p as string] })

/**
 * The value the target selector carries for "the working tree".
 *
 * A colon, because `git check-ref-format` forbids one in a refname: whatever a
 * branch or tag is called, it cannot collide with this.
 */
const WORKING = ':working'

export default function CompareView({ initialA, initialB, initialAxis, repoKey, onTitleChange }: {
  initialA?: string
  /** `null` opens against the working tree. */
  initialB?: string | null
  /**
   * Which question to open on. Branches want `diverged`; two commits picked by
   * hand want `endpoints`, because three-dot against an ancestor is empty and
   * the pair may well have been picked newest-first.
   */
  initialAxis?: CompareAxis
  /** Which repository's saved comparisons to show. Omitted ⇒ none are kept. */
  repoKey?: string | null
  /**
   * The comparison changed inside the view. The host names its tab from this:
   * the selectors are here, so the tab title would otherwise keep saying what
   * it was opened for long after you had moved on.
   */
  onTitleChange?: (title: string) => void
}) {
  const { t } = useLang()
  const [refs, setRefs] = useState<string[]>([])
  const [refA, setRefA] = useState(initialA ?? '')
  const [refB, setRefB] = useState(initialB === null ? WORKING : (initialB ?? ''))
  // Which question the diff answers. `diverged` by default because it is the
  // one the commit lists below already answer: two-dot would report every file
  // the other side gained since the split as a deletion, and claim this branch
  // removed files it never touched.
  const [axis, setAxis] = useState<CompareAxis>(initialAxis ?? 'diverged')
  const [mergeBase, setMergeBase] = useState<string | null>(null)
  const { history, remember, clear } = useCompareHistory(repoKey ?? null)
  const [ahead, setAhead] = useState<CompareCommit[]>([])
  const [behind, setBehind] = useState<CompareCommit[]>([])
  const [diff, setDiff] = useState('')
  const [files, setFiles] = useState<FileChange[]>([])
  // A commit picked from either list: the right pane shows that commit alone
  // until it is dropped. The lists were inert, which in a full-width tab means
  // two columns of commits that do nothing.
  const [picked, setPicked] = useState<CompareCommit | null>(null)
  const [pickedDiff, setPickedDiff] = useState<{ diff: string; files: FileChange[]; loading: boolean }>(
    { diff: '', files: [], loading: false })
  const [loading, setLoading] = useState(false)
  // This view is its own tab with no host around it, so it resolves the remote
  // itself rather than being handed one.
  const [remoteRepo, setRemoteRepo] = useState<RemoteRepo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const rem = await window.gitAPI.getRemotes()
        const def = await (window.gitAPI as any).getDefaultRemote?.().catch(() => null)
        if (alive) setRemoteRepo(repoFromRemotes(rem?.remotes ?? [], def?.remote))
      } catch { if (alive) setRemoteRepo(null) }
    })()
    return () => { alive = false }
  }, [])

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

  const against = refB === WORKING ? null : refB          // null = the working tree

  useEffect(() => {
    if (!refA || !refB) { setAhead([]); setBehind([]); setDiff(''); setFiles([]); setMergeBase(null); return }
    let stale = false
    setLoading(true)
    Promise.all([
      // The working tree has no commits of its own, so there is no ahead/behind
      // to draw against it — only a diff.
      against === null ? Promise.resolve({ ahead: [], behind: [] }) : api.compareBranches(refA, against),
      api.diffBetweenCommits(refA, against, axis),
      api.filesBetweenCommits(refA, against, axis),
      against === null ? Promise.resolve({ base: null }) : api.getMergeBase(refA, against).catch(() => ({ base: null })),
    ]).then(([cmp, d, f, mb]: any[]) => {
      if (stale) return
      setAhead(cmp?.ahead ?? [])
      setBehind(cmp?.behind ?? [])
      setDiff(d?.diff ?? '')
      setFiles(f?.files ?? [])
      setMergeBase(mb?.base ?? null)
    }).catch(() => { /* invalid ref */ }).finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [refA, refB, against, axis])

  useEffect(() => {
    if (!refA || !refB) return
    onTitleChange?.(`${refA} ${axis === 'diverged' ? '…' : '‥'} ${against === null ? t('cv.workingTree') : refB}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refA, refB, axis, against])

  // Remembered once the comparison has actually resolved, not on every
  // keystroke of the selectors: a pair nobody ever looked at is not history.
  useEffect(() => {
    if (!refA || !refB || loading) return
    remember({ a: refA, b: against, axis })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refA, refB, axis, loading])

  useEffect(() => {
    if (!picked) return
    let stale = false
    setPickedDiff({ diff: '', files: [], loading: true })
    Promise.all([api.getDiff(picked.hash), api.getCommitFiles(picked.hash)])
      .then(([d, f]: any[]) => {
        if (stale) return
        setPickedDiff({ diff: d?.diff ?? '', files: f?.files ?? [], loading: false })
      })
      .catch(() => { if (!stale) setPickedDiff({ diff: '', files: [], loading: false }) })
    return () => { stale = true }
  }, [picked])

  // Changing what is being compared drops the commit that was being read: it
  // belonged to the other comparison.
  useEffect(() => { setPicked(null) }, [refA, refB, axis])

  const swap = useCallback(() => {
    // Swapping with the working tree would mean "the working tree, compared to
    // a ref", which is the same comparison read backwards and has no ahead
    // list either; the button simply does not apply.
    if (refB === WORKING) return
    setRefA(refB); setRefB(refA)
  }, [refA, refB])

  const restore = useCallback((c: SavedComparison) => {
    setRefA(c.a); setRefB(c.b === null ? WORKING : c.b); setAxis(c.axis)
  }, [])
  const labelFor = (c: SavedComparison) =>
    `${c.a} ${c.axis === 'diverged' ? '…' : '‥'} ${c.b === null ? t('cv.workingTree') : c.b}`

  const renderRefSelect = (value: string, onChange: (v: string) => void, withWorking = false) => (
    <select className="cv-ref-select" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{t('cv.chooseRef')}</option>
      {withWorking && <option value={WORKING}>{t('cv.workingTree')}</option>}
      {refs.map(r => <option key={r} value={r}>{r}</option>)}
    </select>
  )

  const renderCommitList = (title: string, list: CompareCommit[], accent: string) => (
    <div className="cv-commits-section">
      <div className="cv-commits-title" style={{ color: accent }}>
        {title} <span className="cv-commits-count">({list.length})</span>
      </div>
      {list.length === 0 && <div className="cv-commits-empty">{t('cv.noCommit')}</div>}
      {list.map(c => (
        <button
          key={c.hash}
          className={`cv-commit ${picked?.hash === c.hash ? 'is-picked' : ''}`}
          onClick={() => setPicked(prev => prev?.hash === c.hash ? null : c)}
          title={t('cv.showCommit')}
        >
          <code className="cv-commit-hash">{c.shortHash}</code>
          <span className="cv-commit-msg">{c.message}</span>
        </button>
      ))}
    </div>
  )

  const ready = refA && refB
  // Who the comparison is *about*: `A...B` reports what B did. Naming it is
  // what turns an empty pane from "broken" into "nothing to show, and here is
  // where the commits actually are".
  const axisTargetLabel = against === null ? t('cv.workingTree') : refB
  const otherSideLabel = refA
  const otherSideCount = ahead.length > 0 ? ahead.length : behind.length

  return (
    <div className="cv-page">
      <div className="cv-header">
        <span className="cv-title">{t('cv.title')}</span>
        <span className="cv-role">{t('cv.roleBase')}</span>
        {renderRefSelect(refA, setRefA)}
        <button className="cv-swap" onClick={swap} title={t('cv.swapTitle')} disabled={refB === WORKING}>⇄</button>
        <span className="cv-role">{t('cv.roleSubject')}</span>
        {renderRefSelect(refB, setRefB, true)}
        {against !== null && (
          <span className="cv-axis" role="group" aria-label={t('cv.axisLabel')}>
            <button
              className={`cv-axis-btn ${axis === 'diverged' ? 'is-on' : ''}`}
              onClick={() => setAxis('diverged')}
              title={t('cv.axisDivergedTitle')}
            >{t('cv.axisDiverged')}</button>
            <button
              className={`cv-axis-btn ${axis === 'endpoints' ? 'is-on' : ''}`}
              onClick={() => setAxis('endpoints')}
              title={t('cv.axisEndpointsTitle')}
            >{t('cv.axisEndpoints')}</button>
          </span>
        )}
        {axis === 'diverged' && mergeBase && (
          <code className="cv-base" title={t('cv.baseTitle')}>{mergeBase.slice(0, 7)}</code>
        )}
        {ready && (
          <span className="cv-summary">
            <span className="cv-sum-ahead">+{ahead.length}</span> / <span className="cv-sum-behind">−{behind.length}</span> commits
          </span>
        )}
        {ready && remoteRepo && (
          <button
            className="cv-copy-link"
            title={t('cv.copyLink')}
            onClick={() => {
              navigator.clipboard.writeText(remoteUrl.compare(remoteRepo, refA, refB))
              setCopied(true)
              setTimeout(() => setCopied(false), 1800)
            }}
          >
            {copied ? t('cv.linkCopied') : t('cv.copyLink')}
          </button>
        )}
      </div>

      {ready && (
        <div className="cv-reading">
          {against === null
            ? t('cv.readingWorking', refA)
            : axis === 'diverged'
              ? t('cv.readingDiverged', refB, refA)
              : t('cv.readingEndpoints', refA, refB)}
        </div>
      )}

      {history.length > 1 && (
        <div className="cv-history">
          <span className="cv-history-label">{t('cv.recent')}</span>
          {history.map((c, i) => (
            <button key={i} className="cv-history-chip" onClick={() => restore(c)} title={labelFor(c)}>
              {labelFor(c)}
            </button>
          ))}
          <button className="cv-history-clear" onClick={clear}>{t('cv.clearRecent')}</button>
        </div>
      )}

      {!ready ? (
        <div className="cv-empty">{t('cv.chooseTwo')}</div>
      ) : (
        <div className="cv-body">
          <div className="cv-left">
            {renderCommitList(t('cv.inOnly', refB), ahead, 'var(--success)')}
            {renderCommitList(t('cv.inOnly', refA), behind, 'var(--danger)')}
          </div>
          <div className="cv-right">
            {picked ? (
              <>
                <div className="cv-picked-bar">
                  <span className="cv-picked-label">
                    <code>{picked.shortHash}</code> {picked.message}
                  </span>
                  <button className="cv-picked-back" onClick={() => setPicked(null)}>
                    {t('cv.backToComparison')}
                  </button>
                </div>
                <DiffViewer
                  commit={null}
                  headerLabel={picked.shortHash}
                  diff={pickedDiff.diff}
                  files={pickedDiff.files}
                  loading={pickedDiff.loading}
                />
              </>
            ) : !loading && !diff.trim() && (ahead.length > 0 || behind.length > 0) ? (
              // Empty, with commits listed beside it: that is the axis doing its
              // job, not a failure. `A...B` is what B did since the fork, and
              // here B has done nothing — the commits are all on the other side.
              <div className="cv-explain">
                <p className="cv-explain-lead">{t('cv.emptyLead', axisTargetLabel)}</p>
                <p className="cv-explain-why">{t('cv.emptyWhy', otherSideLabel, otherSideCount)}</p>
                <button className="cv-explain-action" onClick={swap} disabled={refB === WORKING}>
                  {t('cv.emptySwap')}
                </button>
              </div>
            ) : (
              <DiffViewer
                commit={null}
                headerLabel={against === null
                  ? `${refA} → ${t('cv.workingTree')}`
                  : `${refA}${axis === 'diverged' ? '...' : '..'}${refB}`}
                diff={diff}
                files={files}
                loading={loading}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
